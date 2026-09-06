package worker

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"goanna/apps/api/ent/enttest"
	"goanna/apps/api/ent/monitor"
)

func TestHistoryStoresEventsAndKeepsRuntimeBaseline(t *testing.T) {
	ctx := context.Background()
	db := enttest.Open(t, "sqlite3", "file:history-events?mode=memory&cache=shared&_fk=1")
	defer db.Close()
	body := `{"value":["a","b"]}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, body)
	}))
	defer server.Close()
	m := db.Monitor.Create().SetURL(server.URL).SetCron("*/5 * * * *").
		SetExpectedType(monitor.ExpectedTypeJSON).SetSelector("value").SaveX(ctx)
	worker := New(db)
	trigger := func() *TriggerMonitorResult {
		t.Helper()
		result, err := worker.TriggerMonitorNow(ctx, m.ID)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	first := trigger()
	if first.Check == nil {
		t.Fatal("initial capture missing")
	}
	for range 25 {
		result := trigger()
		if result.Check != nil {
			t.Fatal("unchanged trigger returned a stale history event")
		}
	}
	body = `{"value":["b","a"]}`
	reordered := trigger()
	if reordered.Check != nil {
		t.Fatal("reorder created history")
	}
	if !reordered.Runtime.LastChangedAt.Equal(*first.Runtime.LastChangedAt) {
		t.Fatal("reorder changed last changed time")
	}
	if count := db.CheckResult.Query().CountX(ctx); count != 1 {
		t.Fatalf("got %d events, want 1", count)
	}
	// History retention must not determine the next comparison baseline.
	db.CheckResult.Delete().ExecX(ctx)
	body = `{"value":["a","c"]}`
	changed := trigger()
	if changed.Check == nil || !changed.Check.DiffChanged {
		t.Fatal("change lost after pruning history")
	}
	body = `invalid json`
	trigger()
	trigger()
	body = `{"value":["a","c"]}`
	recovered := trigger()
	if recovered.Check == nil || recovered.Check.Status != "ok" {
		t.Fatal("recovery event missing")
	}
	if count := db.CheckResult.Query().CountX(ctx); count != 3 {
		t.Fatalf("got %d events, want change, error, recovery", count)
	}
	if recovered.Runtime.CheckCount != 31 {
		t.Fatalf("check count = %d, want 31", recovered.Runtime.CheckCount)
	}
}
