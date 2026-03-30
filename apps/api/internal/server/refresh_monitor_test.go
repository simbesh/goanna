package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"goanna/apps/api/ent/enttest"
	"goanna/apps/api/ent/monitorruntime"

	_ "github.com/mattn/go-sqlite3"
)

func TestHandleRefreshMonitorRealignsPastNextRunAt(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, "sqlite3", "file:server-refresh-monitor?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	monitorRow, err := client.Monitor.Create().
		SetURL("https://example.com/api").
		SetCron("*/5 * * * *").
		SetEnabled(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("expected monitor to save: %v", err)
	}

	staleNextRunAt := time.Now().UTC().Add(-3 * time.Minute)
	_, err = client.MonitorRuntime.Create().
		SetMonitor(monitorRow).
		SetStatus(monitorruntime.StatusOk).
		SetNextRunAt(staleNextRunAt).
		Save(ctx)
	if err != nil {
		t.Fatalf("expected monitor runtime to save: %v", err)
	}

	server := New(client)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodPost, "/v1/monitors/1/refresh", nil)
	recorder := httptest.NewRecorder()
	beforeRefresh := time.Now().UTC()
	mux.ServeHTTP(recorder, req)
	afterRefresh := time.Now().UTC()

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	var response monitorResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("expected response to decode: %v", err)
	}

	if response.NextRunAt == nil {
		t.Fatal("expected refreshed next run")
	}
	if !response.NextRunAt.After(afterRefresh) {
		t.Fatalf("expected refreshed next run after now, got %s", response.NextRunAt)
	}
	if !response.NextRunAt.After(beforeRefresh) {
		t.Fatalf("expected refreshed next run after refresh start, got %s", response.NextRunAt)
	}
	if response.Status != string(monitorruntime.StatusOk) {
		t.Fatalf("expected status %q, got %q", monitorruntime.StatusOk, response.Status)
	}
}
