package worker

import (
	"context"
	"testing"
	"time"

	"goanna/apps/api/ent"
	"goanna/apps/api/ent/checkresult"
	"goanna/apps/api/ent/enttest"
	"goanna/apps/api/ent/monitor"

	_ "github.com/mattn/go-sqlite3"
)

func TestInsertCheckResultStoresFullSelectionForEachHistoryEntry(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, "sqlite3", "file:worker-selection-storage?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	monitorRow, err := client.Monitor.Create().
		SetURL("https://example.com/data").
		SetCron("*/5 * * * *").
		Save(ctx)
	if err != nil {
		t.Fatalf("expected monitor to save: %v", err)
	}

	w := New(client)
	initial := &selectionSnapshot{Exists: true, Type: "json", Value: `{"price":1}`}
	unchanged := &selectionSnapshot{Exists: true, Type: "json", Value: `{"price":1}`}
	changed := &selectionSnapshot{Exists: true, Type: "json", Value: `{"price":2}`}

	if err := w.insertCheckResult(ctx, monitorRow.ID, executionResult{
		status:    "ok",
		selection: initial,
		checkedAt: time.Date(2026, time.March, 30, 10, 0, 0, 0, time.UTC),
		success:   true,
	}); err != nil {
		t.Fatalf("expected initial check result to save: %v", err)
	}

	if err := w.insertCheckResult(ctx, monitorRow.ID, executionResult{
		status:            "ok",
		selection:         unchanged,
		previousSelection: initial,
		checkedAt:         time.Date(2026, time.March, 30, 10, 1, 0, 0, time.UTC),
		success:           true,
	}); err != nil {
		t.Fatalf("expected unchanged check result to save: %v", err)
	}

	if err := w.insertCheckResult(ctx, monitorRow.ID, executionResult{
		status:            "ok",
		selection:         changed,
		previousSelection: unchanged,
		checkedAt:         time.Date(2026, time.March, 30, 10, 2, 0, 0, time.UTC),
		success:           true,
	}); err != nil {
		t.Fatalf("expected changed check result to save: %v", err)
	}

	rows, err := client.CheckResult.Query().
		Where(checkresult.HasMonitorWith(monitor.IDEQ(monitorRow.ID))).
		Order(ent.Asc(checkresult.FieldID)).
		All(ctx)
	if err != nil {
		t.Fatalf("expected check results to load: %v", err)
	}

	if len(rows) != 3 {
		t.Fatalf("expected 3 check results, got %d", len(rows))
	}

	assertStoredSelectionValue(t, rows[0], initial.Type, initial.Value)
	assertStoredSelectionValue(t, rows[1], unchanged.Type, unchanged.Value)
	assertStoredSelectionValue(t, rows[2], changed.Type, changed.Value)
}

func assertStoredSelectionValue(
	t *testing.T,
	row *ent.CheckResult,
	wantType string,
	wantValue any,
) {
	t.Helper()

	if row.SelectionType == nil || *row.SelectionType != wantType {
		t.Fatalf("expected selection type %q, got %#v", wantType, row.SelectionType)
	}

	switch want := wantValue.(type) {
	case nil:
		if row.SelectionValue != nil {
			t.Fatalf("expected selection value to be omitted, got %q", *row.SelectionValue)
		}
	case string:
		if row.SelectionValue == nil || *row.SelectionValue != want {
			t.Fatalf("expected selection value %q, got %#v", want, row.SelectionValue)
		}
	default:
		t.Fatalf("unsupported expected selection value type %T", wantValue)
	}
}
