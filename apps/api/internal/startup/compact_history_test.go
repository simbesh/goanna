package startup

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"goanna/apps/api/ent"
	"goanna/apps/api/ent/checkresult"
	"goanna/apps/api/ent/enttest"
)

func TestCompactCheckHistoryPreservesEventsAndBaseline(t *testing.T) {
	ctx := context.Background()
	db := enttest.Open(t, "sqlite3", "file:compact-history?mode=memory&cache=shared&_fk=1")
	defer db.Close()
	m := db.Monitor.Create().SetURL("https://example.com").SetCron("*/5 * * * *").SaveX(ctx)
	rt := db.MonitorRuntime.Create().SetMonitor(m).SetCheckCount(8).SaveX(ctx)
	start := time.Date(2026, 9, 6, 0, 0, 0, 0, time.UTC)
	for i, status := range []string{"ok", "ok", "ok", "error", "error", "ok", "ok", "ok"} {
		create := db.CheckResult.Create().SetMonitor(m).SetStatus(status).SetCheckedAt(start.Add(time.Duration(i) * time.Minute))
		if status == "ok" {
			create.SetSelectionType("json")
		}
		switch i {
		case 0:
			create.SetSelectionValue(`["a","b"]`).SetDiffKind("initial")
		case 2:
			create.SetSelectionValue(`["a","c"]`).SetDiffKind("array").SetDiffChanged(true)
		case 6:
			create.SetSelectionValue(`["c","a"]`).SetDiffKind("arrayReorder").SetDiffChanged(true)
		}
		create.SaveX(ctx)
	}
	removed, err := CompactCheckHistory(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 4 {
		t.Fatalf("removed %d, want 4", removed)
	}
	rows := db.CheckResult.Query().Order(ent.Asc(checkresult.FieldCheckedAt)).AllX(ctx)
	if len(rows) != 4 {
		t.Fatalf("got %d history entries", len(rows))
	}
	if rows[3].SelectionValue == nil || *rows[3].SelectionValue != `["a","c"]` {
		t.Fatal("recovery value was not hydrated before deletion")
	}
	runtime := db.MonitorRuntime.GetX(ctx, rt.ID)
	if runtime.LastSelectionValue == nil || *runtime.LastSelectionValue != `["c","a"]` {
		t.Fatal("latest baseline lost")
	}
	if runtime.LastCheckStatus == nil || *runtime.LastCheckStatus != "ok" {
		t.Fatal("latest status lost")
	}
	if runtime.LastChangedAt == nil || !runtime.LastChangedAt.Equal(start.Add(2*time.Minute)) {
		t.Fatal("reorder advanced last changed time")
	}
	if runtime.CheckCount != 8 {
		t.Fatal("cleanup changed counters")
	}
	removed, err = CompactCheckHistory(ctx, db)
	if err != nil || removed != 0 {
		t.Fatalf("second cleanup = %d, %v", removed, err)
	}
}

func TestCleanupReclaimsSQLiteSpace(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "history.db")
	dsn := "file:" + path + "?_fk=1"
	db := enttest.Open(t, "sqlite3", dsn)
	defer db.Close()
	m := db.Monitor.Create().SetURL("https://example.com").SetCron("*/5 * * * *").SaveX(ctx)
	for i := range 10 {
		db.CheckResult.Create().SetMonitor(m).SetStatus("ok").
			SetCheckedAt(time.Unix(int64(i), 0)).SetDiffDetails(strings.Repeat("x", 65536)).SaveX(ctx)
	}
	before, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	removed, err := CompactCheckHistory(ctx, db)
	if err != nil || removed != 9 {
		t.Fatalf("cleanup = %d, %v", removed, err)
	}
	if err := ReclaimSQLiteSpace(ctx, dsn); err != nil {
		t.Fatal(err)
	}
	after, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if after.Size() >= before.Size() {
		t.Fatalf("database did not shrink: %d -> %d", before.Size(), after.Size())
	}
}
