package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"goanna/apps/api/ent/enttest"
)

func TestCheckHistoryFiltersBeforeLimitAndPaginates(t *testing.T) {
	ctx := context.Background()
	db := enttest.Open(t, "sqlite3", "file:history-pagination?mode=memory&cache=shared&_fk=1")
	defer db.Close()
	m := db.Monitor.Create().SetURL("https://example.com").SetCron("*/5 * * * *").SaveX(ctx)
	other := db.Monitor.Create().SetURL("https://other.example.com").SetCron("*/5 * * * *").SaveX(ctx)
	at := time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC)
	baseline := db.CheckResult.Create().SetMonitor(m).SetCheckedAt(at.Add(-time.Minute)).SetDiffKind("initial").SetSelectionType("string").SetSelectionValue("Ready").SaveX(ctx)
	ids := []int{baseline.ID}
	for i := range 12 {
		row := db.CheckResult.Create().SetMonitor(m).SetCheckedAt(at.Add(time.Duration(i/3) * time.Minute)).SetDiffChanged(true).SaveX(ctx)
		ids = append(ids, row.ID)
	}
	for range 25 {
		db.CheckResult.Create().SetMonitor(m).SetCheckedAt(at.Add(time.Hour)).SaveX(ctx)
	}
	otherCheck := db.CheckResult.Create().SetMonitor(other).SetCheckedAt(at).SetDiffChanged(true).SaveX(ctx)
	mux := http.NewServeMux()
	New(db).RegisterRoutes(mux)
	fetch := func(query string, status int) []monitorCheckResponse {
		t.Helper()
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, httptest.NewRequest("GET", fmt.Sprintf("/v1/monitors/%d/checks?%s", m.ID, query), nil))
		if res.Code != status {
			t.Fatalf("status %d: %s", res.Code, res.Body.String())
		}
		if status != http.StatusOK {
			return nil
		}
		var rows []monitorCheckResponse
		if err := json.Unmarshal(res.Body.Bytes(), &rows); err != nil {
			t.Fatal(err)
		}
		return rows
	}
	cursor := ""
	seen := []int{}
	for _, want := range []int{5, 5, 3, 0} {
		rows := fetch("changesOnly=true&limit=5"+cursor, http.StatusOK)
		if len(rows) != want {
			t.Fatalf("got %d rows, want %d", len(rows), want)
		}
		for _, row := range rows {
			if !row.DiffChanged && (row.DiffKind == nil || *row.DiffKind != "initial") {
				t.Fatal("unchanged check returned")
			}
			seen = append(seen, int(row.ID))
		}
		if len(rows) > 0 {
			cursor = fmt.Sprintf("&beforeId=%d", rows[len(rows)-1].ID)
		}
	}
	for i, id := range seen {
		if id != ids[len(ids)-1-i] {
			t.Fatalf("unexpected order at %d: %d", i, id)
		}
	}
	fetch("changesOnly=invalid", http.StatusBadRequest)
	fetch("beforeId=-1", http.StatusBadRequest)
	fetch(fmt.Sprintf("beforeId=%d", otherCheck.ID), http.StatusBadRequest)
	fetch("beforeId=999999", http.StatusBadRequest)
	if rows := fetch("limit=5", http.StatusOK); len(rows) != 5 || rows[0].DiffChanged {
		t.Fatal("default check listing changed")
	}
}

func TestCheckHistoryIncludesOnlyInitialCapture(t *testing.T) {
	ctx := context.Background()
	db := enttest.Open(t, "sqlite3", "file:history-initial?mode=memory&cache=shared&_fk=1")
	defer db.Close()
	m := db.Monitor.Create().SetURL("https://example.com").SetCron("*/5 * * * *").SaveX(ctx)
	baseline := db.CheckResult.Create().SetMonitor(m).SetDiffKind("initial").SetSelectionType("string").SetSelectionValue("Ready").SaveX(ctx)
	mux := http.NewServeMux()
	New(db).RegisterRoutes(mux)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, httptest.NewRequest("GET", fmt.Sprintf("/v1/monitors/%d/checks?changesOnly=true", m.ID), nil))
	if res.Code != http.StatusOK {
		t.Fatalf("status %d: %s", res.Code, res.Body.String())
	}
	var rows []monitorCheckResponse
	if err := json.Unmarshal(res.Body.Bytes(), &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].ID != int64(baseline.ID) || rows[0].DiffChanged {
		t.Fatalf("expected unchanged baseline, got %#v", rows)
	}
}
