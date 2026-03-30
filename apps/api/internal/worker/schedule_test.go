package worker

import (
	"context"
	"testing"
	"time"

	"goanna/apps/api/ent/enttest"
	"goanna/apps/api/ent/monitorruntime"

	_ "github.com/mattn/go-sqlite3"
)

func TestNextRunFromCronUsesConfiguredTimezone(t *testing.T) {
	now := time.Date(2026, time.February, 25, 12, 30, 0, 0, time.UTC)
	location, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatalf("expected timezone to load: %v", err)
	}

	nextRun, err := nextRunFromCron("0 8-18/2 * * *", now, location)
	if err != nil {
		t.Fatalf("expected cron to parse: %v", err)
	}

	want := time.Date(2026, time.February, 25, 13, 0, 0, 0, time.UTC)
	if !nextRun.Equal(want) {
		t.Fatalf("expected next run %s, got %s", want, nextRun)
	}
}

func TestNextRunFromCronDefaultsToUTCWhenTimezoneMissing(t *testing.T) {
	now := time.Date(2026, time.February, 25, 7, 59, 0, 0, time.UTC)

	nextRun, err := nextRunFromCron("0 8-18/2 * * *", now, nil)
	if err != nil {
		t.Fatalf("expected cron to parse: %v", err)
	}

	want := time.Date(2026, time.February, 25, 8, 0, 0, 0, time.UTC)
	if !nextRun.Equal(want) {
		t.Fatalf("expected next run %s, got %s", want, nextRun)
	}
}

func TestShouldTriggerStartupCatchUp(t *testing.T) {
	startupAt := time.Date(2026, time.February, 25, 12, 0, 0, 0, time.UTC)

	if shouldTriggerStartupCatchUp(nil, startupAt) {
		t.Fatal("expected nil next run not to trigger startup catch-up")
	}

	past := startupAt.Add(-time.Minute)
	if !shouldTriggerStartupCatchUp(&past, startupAt) {
		t.Fatal("expected past next run to trigger startup catch-up")
	}

	equal := startupAt
	if !shouldTriggerStartupCatchUp(&equal, startupAt) {
		t.Fatal("expected equal next run to trigger startup catch-up")
	}

	future := startupAt.Add(time.Minute)
	if shouldTriggerStartupCatchUp(&future, startupAt) {
		t.Fatal("expected future next run not to trigger startup catch-up")
	}
}

func TestRefreshMonitorRuntimeRealignsPastNextRunAt(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, "sqlite3", "file:refresh-monitor-runtime?mode=memory&cache=shared&_fk=1")
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
	runtimeRow, err := client.MonitorRuntime.Create().
		SetMonitor(monitorRow).
		SetStatus(monitorruntime.StatusOk).
		SetNextRunAt(staleNextRunAt).
		Save(ctx)
	if err != nil {
		t.Fatalf("expected monitor runtime to save: %v", err)
	}

	w := New(client)
	beforeRefresh := time.Now().UTC()
	result, err := w.RefreshMonitorRuntime(ctx, monitorRow.ID)
	if err != nil {
		t.Fatalf("expected refresh to succeed: %v", err)
	}
	afterRefresh := time.Now().UTC()

	if result.Runtime == nil {
		t.Fatal("expected refreshed runtime")
	}
	if result.Runtime.ID != runtimeRow.ID {
		t.Fatalf("expected runtime %d, got %d", runtimeRow.ID, result.Runtime.ID)
	}
	if result.Runtime.NextRunAt == nil {
		t.Fatal("expected refreshed next run")
	}
	if !result.Runtime.NextRunAt.After(afterRefresh) {
		t.Fatalf("expected refreshed next run after now, got %s", result.Runtime.NextRunAt)
	}
	if result.Runtime.Status != monitorruntime.StatusOk {
		t.Fatalf("expected refresh to preserve status %q, got %q", monitorruntime.StatusOk, result.Runtime.Status)
	}
	if !result.Runtime.NextRunAt.After(beforeRefresh) {
		t.Fatalf("expected refreshed next run after refresh start, got %s", result.Runtime.NextRunAt)
	}
	if !result.Runtime.NextRunAt.After(staleNextRunAt) {
		t.Fatalf("expected refreshed next run after stale value, got %s", result.Runtime.NextRunAt)
	}

	persistedRuntime, err := client.MonitorRuntime.Get(ctx, runtimeRow.ID)
	if err != nil {
		t.Fatalf("expected refreshed runtime to load: %v", err)
	}
	if persistedRuntime.NextRunAt == nil || !persistedRuntime.NextRunAt.Equal(*result.Runtime.NextRunAt) {
		t.Fatalf("expected persisted next run %v, got %v", result.Runtime.NextRunAt, persistedRuntime.NextRunAt)
	}
}
