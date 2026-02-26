package worker

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"goanna/apps/api/ent"
	"goanna/apps/api/ent/checkresult"
	"goanna/apps/api/ent/monitor"
	"goanna/apps/api/ent/monitorruntime"
	"goanna/apps/api/ent/systemconfig"
	selectorutil "goanna/apps/api/internal/selector"

	"github.com/robfig/cron/v3"
)

const (
	globalConfigKey             = "global"
	defaultChecksHistoryLimit   = 200
	defaultCronTimezone         = "UTC"
	workerTickInterval          = 5 * time.Second
	requestTimeout              = 15 * time.Second
	maxRetries                  = 2
	DefaultMaxResponseBodyBytes = 24 * 1024 * 1024
)

type Config struct {
	MaxResponseBodyBytes int
}

type Worker struct {
	db                   *ent.Client
	client               *http.Client
	maxResponseBodyBytes int
}

type executionResult struct {
	status       string
	statusCode   *int
	durationMs   *int
	errorMessage *string
	selection    *selectionSnapshot
	diff         *selectionDiff
	checkedAt    time.Time
	success      bool
}

func New(db *ent.Client) *Worker {
	return NewWithConfig(db, Config{})
}

func NewWithConfig(db *ent.Client, config Config) *Worker {
	maxResponseBodyBytes := config.MaxResponseBodyBytes
	if maxResponseBodyBytes <= 0 {
		maxResponseBodyBytes = DefaultMaxResponseBodyBytes
	}

	return &Worker{
		db: db,
		client: &http.Client{
			Timeout: requestTimeout,
		},
		maxResponseBodyBytes: maxResponseBodyBytes,
	}
}

func (w *Worker) Start(ctx context.Context) {
	ticker := time.NewTicker(workerTickInterval)
	defer ticker.Stop()

	startupAt := time.Now().UTC()
	w.tick(ctx, &startupAt)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.tick(ctx, nil)
		}
	}
}

func (w *Worker) tick(ctx context.Context, startupCutoff *time.Time) {
	config, err := w.ensureSystemConfig(ctx)
	if err != nil {
		log.Printf("worker: failed ensuring system config: %v", err)
		return
	}
	cronLocation := cronLocationFromConfig(config.Timezone)

	monitors, err := w.db.Monitor.Query().WithRuntime().All(ctx)
	if err != nil {
		log.Printf("worker: failed loading monitors: %v", err)
		return
	}

	now := time.Now().UTC()
	for _, row := range monitors {
		runtime, err := w.ensureRuntime(ctx, row, now, cronLocation)
		if err != nil {
			log.Printf("worker: failed ensuring runtime monitor=%d: %v", row.ID, err)
			continue
		}

		if runtime.NextRunAt == nil || now.Before(*runtime.NextRunAt) {
			continue
		}

		manualDisabledRun := !row.Enabled
		if manualDisabledRun && runtime.Status != monitorruntime.StatusPending {
			continue
		}

		if !manualDisabledRun && !row.Enabled {
			continue
		}

		if startupCutoff != nil && shouldTriggerStartupCatchUp(runtime.NextRunAt, *startupCutoff) {
			log.Printf("worker: startup catch-up trigger monitor=%d scheduled_for=%s", row.ID, runtime.NextRunAt.UTC().Format(time.RFC3339))
		}

		if err := w.runMonitor(ctx, row, runtime, now, cronLocation, manualDisabledRun); err != nil {
			log.Printf("worker: failed running monitor=%d: %v", row.ID, err)
		}
	}
}

func (w *Worker) ensureRuntime(ctx context.Context, row *ent.Monitor, now time.Time, cronLocation *time.Location) (*ent.MonitorRuntime, error) {
	runtime := row.Edges.Runtime
	if runtime == nil {
		status := monitorruntime.StatusPending
		create := w.db.MonitorRuntime.Create().
			SetMonitor(row).
			SetStatus(status)
		if !row.Enabled {
			create = create.SetStatus(monitorruntime.StatusDisabled)
		} else {
			nextRun, err := nextRunFromCron(row.Cron, now, cronLocation)
			if err == nil {
				create = create.SetNextRunAt(nextRun)
			}
		}

		created, err := create.Save(ctx)
		if err != nil {
			return nil, err
		}
		return created, nil
	}

	if !row.Enabled {
		if runtime.Status == monitorruntime.StatusPending && runtime.NextRunAt != nil {
			return runtime, nil
		}

		if runtime.Status != monitorruntime.StatusDisabled {
			updated, err := w.db.MonitorRuntime.UpdateOneID(runtime.ID).
				SetStatus(monitorruntime.StatusDisabled).
				ClearNextRunAt().
				Save(ctx)
			if err != nil {
				return nil, err
			}
			return updated, nil
		}
		return runtime, nil
	}

	if runtime.Status == monitorruntime.StatusDisabled {
		update := w.db.MonitorRuntime.UpdateOneID(runtime.ID).
			SetStatus(monitorruntime.StatusPending)
		if runtime.NextRunAt == nil {
			nextRun, err := nextRunFromCron(row.Cron, now, cronLocation)
			if err == nil {
				update = update.SetNextRunAt(nextRun)
			}
		}
		updated, err := update.Save(ctx)
		if err != nil {
			return nil, err
		}
		return updated, nil
	}

	if runtime.NextRunAt == nil {
		nextRun, err := nextRunFromCron(row.Cron, now, cronLocation)
		if err != nil {
			msg := err.Error()
			updated, updateErr := w.db.MonitorRuntime.UpdateOneID(runtime.ID).
				SetStatus(monitorruntime.StatusError).
				SetLastErrorMessage(msg).
				Save(ctx)
			if updateErr != nil {
				return nil, updateErr
			}
			return updated, nil
		}

		updated, err := w.db.MonitorRuntime.UpdateOneID(runtime.ID).
			SetNextRunAt(nextRun).
			Save(ctx)
		if err != nil {
			return nil, err
		}
		return updated, nil
	}

	return runtime, nil
}

func (w *Worker) runMonitor(ctx context.Context, row *ent.Monitor, runtime *ent.MonitorRuntime, now time.Time, cronLocation *time.Location, disableAfterRun bool) error {
	result, retriesUsed := w.executeWithRetry(ctx, row, runtime)

	if result.selection != nil && result.selection.Exists {
		previousSelection, err := w.loadPreviousSelection(ctx, row.ID)
		if err != nil {
			return err
		}
		result.diff = buildSelectionDiff(previousSelection, result.selection)
	}

	if err := w.insertCheckResult(ctx, row.ID, result); err != nil {
		return err
	}

	update := w.db.MonitorRuntime.UpdateOneID(runtime.ID).
		AddCheckCount(1).
		AddRetryCount(int64(retriesUsed)).
		SetLastCheckAt(result.checkedAt)

	if disableAfterRun {
		update = update.
			SetStatus(monitorruntime.StatusDisabled).
			ClearNextRunAt()
	} else {
		nextRun, err := nextRunFromCron(row.Cron, now, cronLocation)
		if err != nil {
			nextRun = now.Add(time.Minute)
		}

		update = update.
			SetStatus(monitorruntime.Status(result.status)).
			SetNextRunAt(nextRun)
	}

	if result.success {
		update = update.
			AddSuccessCount(1).
			SetConsecutiveErrors(0).
			AddConsecutiveSuccesses(1).
			SetLastSuccessAt(result.checkedAt).
			ClearLastErrorMessage()
	} else {
		update = update.
			AddErrorCount(1).
			SetConsecutiveSuccesses(0).
			AddConsecutiveErrors(1).
			SetLastErrorAt(result.checkedAt)
		if result.errorMessage != nil {
			update = update.SetLastErrorMessage(*result.errorMessage)
		}
	}

	if result.statusCode != nil {
		update = update.SetLastStatusCode(*result.statusCode)
	} else {
		update = update.ClearLastStatusCode()
	}

	if result.durationMs != nil {
		update = update.SetLastDurationMs(*result.durationMs)
	} else {
		update = update.ClearLastDurationMs()
	}

	if _, err := update.Save(ctx); err != nil {
		return err
	}

	if result.diff != nil && result.diff.Changed {
		if err := w.notifyMonitorDiff(ctx, row, result.diff, result.checkedAt); err != nil {
			log.Printf("worker: failed notifying monitor=%d: %v", row.ID, err)
		}
	}

	limit, err := w.getChecksHistoryLimit(ctx)
	if err != nil {
		return err
	}

	return w.pruneCheckHistory(ctx, row.ID, limit)
}

func (w *Worker) executeWithRetry(ctx context.Context, row *ent.Monitor, runtime *ent.MonitorRuntime) (executionResult, int) {
	var result executionResult
	retriesUsed := 0

	for attempt := 0; attempt <= maxRetries; attempt++ {
		result = w.executeOnce(ctx, row)
		if result.success {
			return result, retriesUsed
		}

		if attempt == maxRetries {
			return result, retriesUsed
		}

		retriesUsed++
		_, _ = w.db.MonitorRuntime.UpdateOneID(runtime.ID).
			SetStatus(monitorruntime.StatusRetrying).
			Save(ctx)

		backoff := time.Duration(retriesUsed) * time.Second
		select {
		case <-ctx.Done():
			cancelled := "worker stopped"
			result.errorMessage = &cancelled
			result.success = false
			result.status = "error"
			return result, retriesUsed
		case <-time.After(backoff):
		}
	}

	return result, retriesUsed
}

func (w *Worker) executeOnce(ctx context.Context, row *ent.Monitor) executionResult {
	started := time.Now().UTC()
	result := executionResult{checkedAt: started, status: "error", success: false}

	var body io.Reader
	if row.Body != nil {
		body = strings.NewReader(*row.Body)
	}

	req, err := http.NewRequestWithContext(ctx, row.Method, row.URL, body)
	if err != nil {
		msg := err.Error()
		result.errorMessage = &msg
		return result
	}

	for key, value := range row.Headers {
		req.Header.Set(key, value)
	}
	applyAuth(req, row.Auth)

	response, err := w.client.Do(req)
	if err != nil {
		msg := err.Error()
		result.errorMessage = &msg
		duration := int(time.Since(started).Milliseconds())
		result.durationMs = &duration
		return result
	}
	defer response.Body.Close()

	duration := int(time.Since(started).Milliseconds())
	result.durationMs = &duration
	statusCode := response.StatusCode
	result.statusCode = &statusCode

	responseReadLimit := int64(w.maxResponseBodyBytes + 1)
	payload, readErr := io.ReadAll(io.LimitReader(response.Body, responseReadLimit))
	if readErr != nil {
		msg := readErr.Error()
		result.errorMessage = &msg
		return result
	}
	if len(payload) > w.maxResponseBodyBytes {
		msg := fmt.Sprintf(
			"response body exceeds %d bytes limit (increase GOANNA_MAX_RESPONSE_BODY_BYTES)",
			w.maxResponseBodyBytes,
		)
		result.errorMessage = &msg
		return result
	}

	ok, errMsg, selection := evaluateResponse(response.StatusCode, payload, row.ExpectedType.String(), row.Selector, row.ExpectedResponse)
	if selection != nil {
		result.selection = &selectionSnapshot{
			Exists: selection.Exists,
			Type:   selection.Type,
			Raw:    selection.Raw,
			Value:  selection.Value,
		}
	}
	if !ok {
		result.status = "error"
		if errMsg != "" {
			result.errorMessage = &errMsg
		}
		return result
	}

	result.status = "ok"
	result.success = true
	result.errorMessage = nil
	return result
}

func applyAuth(req *http.Request, auth map[string]string) {
	authType := strings.ToLower(strings.TrimSpace(auth["type"]))
	switch authType {
	case "bearer":
		token := strings.TrimSpace(auth["token"])
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
	case "basic":
		user := auth["username"]
		pass := auth["password"]
		if user != "" || pass != "" {
			credentials := base64.StdEncoding.EncodeToString([]byte(user + ":" + pass))
			req.Header.Set("Authorization", "Basic "+credentials)
		}
	case "api_key_header":
		name := strings.TrimSpace(auth["name"])
		value := auth["value"]
		if name != "" && value != "" {
			req.Header.Set(name, value)
		}
	}
}

func evaluateResponse(statusCode int, payload []byte, expectedType string, selector *string, expected *string) (bool, string, *selectorutil.Selection) {
	if statusCode < 200 || statusCode >= 300 {
		return false, fmt.Sprintf("unexpected status code: %d", statusCode), nil
	}

	trimmedExpected := ""
	if expected != nil {
		trimmedExpected = strings.TrimSpace(*expected)
	}

	switch expectedType {
	case "json":
		selectorPath := ""
		if selector != nil {
			selectorPath = strings.TrimSpace(*selector)
		}

		selection, err := selectorutil.SelectJSON(payload, selectorPath)
		if err != nil {
			return false, "response is not valid JSON", nil
		}

		selectionCopy := selection
		if selectorPath != "" && !selection.Exists {
			return false, fmt.Sprintf("selector %q not found", selectorPath), &selectionCopy
		}

		if trimmedExpected == "" {
			return true, "", &selectionCopy
		}

		actual := selection.Value
		if actual != trimmedExpected {
			return false, "JSON assertion failed", &selectionCopy
		}
		return true, "", &selectionCopy

	case "html", "text":
		if selector != nil && strings.TrimSpace(*selector) != "" {
			return false, "selector is only supported for JSON expectedType", nil
		}

		if trimmedExpected == "" {
			return true, "", nil
		}

		actual := strings.TrimSpace(string(payload))
		if actual != trimmedExpected {
			return false, "text assertion failed", nil
		}
		return true, "", nil
	default:
		return false, "unsupported expectedType", nil
	}
}

func (w *Worker) insertCheckResult(ctx context.Context, monitorID int, result executionResult) error {
	create := w.db.CheckResult.Create().
		SetStatus(result.status).
		SetCheckedAt(result.checkedAt).
		SetMonitorID(monitorID)

	if result.statusCode != nil {
		create = create.SetStatusCode(*result.statusCode)
	}
	if result.durationMs != nil {
		create = create.SetResponseTimeMs(*result.durationMs)
	}
	if result.errorMessage != nil {
		create = create.SetErrorMessage(*result.errorMessage)
	}
	if result.selection != nil && result.selection.Exists {
		create = create.
			SetSelectionType(result.selection.Type).
			SetSelectionValue(result.selection.Value)
	}
	if result.diff != nil {
		create = create.
			SetDiffChanged(result.diff.Changed).
			SetDiffKind(result.diff.Kind).
			SetDiffSummary(result.diff.Summary)

		if len(result.diff.Details) > 0 {
			encoded, err := json.Marshal(result.diff.Details)
			if err == nil {
				create = create.SetDiffDetails(string(encoded))
			}
		}
	}

	_, err := create.Save(ctx)
	return err
}

func (w *Worker) loadPreviousSelection(ctx context.Context, monitorID int) (*selectionSnapshot, error) {
	row, err := w.db.CheckResult.Query().
		Where(
			checkresult.HasMonitorWith(monitor.IDEQ(monitorID)),
			checkresult.SelectionTypeNotNil(),
			checkresult.SelectionValueNotNil(),
		).
		Order(ent.Desc(checkresult.FieldCheckedAt), ent.Desc(checkresult.FieldID)).
		First(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	if row.SelectionType == nil || row.SelectionValue == nil {
		return nil, nil
	}

	return &selectionSnapshot{
		Exists: true,
		Type:   *row.SelectionType,
		Value:  *row.SelectionValue,
	}, nil
}

func (w *Worker) pruneCheckHistory(ctx context.Context, monitorID int, keep int) error {
	if keep <= 0 {
		return nil
	}

	stale, err := w.db.CheckResult.Query().
		Where(checkresult.HasMonitorWith(monitor.IDEQ(monitorID))).
		Order(ent.Desc(checkresult.FieldCheckedAt), ent.Desc(checkresult.FieldID)).
		Offset(keep).
		All(ctx)
	if err != nil {
		return err
	}
	if len(stale) == 0 {
		return nil
	}

	ids := make([]int, 0, len(stale))
	for _, row := range stale {
		ids = append(ids, row.ID)
	}

	_, err = w.db.CheckResult.Delete().Where(checkresult.IDIn(ids...)).Exec(ctx)
	return err
}

func (w *Worker) getChecksHistoryLimit(ctx context.Context) (int, error) {
	config, err := w.ensureSystemConfig(ctx)
	if err != nil {
		return 0, err
	}
	return config.ChecksHistoryLimit, nil
}

func (w *Worker) ensureSystemConfig(ctx context.Context) (*ent.SystemConfig, error) {
	config, err := w.db.SystemConfig.Query().
		Where(systemconfig.KeyEQ(globalConfigKey)).
		Only(ctx)
	if err == nil {
		return config, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}

	return w.db.SystemConfig.Create().
		SetKey(globalConfigKey).
		SetChecksHistoryLimit(defaultChecksHistoryLimit).
		Save(ctx)
}

func cronLocationFromConfig(rawTimezone *string) *time.Location {
	timezone := defaultCronTimezone
	if rawTimezone != nil {
		trimmed := strings.TrimSpace(*rawTimezone)
		if trimmed != "" {
			timezone = trimmed
		}
	}

	location, err := time.LoadLocation(timezone)
	if err != nil {
		log.Printf("worker: invalid timezone %q in runtime settings, defaulting to UTC", timezone)
		return time.UTC
	}

	return location
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

func shouldTriggerStartupCatchUp(nextRunAt *time.Time, startupAt time.Time) bool {
	if nextRunAt == nil {
		return false
	}

	return !nextRunAt.After(startupAt)
}
