package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"goanna/apps/api/ent"
	"goanna/apps/api/ent/checkresult"
	"goanna/apps/api/ent/monitor"
	"goanna/apps/api/ent/monitorruntime"
	"goanna/apps/api/ent/notificationchannel"
	"goanna/apps/api/ent/notificationevent"
	"goanna/apps/api/ent/systemconfig"
	selectorutil "goanna/apps/api/internal/selector"

	"github.com/go-telegram/bot"
	"github.com/robfig/cron/v3"
	"golang.org/x/net/publicsuffix"
)

const (
	globalConfigKey                = "global"
	defaultChecksHistoryKeep       = 200
	defaultCronTimezone            = "UTC"
	requiredRuntimeTimezone        = "timezone"
	maxMonitorChecksLimit          = 500
	maxResponseStringBytes         = 16 * 1024
	maxSelectorPreviewBytes        = 4 * 1024
	maxTestResponseBodyBytes       = 4 * 1024
	DefaultMaxSelectorPayloadBytes = 24 * 1024 * 1024
	selectorPayloadTTL             = 10 * time.Minute
	selectorPayloadCacheSize       = 8
	testRequestTimeout             = 20 * time.Second
	truncationSuffix               = "... [truncated]"
	telegramTestMessage            = "Goanna test notification"
)

type Config struct {
	MaxSelectorPayloadBytes int
}

type Server struct {
	db                      *ent.Client
	maxSelectorPayloadBytes int

	selectorPayloadsMu sync.Mutex
	selectorPayloads   map[string]selectorPayloadEntry
}

type selectorPayloadEntry struct {
	payload   []byte
	expiresAt time.Time
}

func New(db *ent.Client) *Server {
	return NewWithConfig(db, Config{})
}

func NewWithConfig(db *ent.Client, config Config) *Server {
	maxSelectorPayloadBytes := config.MaxSelectorPayloadBytes
	if maxSelectorPayloadBytes <= 0 {
		maxSelectorPayloadBytes = DefaultMaxSelectorPayloadBytes
	}

	return &Server{
		db:                      db,
		maxSelectorPayloadBytes: maxSelectorPayloadBytes,
		selectorPayloads:        map[string]selectorPayloadEntry{},
	}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /v1/monitors", s.handleListMonitors)
	mux.HandleFunc("POST /v1/monitors", s.handleCreateMonitor)
	mux.HandleFunc("PUT /v1/monitors/{monitorId}", s.handleUpdateMonitor)
	mux.HandleFunc("DELETE /v1/monitors/{monitorId}", s.handleDeleteMonitor)
	mux.HandleFunc("POST /v1/monitors/{monitorId}/trigger", s.handleTriggerMonitor)
	mux.HandleFunc("POST /v1/monitors/test", s.handleTestMonitorURL)
	mux.HandleFunc("POST /v1/monitors/selector-preview", s.handlePreviewMonitorSelector)
	mux.HandleFunc("GET /v1/monitors/{monitorId}/checks", s.handleListMonitorChecks)
	mux.HandleFunc("GET /v1/settings/notifications/telegram", s.handleGetTelegramSettings)
	mux.HandleFunc("PUT /v1/settings/notifications/telegram", s.handleUpsertTelegramSettings)
	mux.HandleFunc("POST /v1/settings/notifications/telegram/test", s.handleTestTelegramSettings)
	mux.HandleFunc("GET /v1/settings/runtime", s.handleGetRuntimeSettings)
	mux.HandleFunc("PUT /v1/settings/runtime", s.handleUpsertRuntimeSettings)
}

type healthResponse struct {
	Status string `json:"status"`
}

type monitorResponse struct {
	ID                   int64      `json:"id"`
	Label                *string    `json:"label,omitempty"`
	Method               string     `json:"method"`
	URL                  string     `json:"url"`
	IconURL              string     `json:"iconUrl"`
	Body                 *string    `json:"body,omitempty"`
	Headers              kvMap      `json:"headers"`
	Auth                 kvMap      `json:"auth"`
	NotificationChannels []string   `json:"notificationChannels"`
	Selector             *string    `json:"selector,omitempty"`
	ExpectedType         string     `json:"expectedType"`
	ExpectedResponse     *string    `json:"expectedResponse,omitempty"`
	Cron                 string     `json:"cron"`
	Enabled              bool       `json:"enabled"`
	Status               string     `json:"status"`
	CheckCount           int64      `json:"checkCount"`
	NextRunAt            *time.Time `json:"nextRunAt,omitempty"`
	LastCheckAt          *time.Time `json:"lastCheckAt,omitempty"`
	LastSuccessAt        *time.Time `json:"lastSuccessAt,omitempty"`
	LastErrorAt          *time.Time `json:"lastErrorAt,omitempty"`
	LastStatusCode       *int       `json:"lastStatusCode,omitempty"`
	LastDurationMs       *int       `json:"lastDurationMs,omitempty"`
	LastErrorMessage     *string    `json:"lastErrorMessage,omitempty"`
	CreatedAt            time.Time  `json:"createdAt"`
	UpdatedAt            time.Time  `json:"updatedAt"`
}

type createMonitorRequest struct {
	Label                *string           `json:"label"`
	Method               string            `json:"method"`
	URL                  string            `json:"url"`
	IconURL              *string           `json:"iconUrl"`
	Body                 *string           `json:"body"`
	Headers              map[string]string `json:"headers"`
	Auth                 map[string]string `json:"auth"`
	NotificationChannels []string          `json:"notificationChannels"`
	Selector             *string           `json:"selector"`
	ExpectedType         string            `json:"expectedType"`
	ExpectedResponse     *string           `json:"expectedResponse"`
	Cron                 string            `json:"cron"`
	Enabled              *bool             `json:"enabled"`
}

type normalizedMonitorRequest struct {
	label                *string
	method               string
	url                  string
	iconURL              string
	body                 *string
	headers              map[string]string
	auth                 map[string]string
	notificationChannels []string
	selector             *string
	expectedType         string
	expectedResponse     *string
	cronExpr             string
	enabled              bool
}

type testMonitorRequest struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Body    *string           `json:"body"`
	Headers map[string]string `json:"headers"`
	Auth    map[string]string `json:"auth"`
}

type testMonitorResponse struct {
	OK                   bool              `json:"ok"`
	Status               int               `json:"status"`
	StatusText           string            `json:"statusText"`
	Headers              map[string]string `json:"headers"`
	Body                 any               `json:"body"`
	SelectorPayloadToken *string           `json:"selectorPayloadToken,omitempty"`
}

type selectorPreviewRequest struct {
	JSON     string  `json:"json"`
	Token    *string `json:"token"`
	Selector *string `json:"selector"`
}

type selectorPreviewResponse struct {
	Exists bool    `json:"exists"`
	Type   string  `json:"type"`
	Raw    *string `json:"raw,omitempty"`
	Value  *string `json:"value,omitempty"`
}

type telegramSettingsRequest struct {
	Enabled  *bool  `json:"enabled"`
	BotToken string `json:"botToken"`
	ChatID   string `json:"chatId"`
}

type telegramSettingsResponse struct {
	Enabled   bool       `json:"enabled"`
	BotToken  string     `json:"botToken"`
	ChatID    string     `json:"chatId"`
	UpdatedAt *time.Time `json:"updatedAt"`
}

type testTelegramSettingsRequest struct {
	BotToken string  `json:"botToken"`
	ChatID   string  `json:"chatId"`
	Message  *string `json:"message"`
}

type testTelegramSettingsResponse struct {
	OK bool `json:"ok"`
}

type runtimeSettingsRequest struct {
	ChecksHistoryLimit int    `json:"checksHistoryLimit"`
	Timezone           string `json:"timezone"`
}

type runtimeSettingsResponse struct {
	ChecksHistoryLimit int        `json:"checksHistoryLimit"`
	Timezone           *string    `json:"timezone,omitempty"`
	RequiredSettings   []string   `json:"requiredSettings"`
	UpdatedAt          *time.Time `json:"updatedAt"`
}

type monitorCheckResponse struct {
	ID             int64     `json:"id"`
	Status         string    `json:"status"`
	StatusCode     *int      `json:"statusCode,omitempty"`
	ResponseTimeMs *int      `json:"responseTimeMs,omitempty"`
	ErrorMessage   *string   `json:"errorMessage,omitempty"`
	SelectionType  *string   `json:"selectionType,omitempty"`
	SelectionValue *string   `json:"selectionValue,omitempty"`
	DiffChanged    bool      `json:"diffChanged"`
	DiffKind       *string   `json:"diffKind,omitempty"`
	DiffSummary    *string   `json:"diffSummary,omitempty"`
	DiffDetails    *string   `json:"diffDetails,omitempty"`
	CheckedAt      time.Time `json:"checkedAt"`
}

type kvMap map[string]string

func (m kvMap) MarshalJSON() ([]byte, error) {
	if m == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(map[string]string(m))
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func (s *Server) handleListMonitors(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Monitor.Query().WithRuntime().All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list monitors")
		return
	}

	response := make([]monitorResponse, 0, len(rows))
	for _, row := range rows {
		response = append(response, mapMonitor(row, row.Edges.Runtime))
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleCreateMonitor(w http.ResponseWriter, r *http.Request) {
	var req createMonitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	input, err := normalizeMonitorRequest(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	create := s.db.Monitor.Create().
		SetMethod(input.method).
		SetURL(input.url).
		SetIconURL(input.iconURL).
		SetCron(input.cronExpr).
		SetExpectedType(monitor.ExpectedType(input.expectedType)).
		SetEnabled(input.enabled).
		SetHeaders(input.headers).
		SetAuth(input.auth).
		SetNotificationChannels(input.notificationChannels)
	if input.label != nil {
		create = create.SetLabel(*input.label)
	}
	if input.body != nil {
		create = create.SetBody(*input.body)
	}
	if input.selector != nil {
		create = create.SetSelector(*input.selector)
	}
	if input.expectedResponse != nil {
		create = create.SetExpectedResponse(*input.expectedResponse)
	}

	created, err := create.Save(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create monitor")
		return
	}

	runtimeStatus := monitorruntime.StatusPending
	if !created.Enabled {
		runtimeStatus = monitorruntime.StatusDisabled
	}

	config, err := s.ensureGlobalSystemConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load runtime settings")
		return
	}
	cronLocation := runtimeCronLocation(config.Timezone)

	runtimeCreate := s.db.MonitorRuntime.Create().
		SetMonitor(created).
		SetStatus(runtimeStatus)
	if created.Enabled {
		nextRun, nextErr := nextRunFromCron(created.Cron, time.Now().UTC(), cronLocation)
		if nextErr == nil {
			runtimeCreate = runtimeCreate.SetNextRunAt(nextRun)
		}
	}

	runtime, runtimeErr := runtimeCreate.Save(r.Context())
	if runtimeErr != nil {
		writeError(w, http.StatusInternalServerError, "failed to initialize monitor runtime")
		return
	}

	writeJSON(w, http.StatusCreated, mapMonitor(created, runtime))
}

func (s *Server) handleUpdateMonitor(w http.ResponseWriter, r *http.Request) {
	monitorID, err := parseMonitorID(r.PathValue("monitorId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "monitorId must be a positive integer")
		return
	}

	var req createMonitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	input, err := normalizeMonitorRequest(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	existing, err := s.db.Monitor.Query().
		Where(monitor.IDEQ(monitorID)).
		WithRuntime().
		Only(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "monitor not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load monitor")
		return
	}

	update := s.db.Monitor.UpdateOneID(monitorID).
		SetMethod(input.method).
		SetURL(input.url).
		SetIconURL(input.iconURL).
		SetCron(input.cronExpr).
		SetExpectedType(monitor.ExpectedType(input.expectedType)).
		SetEnabled(input.enabled).
		SetHeaders(input.headers).
		SetAuth(input.auth).
		SetNotificationChannels(input.notificationChannels)
	if input.label != nil {
		update = update.SetLabel(*input.label)
	} else {
		update = update.ClearLabel()
	}
	if input.body != nil {
		update = update.SetBody(*input.body)
	} else {
		update = update.ClearBody()
	}
	if input.selector != nil {
		update = update.SetSelector(*input.selector)
	} else {
		update = update.ClearSelector()
	}
	if input.expectedResponse != nil {
		update = update.SetExpectedResponse(*input.expectedResponse)
	} else {
		update = update.ClearExpectedResponse()
	}

	updated, err := update.Save(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update monitor")
		return
	}

	now := time.Now().UTC()
	config, err := s.ensureGlobalSystemConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load runtime settings")
		return
	}
	cronLocation := runtimeCronLocation(config.Timezone)

	nextRun, nextErr := nextRunFromCron(updated.Cron, now, cronLocation)
	if nextErr != nil {
		writeError(w, http.StatusBadRequest, "invalid cron expression")
		return
	}

	runtime := existing.Edges.Runtime
	if runtime == nil {
		runtimeCreate := s.db.MonitorRuntime.Create().SetMonitor(updated)
		if updated.Enabled {
			runtimeCreate = runtimeCreate.
				SetStatus(monitorruntime.StatusPending).
				SetNextRunAt(nextRun)
		} else {
			runtimeCreate = runtimeCreate.SetStatus(monitorruntime.StatusDisabled)
		}

		runtime, err = runtimeCreate.Save(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update monitor runtime")
			return
		}
	} else {
		runtimeUpdate := s.db.MonitorRuntime.UpdateOneID(runtime.ID)
		if updated.Enabled {
			runtimeUpdate = runtimeUpdate.
				SetStatus(monitorruntime.StatusPending).
				SetNextRunAt(nextRun)
		} else {
			runtimeUpdate = runtimeUpdate.
				SetStatus(monitorruntime.StatusDisabled).
				ClearNextRunAt()
		}

		runtime, err = runtimeUpdate.Save(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update monitor runtime")
			return
		}
	}

	writeJSON(w, http.StatusOK, mapMonitor(updated, runtime))
}

func (s *Server) handleDeleteMonitor(w http.ResponseWriter, r *http.Request) {
	monitorID, err := parseMonitorID(r.PathValue("monitorId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "monitorId must be a positive integer")
		return
	}

	tx, err := s.db.Tx(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete monitor")
		return
	}

	if _, err := tx.CheckResult.Delete().
		Where(checkresult.HasMonitorWith(monitor.IDEQ(monitorID))).
		Exec(r.Context()); err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "failed to delete monitor")
		return
	}

	if _, err := tx.NotificationEvent.Delete().
		Where(notificationevent.HasMonitorWith(monitor.IDEQ(monitorID))).
		Exec(r.Context()); err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "failed to delete monitor")
		return
	}

	if _, err := tx.MonitorRuntime.Delete().
		Where(monitorruntime.HasMonitorWith(monitor.IDEQ(monitorID))).
		Exec(r.Context()); err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "failed to delete monitor")
		return
	}

	if err := tx.Monitor.DeleteOneID(monitorID).Exec(r.Context()); err != nil {
		_ = tx.Rollback()
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "monitor not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete monitor")
		return
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete monitor")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleTriggerMonitor(w http.ResponseWriter, r *http.Request) {
	monitorID, err := parseMonitorID(r.PathValue("monitorId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "monitorId must be a positive integer")
		return
	}

	row, err := s.db.Monitor.Query().
		Where(monitor.IDEQ(monitorID)).
		WithRuntime().
		Only(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "monitor not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load monitor")
		return
	}

	now := time.Now().UTC()
	runtime := row.Edges.Runtime
	if runtime == nil {
		runtime, err = s.db.MonitorRuntime.Create().
			SetMonitor(row).
			SetStatus(monitorruntime.StatusPending).
			SetNextRunAt(now).
			Save(r.Context())
	} else {
		runtime, err = s.db.MonitorRuntime.UpdateOneID(runtime.ID).
			SetStatus(monitorruntime.StatusPending).
			SetNextRunAt(now).
			Save(r.Context())
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to trigger monitor")
		return
	}

	writeJSON(w, http.StatusOK, mapMonitor(row, runtime))
}

func (s *Server) handleTestMonitorURL(w http.ResponseWriter, r *http.Request) {
	var req testMonitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	targetURL := strings.TrimSpace(req.URL)
	if targetURL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	if _, err := url.ParseRequestURI(targetURL); err != nil {
		writeError(w, http.StatusBadRequest, "url must be a valid URI")
		return
	}

	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = http.MethodGet
	}

	var body io.Reader
	if req.Body != nil && method != http.MethodGet && method != http.MethodHead {
		body = strings.NewReader(*req.Body)
	}

	ctx, cancel := context.WithTimeout(r.Context(), testRequestTimeout)
	defer cancel()

	outboundReq, err := http.NewRequestWithContext(ctx, method, targetURL, body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to build request")
		return
	}

	for key, value := range req.Headers {
		outboundReq.Header.Set(key, value)
	}
	applyTestAuth(outboundReq, req.Auth)

	response, err := http.DefaultClient.Do(outboundReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to fetch target URL")
		return
	}
	defer response.Body.Close()

	testResponseBodyLimit := int64(s.maxSelectorPayloadBytes + 1)
	payload, readErr := io.ReadAll(io.LimitReader(response.Body, testResponseBodyLimit))
	if readErr != nil {
		writeError(w, http.StatusBadGateway, "failed reading target response")
		return
	}

	responseHeaders := map[string]string{}
	for key, values := range response.Header {
		responseHeaders[key] = strings.Join(values, ", ")
	}

	contentType := response.Header.Get("Content-Type")
	var selectorPayloadToken *string
	if isJSONContentType(contentType) {
		if token := s.storeSelectorPayload(payload); token != "" {
			selectorPayloadToken = &token
		}
	}

	writeJSON(w, http.StatusOK, testMonitorResponse{
		OK:                   response.StatusCode >= http.StatusOK && response.StatusCode < http.StatusMultipleChoices,
		Status:               response.StatusCode,
		StatusText:           response.Status,
		Headers:              responseHeaders,
		Body:                 decodeTestResponseBody(payload, contentType),
		SelectorPayloadToken: selectorPayloadToken,
	})
}

func (s *Server) handlePreviewMonitorSelector(w http.ResponseWriter, r *http.Request) {
	var req selectorPreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	selectorPath := ""
	if req.Selector != nil {
		selectorPath = strings.TrimSpace(*req.Selector)
	}

	var payload []byte
	token := normalizeOptionalString(req.Token)
	if token != nil {
		cachedPayload, ok := s.loadSelectorPayload(*token)
		if !ok {
			writeError(w, http.StatusBadRequest, "selector payload unavailable, run test again or increase GOANNA_MAX_RESPONSE_BODY_BYTES")
			return
		}
		payload = cachedPayload
	} else {
		jsonPayload := strings.TrimSpace(req.JSON)
		if jsonPayload == "" {
			writeError(w, http.StatusBadRequest, "json is required")
			return
		}
		payload = []byte(jsonPayload)
	}

	selection, err := selectorutil.SelectJSON(payload, selectorPath)
	if err != nil {
		writeError(w, http.StatusBadRequest, "json must be valid JSON")
		return
	}

	response := selectorPreviewResponse{
		Exists: selection.Exists,
		Type:   selection.Type,
	}
	if selection.Exists {
		truncatedRaw := truncateSelectorPreviewString(selection.Raw)
		truncatedValue := truncateSelectorPreviewString(selection.Value)
		response.Raw = &truncatedRaw
		response.Value = &truncatedValue
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleListMonitorChecks(w http.ResponseWriter, r *http.Request) {
	monitorIDValue := strings.TrimSpace(r.PathValue("monitorId"))
	monitorID, err := strconv.Atoi(monitorIDValue)
	if err != nil || monitorID <= 0 {
		writeError(w, http.StatusBadRequest, "monitorId must be a positive integer")
		return
	}

	exists, err := s.db.Monitor.Query().Where(monitor.IDEQ(monitorID)).Exist(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query monitor")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "monitor not found")
		return
	}

	limit := 20
	if limitValue := strings.TrimSpace(r.URL.Query().Get("limit")); limitValue != "" {
		parsedLimit, parseErr := strconv.Atoi(limitValue)
		if parseErr != nil || parsedLimit <= 0 {
			writeError(w, http.StatusBadRequest, "limit must be a positive integer")
			return
		}
		if parsedLimit > maxMonitorChecksLimit {
			parsedLimit = maxMonitorChecksLimit
		}
		limit = parsedLimit
	}

	rows, err := s.db.CheckResult.Query().
		Where(checkresult.HasMonitorWith(monitor.IDEQ(monitorID))).
		Order(ent.Desc(checkresult.FieldCheckedAt), ent.Desc(checkresult.FieldID)).
		Limit(limit).
		All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list monitor checks")
		return
	}

	response := make([]monitorCheckResponse, 0, len(rows))
	for _, row := range rows {
		response = append(response, mapMonitorCheck(row))
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleGetTelegramSettings(w http.ResponseWriter, r *http.Request) {
	channel, err := s.db.NotificationChannel.Query().
		Where(notificationchannel.KindEQ("telegram")).
		Only(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			writeJSON(w, http.StatusOK, telegramSettingsResponse{
				Enabled:  false,
				BotToken: "",
				ChatID:   "",
			})
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load telegram settings")
		return
	}

	updatedAt := channel.UpdatedAt
	writeJSON(w, http.StatusOK, telegramSettingsResponse{
		Enabled:   channel.Enabled,
		BotToken:  channel.BotToken,
		ChatID:    channel.ChatID,
		UpdatedAt: &updatedAt,
	})
}

func (s *Server) handleUpsertTelegramSettings(w http.ResponseWriter, r *http.Request) {
	var req telegramSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	botToken := strings.TrimSpace(req.BotToken)
	chatID := strings.TrimSpace(req.ChatID)
	if botToken == "" || chatID == "" {
		writeError(w, http.StatusBadRequest, "botToken and chatId are required")
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	existing, err := s.db.NotificationChannel.Query().
		Where(notificationchannel.KindEQ("telegram")).
		Only(r.Context())
	if err != nil && !ent.IsNotFound(err) {
		writeError(w, http.StatusInternalServerError, "failed to load telegram settings")
		return
	}

	var channel *ent.NotificationChannel
	if ent.IsNotFound(err) {
		channel, err = s.db.NotificationChannel.Create().
			SetName("Telegram").
			SetKind("telegram").
			SetBotToken(botToken).
			SetChatID(chatID).
			SetEnabled(enabled).
			Save(r.Context())
	} else {
		channel, err = existing.Update().
			SetBotToken(botToken).
			SetChatID(chatID).
			SetEnabled(enabled).
			Save(r.Context())
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save telegram settings")
		return
	}

	updatedAt := channel.UpdatedAt
	writeJSON(w, http.StatusOK, telegramSettingsResponse{
		Enabled:   channel.Enabled,
		BotToken:  channel.BotToken,
		ChatID:    channel.ChatID,
		UpdatedAt: &updatedAt,
	})
}

func (s *Server) handleTestTelegramSettings(w http.ResponseWriter, r *http.Request) {
	var req testTelegramSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	botToken := strings.TrimSpace(req.BotToken)
	chatID := strings.TrimSpace(req.ChatID)
	if botToken == "" || chatID == "" {
		writeError(w, http.StatusBadRequest, "botToken and chatId are required")
		return
	}

	message := telegramTestMessage
	if req.Message != nil {
		trimmedMessage := strings.TrimSpace(*req.Message)
		if trimmedMessage != "" {
			message = trimmedMessage
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), testRequestTimeout)
	defer cancel()

	telegramBot, err := bot.New(botToken, bot.WithSkipGetMe())
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid Telegram bot token")
		return
	}

	_, err = telegramBot.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: chatID,
		Text:   message,
	})
	if err != nil {
		errorMessage := sanitizeTelegramError(err, botToken)
		writeError(w, http.StatusBadGateway, "failed to send test Telegram message: "+errorMessage)
		return
	}

	writeJSON(w, http.StatusOK, testTelegramSettingsResponse{OK: true})
}

func (s *Server) handleGetRuntimeSettings(w http.ResponseWriter, r *http.Request) {
	config, err := s.ensureGlobalSystemConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load runtime settings")
		return
	}

	timezone, timezoneValid := normalizeStoredRuntimeTimezone(config.Timezone)
	updatedAt := config.UpdatedAt
	writeJSON(w, http.StatusOK, runtimeSettingsResponse{
		ChecksHistoryLimit: config.ChecksHistoryLimit,
		Timezone:           timezone,
		RequiredSettings:   requiredRuntimeSettings(timezoneValid),
		UpdatedAt:          &updatedAt,
	})
}

func (s *Server) handleUpsertRuntimeSettings(w http.ResponseWriter, r *http.Request) {
	var req runtimeSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.ChecksHistoryLimit < 10 {
		writeError(w, http.StatusBadRequest, "checksHistoryLimit must be at least 10")
		return
	}
	timezone, err := normalizeRuntimeTimezone(req.Timezone)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	config, err := s.ensureGlobalSystemConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load runtime settings")
		return
	}

	previousTimezone, previousTimezoneValid := normalizeStoredRuntimeTimezone(config.Timezone)
	timezoneChanged := !previousTimezoneValid
	if previousTimezoneValid {
		timezoneChanged = *previousTimezone != timezone
	}

	tx, err := s.db.Tx(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save runtime settings")
		return
	}

	updated, err := tx.SystemConfig.UpdateOneID(config.ID).
		SetChecksHistoryLimit(req.ChecksHistoryLimit).
		SetTimezone(timezone).
		Save(r.Context())
	if err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "failed to save runtime settings")
		return
	}

	if timezoneChanged {
		err = realignEnabledMonitorRuntimes(
			r.Context(),
			tx.Client(),
			time.Now().UTC(),
			runtimeCronLocation(updated.Timezone),
		)
		if err != nil {
			_ = tx.Rollback()
			writeError(w, http.StatusInternalServerError, "failed to update monitor schedules for timezone change")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save runtime settings")
		return
	}

	normalizedTimezone, timezoneValid := normalizeStoredRuntimeTimezone(updated.Timezone)
	updatedAt := updated.UpdatedAt
	writeJSON(w, http.StatusOK, runtimeSettingsResponse{
		ChecksHistoryLimit: updated.ChecksHistoryLimit,
		Timezone:           normalizedTimezone,
		RequiredSettings:   requiredRuntimeSettings(timezoneValid),
		UpdatedAt:          &updatedAt,
	})
}

func normalizeMonitorRequest(req createMonitorRequest) (normalizedMonitorRequest, error) {
	url := strings.TrimSpace(req.URL)
	cronExpr := strings.TrimSpace(req.Cron)
	if url == "" || cronExpr == "" {
		return normalizedMonitorRequest{}, errors.New("url and cron are required")
	}
	if _, err := cron.ParseStandard(cronExpr); err != nil {
		return normalizedMonitorRequest{}, errors.New("invalid cron expression")
	}

	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "GET"
	}

	expectedType := strings.TrimSpace(req.ExpectedType)
	if expectedType == "" {
		expectedType = "json"
	}
	if expectedType != "json" && expectedType != "html" && expectedType != "text" {
		return normalizedMonitorRequest{}, errors.New("expectedType must be one of: json, html, text")
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	headers := req.Headers
	if headers == nil {
		headers = map[string]string{}
	}
	auth := req.Auth
	if auth == nil {
		auth = map[string]string{}
	}

	notificationChannels, err := normalizeNotificationChannels(req.NotificationChannels)
	if err != nil {
		return normalizedMonitorRequest{}, err
	}

	label := normalizeOptionalString(req.Label)
	iconURL := monitorDefaultIconURL(url)
	if normalizedIconURL := normalizeOptionalString(req.IconURL); normalizedIconURL != nil {
		iconURL = *normalizedIconURL
	}

	return normalizedMonitorRequest{
		label:                label,
		method:               method,
		url:                  url,
		iconURL:              iconURL,
		body:                 req.Body,
		headers:              headers,
		auth:                 auth,
		notificationChannels: notificationChannels,
		selector:             req.Selector,
		expectedType:         expectedType,
		expectedResponse:     req.ExpectedResponse,
		cronExpr:             cronExpr,
		enabled:              enabled,
	}, nil
}

func parseMonitorID(raw string) (int, error) {
	monitorIDValue := strings.TrimSpace(raw)
	monitorID, err := strconv.Atoi(monitorIDValue)
	if err != nil || monitorID <= 0 {
		return 0, errors.New("monitorId must be a positive integer")
	}

	return monitorID, nil
}

func normalizeNotificationChannels(rawChannels []string) ([]string, error) {
	if len(rawChannels) == 0 {
		return []string{}, nil
	}

	normalized := make([]string, 0, len(rawChannels))
	seen := make(map[string]struct{}, len(rawChannels))
	for _, rawChannel := range rawChannels {
		channel := strings.ToLower(strings.TrimSpace(rawChannel))
		if channel == "" {
			continue
		}

		switch channel {
		case "telegram":
		default:
			return nil, fmt.Errorf("notificationChannels contains unsupported value %q", rawChannel)
		}

		if _, ok := seen[channel]; ok {
			continue
		}
		seen[channel] = struct{}{}
		normalized = append(normalized, channel)
	}

	sort.Strings(normalized)
	return normalized, nil
}

func normalizeOptionalString(raw *string) *string {
	if raw == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func monitorDefaultIconURL(rawURL string) string {
	return "https://www.google.com/s2/favicons?sz=64&domain=" + monitorDomain(rawURL)
}

func monitorDomain(rawURL string) string {
	trimmedURL := strings.TrimSpace(rawURL)
	if trimmedURL == "" {
		return ""
	}

	parsedURL, err := url.Parse(trimmedURL)
	if err == nil {
		if domain := normalizeMonitorDomain(parsedURL.Hostname()); domain != "" {
			return domain
		}
	}

	if strings.Contains(trimmedURL, "://") {
		return ""
	}

	parsedURL, err = url.Parse("https://" + trimmedURL)
	if err != nil {
		return ""
	}

	return normalizeMonitorDomain(parsedURL.Hostname())
}

func normalizeMonitorDomain(rawHostname string) string {
	hostname := strings.TrimSpace(strings.TrimSuffix(rawHostname, "."))
	if hostname == "" {
		return ""
	}

	rootDomain, err := publicsuffix.EffectiveTLDPlusOne(hostname)
	if err == nil {
		return rootDomain
	}

	return hostname
}

func resolveMonitorIconURL(row *ent.Monitor) string {
	if row.IconURL != nil {
		trimmed := strings.TrimSpace(*row.IconURL)
		if trimmed != "" {
			return trimmed
		}
	}

	return monitorDefaultIconURL(row.URL)
}

func (s *Server) ensureGlobalSystemConfig(ctx context.Context) (*ent.SystemConfig, error) {
	config, err := s.db.SystemConfig.Query().
		Where(systemconfig.KeyEQ(globalConfigKey)).
		Only(ctx)
	if err == nil {
		return config, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}

	return s.db.SystemConfig.Create().
		SetKey(globalConfigKey).
		SetChecksHistoryLimit(defaultChecksHistoryKeep).
		Save(ctx)
}

func normalizeRuntimeTimezone(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", errors.New("timezone is required")
	}

	location, err := time.LoadLocation(trimmed)
	if err != nil {
		return "", errors.New("timezone must be a valid value like UTC or America/New_York")
	}

	return location.String(), nil
}

func normalizeStoredRuntimeTimezone(raw *string) (*string, bool) {
	if raw == nil {
		return nil, false
	}

	normalized, err := normalizeRuntimeTimezone(*raw)
	if err != nil {
		return nil, false
	}

	return &normalized, true
}

func requiredRuntimeSettings(timezoneConfigured bool) []string {
	if timezoneConfigured {
		return []string{}
	}

	return []string{requiredRuntimeTimezone}
}

func runtimeCronLocation(rawTimezone *string) *time.Location {
	timezone := defaultCronTimezone
	if rawTimezone != nil {
		trimmed := strings.TrimSpace(*rawTimezone)
		if trimmed != "" {
			timezone = trimmed
		}
	}

	location, err := time.LoadLocation(timezone)
	if err != nil {
		return time.UTC
	}

	return location
}

func realignEnabledMonitorRuntimes(ctx context.Context, db *ent.Client, now time.Time, location *time.Location) error {
	rows, err := db.Monitor.Query().
		Where(monitor.EnabledEQ(true)).
		WithRuntime().
		All(ctx)
	if err != nil {
		return err
	}

	for _, row := range rows {
		nextRun, err := nextRunFromCron(row.Cron, now, location)
		if err != nil {
			return err
		}

		runtime := row.Edges.Runtime
		if runtime == nil {
			if _, err := db.MonitorRuntime.Create().
				SetMonitor(row).
				SetStatus(monitorruntime.StatusPending).
				SetNextRunAt(nextRun).
				Save(ctx); err != nil {
				return err
			}
			continue
		}

		update := db.MonitorRuntime.UpdateOneID(runtime.ID).
			SetNextRunAt(nextRun)
		if runtime.Status == monitorruntime.StatusDisabled {
			update = update.SetStatus(monitorruntime.StatusPending)
		}

		if _, err := update.Save(ctx); err != nil {
			return err
		}
	}

	return nil
}

func mapMonitor(row *ent.Monitor, runtime *ent.MonitorRuntime) monitorResponse {
	status := "pending"
	checkCount := int64(0)
	var nextRunAt *time.Time
	var lastCheckAt *time.Time
	var lastSuccessAt *time.Time
	var lastErrorAt *time.Time
	var lastStatusCode *int
	var lastDurationMs *int
	var lastErrorMessage *string

	if !row.Enabled {
		status = "disabled"
	}

	if runtime != nil {
		status = string(runtime.Status)
		checkCount = runtime.CheckCount
		nextRunAt = runtime.NextRunAt
		lastCheckAt = runtime.LastCheckAt
		lastSuccessAt = runtime.LastSuccessAt
		lastErrorAt = runtime.LastErrorAt
		lastStatusCode = runtime.LastStatusCode
		lastDurationMs = runtime.LastDurationMs
		lastErrorMessage = runtime.LastErrorMessage
	}

	notificationChannels := row.NotificationChannels
	if notificationChannels == nil {
		notificationChannels = []string{}
	}

	return monitorResponse{
		ID:                   int64(row.ID),
		Label:                row.Label,
		Method:               row.Method,
		URL:                  row.URL,
		IconURL:              resolveMonitorIconURL(row),
		Body:                 truncateOptionalResponseString(row.Body),
		Headers:              kvMap(row.Headers),
		Auth:                 kvMap(row.Auth),
		NotificationChannels: notificationChannels,
		Selector:             row.Selector,
		ExpectedType:         string(row.ExpectedType),
		ExpectedResponse:     truncateOptionalResponseString(row.ExpectedResponse),
		Cron:                 row.Cron,
		Enabled:              row.Enabled,
		Status:               status,
		CheckCount:           checkCount,
		NextRunAt:            nextRunAt,
		LastCheckAt:          lastCheckAt,
		LastSuccessAt:        lastSuccessAt,
		LastErrorAt:          lastErrorAt,
		LastStatusCode:       lastStatusCode,
		LastDurationMs:       lastDurationMs,
		LastErrorMessage:     truncateOptionalResponseString(lastErrorMessage),
		CreatedAt:            row.CreatedAt,
		UpdatedAt:            row.UpdatedAt,
	}
}

func mapMonitorCheck(row *ent.CheckResult) monitorCheckResponse {
	return monitorCheckResponse{
		ID:             int64(row.ID),
		Status:         row.Status,
		StatusCode:     row.StatusCode,
		ResponseTimeMs: row.ResponseTimeMs,
		ErrorMessage:   truncateOptionalResponseString(row.ErrorMessage),
		SelectionType:  row.SelectionType,
		SelectionValue: truncateOptionalResponseString(row.SelectionValue),
		DiffChanged:    row.DiffChanged,
		DiffKind:       row.DiffKind,
		DiffSummary:    truncateOptionalResponseString(row.DiffSummary),
		DiffDetails:    truncateOptionalResponseString(row.DiffDetails),
		CheckedAt:      row.CheckedAt,
	}
}

func truncateOptionalResponseString(value *string) *string {
	if value == nil {
		return nil
	}

	truncated := truncateResponseString(*value)
	return &truncated
}

func truncateResponseString(value string) string {
	return truncateResponseStringToBytes(value, maxResponseStringBytes)
}

func truncateSelectorPreviewString(value string) string {
	return truncateResponseStringToBytes(value, maxSelectorPreviewBytes)
}

func truncateTestResponseString(value string) string {
	return truncateResponseStringToBytes(value, maxTestResponseBodyBytes)
}

func truncateResponseStringToBytes(value string, maxBytes int) string {
	if len(value) <= maxBytes {
		return value
	}

	maxValueBytes := maxBytes - len(truncationSuffix)
	if maxValueBytes <= 0 {
		return truncationSuffix
	}

	if maxValueBytes >= len(value) {
		return value
	}

	cutoff := maxValueBytes
	for cutoff > 0 && (value[cutoff]&0xC0) == 0x80 {
		cutoff--
	}
	if cutoff == 0 {
		cutoff = maxValueBytes
	}

	return value[:cutoff] + truncationSuffix
}

func nextRunFromCron(expr string, now time.Time, location *time.Location) (time.Time, error) {
	schedule, err := cron.ParseStandard(expr)
	if err != nil {
		return time.Time{}, err
	}

	if location == nil {
		location = time.UTC
	}

	if specSchedule, ok := schedule.(*cron.SpecSchedule); ok {
		specSchedule.Location = location
	}

	return schedule.Next(now), nil
}

func applyTestAuth(req *http.Request, auth map[string]string) {
	authType := strings.ToLower(strings.TrimSpace(auth["type"]))
	switch authType {
	case "bearer":
		token := strings.TrimSpace(auth["token"])
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
	case "basic":
		token := strings.TrimSpace(auth["token"])
		if token != "" {
			req.Header.Set("Authorization", "Basic "+token)
			return
		}

		username := auth["username"]
		password := auth["password"]
		if username != "" || password != "" {
			req.SetBasicAuth(username, password)
		}
	case "api_key_header":
		name := strings.TrimSpace(auth["name"])
		value := auth["value"]
		if name != "" && value != "" {
			req.Header.Set(name, value)
		}
	}
}

func decodeTestResponseBody(payload []byte, contentType string) any {
	if len(payload) == 0 {
		return nil
	}

	if len(payload) > maxTestResponseBodyBytes {
		return truncateTestResponseString(string(payload))
	}

	if strings.Contains(strings.ToLower(contentType), "application/json") {
		var decoded any
		if err := json.Unmarshal(payload, &decoded); err == nil {
			return decoded
		}
	}

	return truncateTestResponseString(string(payload))
}

func isJSONContentType(contentType string) bool {
	return strings.Contains(strings.ToLower(contentType), "application/json")
}

func (s *Server) storeSelectorPayload(payload []byte) string {
	if len(payload) == 0 || len(payload) > s.maxSelectorPayloadBytes {
		return ""
	}

	expiresAt := time.Now().UTC().Add(selectorPayloadTTL)
	payloadCopy := append([]byte(nil), payload...)

	s.selectorPayloadsMu.Lock()
	defer s.selectorPayloadsMu.Unlock()

	now := time.Now().UTC()
	for key, entry := range s.selectorPayloads {
		if !entry.expiresAt.After(now) {
			delete(s.selectorPayloads, key)
		}
	}

	if len(s.selectorPayloads) >= selectorPayloadCacheSize {
		oldestKey := ""
		oldestExpiry := time.Time{}
		for key, entry := range s.selectorPayloads {
			if oldestKey == "" || entry.expiresAt.Before(oldestExpiry) {
				oldestKey = key
				oldestExpiry = entry.expiresAt
			}
		}
		if oldestKey != "" {
			delete(s.selectorPayloads, oldestKey)
		}
	}

	for attempts := 0; attempts < 4; attempts++ {
		tokenBytes := make([]byte, 16)
		if _, err := rand.Read(tokenBytes); err != nil {
			return ""
		}
		token := hex.EncodeToString(tokenBytes)
		if _, exists := s.selectorPayloads[token]; exists {
			continue
		}

		s.selectorPayloads[token] = selectorPayloadEntry{
			payload:   payloadCopy,
			expiresAt: expiresAt,
		}
		return token
	}

	return ""
}

func (s *Server) loadSelectorPayload(token string) ([]byte, bool) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, false
	}

	s.selectorPayloadsMu.Lock()
	defer s.selectorPayloadsMu.Unlock()

	entry, exists := s.selectorPayloads[token]
	if !exists {
		return nil, false
	}

	if !entry.expiresAt.After(time.Now().UTC()) {
		delete(s.selectorPayloads, token)
		return nil, false
	}

	return append([]byte(nil), entry.payload...), true
}

func sanitizeTelegramError(err error, botToken string) string {
	message := strings.TrimSpace(err.Error())
	if message == "" {
		return "unknown Telegram API error"
	}

	if botToken != "" {
		message = strings.ReplaceAll(message, botToken, "<redacted>")
	}

	return message
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(payload); err != nil && !errors.Is(err, http.ErrHandlerTimeout) {
		http.Error(w, `{"error":"failed to encode response"}`, http.StatusInternalServerError)
	}
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, map[string]string{"error": message})
}
