package startup

import (
	"context"
	"database/sql"
	"fmt"

	"goanna/apps/api/ent"
	"goanna/apps/api/ent/checkresult"
	"goanna/apps/api/ent/monitor"
)

// CompactCheckHistory is a temporary startup migration. Remove this action once
// existing installations have migrated. Each monitor is migrated atomically;
// last_check_status marks completion and makes subsequent startups a no-op.
func CompactCheckHistory(ctx context.Context, db *ent.Client) (int, error) {
	ids, err := db.Monitor.Query().IDs(ctx)
	if err != nil {
		return 0, err
	}
	removed := 0
	for _, id := range ids {
		count, err := compactMonitor(ctx, db, id)
		if err != nil {
			return removed, fmt.Errorf("compact monitor %d: %w", id, err)
		}
		removed += count
	}
	return removed, nil
}

func compactMonitor(ctx context.Context, db *ent.Client, id int) (int, error) {
	tx, err := db.Tx(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	row, err := tx.Monitor.Query().Where(monitor.IDEQ(id)).WithRuntime().Only(ctx)
	if err != nil {
		return 0, err
	}
	runtime := row.Edges.Runtime
	if runtime != nil && runtime.LastCheckStatus != nil {
		return 0, nil
	}
	rows, err := tx.CheckResult.Query().Where(checkresult.HasMonitorWith(monitor.IDEQ(id))).
		Order(ent.Asc(checkresult.FieldCheckedAt), ent.Asc(checkresult.FieldID)).All(ctx)
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, nil
	}
	if runtime == nil {
		runtime, err = tx.MonitorRuntime.Create().SetMonitorID(id).Save(ctx)
		if err != nil {
			return 0, err
		}
	}
	var selectionType, selectionValue *string
	var lastChanged = rows[0].CheckedAt
	previousStatus := ""
	removed := 0
	for i, check := range rows {
		if check.SelectionType != nil && check.SelectionValue != nil {
			if selectionValue == nil {
				lastChanged = check.CheckedAt
			}
			selectionType, selectionValue = check.SelectionType, check.SelectionValue
		}
		reordered := check.DiffKind != nil && *check.DiffKind == "arrayReorder"
		changed := check.DiffChanged && !reordered
		if changed {
			lastChanged = check.CheckedAt
		}
		keep := i == 0 || changed || check.Status != previousStatus
		previousStatus = check.Status
		if !keep {
			if err := tx.CheckResult.DeleteOneID(check.ID).Exec(ctx); err != nil {
				return 0, err
			}
			removed++
			continue
		}
		update := tx.CheckResult.UpdateOneID(check.ID)
		if check.SelectionType != nil && check.SelectionValue == nil && selectionValue != nil {
			update.SetSelectionValue(*selectionValue)
		}
		if reordered {
			update.SetDiffChanged(false).SetDiffKind("array").SetDiffSummary("array unchanged").ClearDiffDetails()
		}
		if _, err := update.Save(ctx); err != nil {
			return 0, err
		}
	}
	latest := rows[len(rows)-1]
	update := tx.MonitorRuntime.UpdateOneID(runtime.ID).
		SetLastCheckStatus(latest.Status).
		SetNillableLastSelectionType(selectionType).
		SetNillableLastSelectionValue(selectionValue)
	if runtime.LastCheckAt == nil || runtime.LastCheckAt.Before(latest.CheckedAt) {
		update.SetLastCheckAt(latest.CheckedAt).
			SetNillableLastStatusCode(latest.StatusCode).
			SetNillableLastDurationMs(latest.ResponseTimeMs).
			SetNillableLastErrorMessage(latest.ErrorMessage)
	}
	if selectionValue != nil {
		update.SetLastChangedAt(lastChanged)
	}
	if _, err := update.Save(ctx); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return removed, nil
}

// ReclaimSQLiteSpace returns freed pages to the filesystem after the cleanup.
// Call only after all migration transactions have committed, before serving.
func ReclaimSQLiteSpace(ctx context.Context, dsn string) error {
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.ExecContext(ctx, "VACUUM")
	return err
}
