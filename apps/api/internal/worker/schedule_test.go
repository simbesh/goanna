package worker

import (
	"testing"
	"time"
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
