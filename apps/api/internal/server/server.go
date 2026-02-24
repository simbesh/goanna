package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"goanna/apps/api/ent"
)

type Server struct {
	db *ent.Client
}

func New(db *ent.Client) *Server {
	return &Server{db: db}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /v1/endpoints", s.handleListEndpoints)
	mux.HandleFunc("POST /v1/endpoints", s.handleCreateEndpoint)
}

type healthResponse struct {
	Status string `json:"status"`
}

type endpointResponse struct {
	ID              int64     `json:"id"`
	Name            string    `json:"name"`
	URL             string    `json:"url"`
	Method          string    `json:"method"`
	IntervalSeconds int       `json:"intervalSeconds"`
	TimeoutSeconds  int       `json:"timeoutSeconds"`
	ExpectedStatus  int       `json:"expectedStatus"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type createEndpointRequest struct {
	Name            string `json:"name"`
	URL             string `json:"url"`
	Method          string `json:"method"`
	IntervalSeconds int    `json:"intervalSeconds"`
	TimeoutSeconds  int    `json:"timeoutSeconds"`
	ExpectedStatus  int    `json:"expectedStatus"`
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func (s *Server) handleListEndpoints(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Endpoint.Query().All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list endpoints")
		return
	}

	response := make([]endpointResponse, 0, len(rows))
	for _, row := range rows {
		response = append(response, mapEndpoint(row))
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleCreateEndpoint(w http.ResponseWriter, r *http.Request) {
	var req createEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	name := strings.TrimSpace(req.Name)
	url := strings.TrimSpace(req.URL)
	if name == "" || url == "" {
		writeError(w, http.StatusBadRequest, "name and url are required")
		return
	}

	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "GET"
	}

	interval := req.IntervalSeconds
	if interval <= 0 {
		interval = 60
	}

	timeout := req.TimeoutSeconds
	if timeout <= 0 {
		timeout = 10
	}

	expectedStatus := req.ExpectedStatus
	if expectedStatus == 0 {
		expectedStatus = 200
	}

	created, err := s.db.Endpoint.Create().
		SetName(name).
		SetURL(url).
		SetMethod(method).
		SetIntervalSeconds(interval).
		SetTimeoutSeconds(timeout).
		SetExpectedStatus(expectedStatus).
		Save(r.Context())
	if err != nil {
		if ent.IsConstraintError(err) {
			writeError(w, http.StatusBadRequest, "endpoint name must be unique")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create endpoint")
		return
	}

	writeJSON(w, http.StatusCreated, mapEndpoint(created))
}

func mapEndpoint(row *ent.Endpoint) endpointResponse {
	return endpointResponse{
		ID:              int64(row.ID),
		Name:            row.Name,
		URL:             row.URL,
		Method:          row.Method,
		IntervalSeconds: row.IntervalSeconds,
		TimeoutSeconds:  row.TimeoutSeconds,
		ExpectedStatus:  row.ExpectedStatus,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}
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
