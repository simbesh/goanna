package server

import (
	"context"
	"testing"
	"time"

	"goanna/apps/api/ent/enttest"
	"goanna/apps/api/ent/monitorruntime"

	_ "github.com/mattn/go-sqlite3"
)

func TestNormalizeRuntimeTimezone(t *testing.T) {
	timezone, err := normalizeRuntimeTimezone("America/New_York")
	if err != nil {
		t.Fatalf("expected timezone to normalize: %v", err)
	}
	if timezone != "America/New_York" {
		t.Fatalf("expected normalized timezone, got %q", timezone)
	}
}

func TestNormalizeRuntimeTimezoneRejectsEmptyValue(t *testing.T) {
	_, err := normalizeRuntimeTimezone("   ")
	if err == nil {
		t.Fatal("expected empty timezone to fail")
	}
}

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

func TestRequiredRuntimeSettingsIncludesTimezoneWhenMissing(t *testing.T) {
	required := requiredRuntimeSettings(false)
	if len(required) != 1 || required[0] != requiredRuntimeTimezone {
		t.Fatalf("expected timezone requirement, got %#v", required)
	}
}

func TestRealignEnabledMonitorRuntimesUsesConfiguredTimezone(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, "sqlite3", "file:runtime-settings-timezone?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	enabledMonitor, err := client.Monitor.Create().
		SetURL("https://example.com/enabled").
		SetCron("0 8-18/2 * * *").
		SetEnabled(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("expected enabled monitor to save: %v", err)
	}

	enabledRuntime, err := client.MonitorRuntime.Create().
		SetMonitor(enabledMonitor).
		SetStatus(monitorruntime.StatusOk).
		SetNextRunAt(time.Date(2026, time.February, 26, 8, 0, 0, 0, time.UTC)).
		Save(ctx)
	if err != nil {
		t.Fatalf("expected enabled runtime to save: %v", err)
	}

	disabledMonitor, err := client.Monitor.Create().
		SetURL("https://example.com/disabled").
		SetCron("0 8-18/2 * * *").
		SetEnabled(false).
		Save(ctx)
	if err != nil {
		t.Fatalf("expected disabled monitor to save: %v", err)
	}

	disabledRuntime, err := client.MonitorRuntime.Create().
		SetMonitor(disabledMonitor).
		SetStatus(monitorruntime.StatusDisabled).
		Save(ctx)
	if err != nil {
		t.Fatalf("expected disabled runtime to save: %v", err)
	}

	location, err := time.LoadLocation("Australia/Brisbane")
	if err != nil {
		t.Fatalf("expected timezone to load: %v", err)
	}

	now := time.Date(2026, time.February, 25, 22, 27, 0, 0, time.UTC)
	err = realignEnabledMonitorRuntimes(ctx, client, now, location)
	if err != nil {
		t.Fatalf("expected runtimes to realign: %v", err)
	}

	updatedEnabledRuntime, err := client.MonitorRuntime.Get(ctx, enabledRuntime.ID)
	if err != nil {
		t.Fatalf("expected enabled runtime to load: %v", err)
	}

	if updatedEnabledRuntime.NextRunAt == nil {
		t.Fatal("expected enabled runtime to have next run")
	}

	wantEnabledNextRun := time.Date(2026, time.February, 26, 0, 0, 0, 0, time.UTC)
	if !updatedEnabledRuntime.NextRunAt.Equal(wantEnabledNextRun) {
		t.Fatalf("expected enabled monitor next run %s, got %s", wantEnabledNextRun, updatedEnabledRuntime.NextRunAt)
	}

	updatedDisabledRuntime, err := client.MonitorRuntime.Get(ctx, disabledRuntime.ID)
	if err != nil {
		t.Fatalf("expected disabled runtime to load: %v", err)
	}

	if updatedDisabledRuntime.NextRunAt != nil {
		t.Fatalf("expected disabled runtime next run to remain nil, got %s", updatedDisabledRuntime.NextRunAt)
	}
}
