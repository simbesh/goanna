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

func TestHandleListMonitorsBackfillsLatestSelectionValue(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, "sqlite3", "file:server-monitor-selection-value?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	monitorRow, err := client.Monitor.Create().
		SetURL("https://example.com/api").
		SetCron("*/5 * * * *").
		Save(ctx)
	if err != nil {
		t.Fatalf("expected monitor to save: %v", err)
	}

	_, err = client.MonitorRuntime.Create().
		SetMonitor(monitorRow).
		SetStatus(monitorruntime.StatusOk).
		Save(ctx)
	if err != nil {
		t.Fatalf("expected monitor runtime to save: %v", err)
	}

	selectionType := "json"
	selectionValue := `{"price":1}`
	if _, err := client.CheckResult.Create().
		SetMonitor(monitorRow).
		SetStatus("ok").
		SetSelectionType(selectionType).
		SetSelectionValue(selectionValue).
		SetCheckedAt(time.Date(2026, time.March, 30, 10, 0, 0, 0, time.UTC)).
		Save(ctx); err != nil {
		t.Fatalf("expected initial check result to save: %v", err)
	}

	if _, err := client.CheckResult.Create().
		SetMonitor(monitorRow).
		SetStatus("ok").
		SetSelectionType(selectionType).
		SetCheckedAt(time.Date(2026, time.March, 30, 10, 1, 0, 0, time.UTC)).
		Save(ctx); err != nil {
		t.Fatalf("expected latest check result to save: %v", err)
	}

	server := New(client)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/v1/monitors", nil)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	var response []monitorResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("expected response to decode: %v", err)
	}

	if len(response) != 1 {
		t.Fatalf("expected 1 monitor response, got %d", len(response))
	}

	if response[0].LastSelectionValue == nil || *response[0].LastSelectionValue != selectionValue {
		t.Fatalf(
			"expected last selection value %q, got %#v",
			selectionValue,
			response[0].LastSelectionValue,
		)
	}
}

func TestHydrateMonitorCheckSelectionValueSkipsChecksWithoutSelectionType(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, "sqlite3", "file:server-hydrate-selection-value?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	monitorRow, err := client.Monitor.Create().
		SetURL("https://example.com/no-selection").
		SetCron("*/5 * * * *").
		Save(ctx)
	if err != nil {
		t.Fatalf("expected monitor to save: %v", err)
	}

	selectionType := "json"
	selectionValue := `{"price":1}`
	if _, err := client.CheckResult.Create().
		SetMonitor(monitorRow).
		SetStatus("ok").
		SetSelectionType(selectionType).
		SetSelectionValue(selectionValue).
		SetCheckedAt(time.Date(2026, time.March, 30, 10, 0, 0, 0, time.UTC)).
		Save(ctx); err != nil {
		t.Fatalf("expected stored check result to save: %v", err)
	}

	latestCheck, err := client.CheckResult.Create().
		SetMonitor(monitorRow).
		SetStatus("error").
		SetCheckedAt(time.Date(2026, time.March, 30, 10, 1, 0, 0, time.UTC)).
		Save(ctx)
	if err != nil {
		t.Fatalf("expected latest check result to save: %v", err)
	}

	server := New(client)
	hydrated, err := server.hydrateMonitorCheckSelectionValue(ctx, monitorRow.ID, latestCheck)
	if err != nil {
		t.Fatalf("expected check hydration to succeed: %v", err)
	}

	if hydrated.SelectionValue != nil {
		t.Fatalf("expected check without selection type to stay empty, got %q", *hydrated.SelectionValue)
	}
	if hydrated.SelectionType != nil {
		t.Fatalf("expected check without selection type to stay empty, got %q", *hydrated.SelectionType)
	}
}
