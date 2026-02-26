package worker

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"

	"goanna/apps/api/ent"
)

func TestFormatNotificationDetailPrettyJSON(t *testing.T) {
	diff := &selectionDiff{
		Kind: "object",
		Details: map[string]any{
			"added":   []string{},
			"removed": []string{},
			"changed": []string{"ask"},
			"changes": map[string]map[string]any{
				"ask": {
					"old":   91384.2,
					"new":   91360.1,
					"delta": -24.1,
				},
			},
		},
	}

	formatted := formatNotificationDetail(diff)
	if !strings.HasPrefix(formatted, "Details: {") {
		t.Fatalf("expected details prefix, got %q", formatted)
	}
	if !strings.Contains(formatted, "\n  \"changed\":") {
		t.Fatalf("expected indented JSON output, got %q", formatted)
	}
	if strings.Contains(formatted, "\"added\"") {
		t.Fatalf("expected empty added to be omitted, got %q", formatted)
	}
	if strings.Contains(formatted, "\"removed\"") {
		t.Fatalf("expected empty removed to be omitted, got %q", formatted)
	}

	jsonPayload := strings.TrimPrefix(formatted, "Details: ")
	parsed := map[string]any{}
	if err := json.Unmarshal([]byte(jsonPayload), &parsed); err != nil {
		t.Fatalf("expected valid JSON details, got error: %v", err)
	}

	if _, exists := parsed["added"]; exists {
		t.Fatalf("expected added field to be omitted, got %#v", parsed["added"])
	}
	if _, exists := parsed["removed"]; exists {
		t.Fatalf("expected removed field to be omitted, got %#v", parsed["removed"])
	}

	changes, ok := parsed["changes"].(map[string]any)
	if !ok {
		t.Fatalf("expected changes map, got %#v", parsed["changes"])
	}
	ask, ok := changes["ask"].(map[string]any)
	if !ok {
		t.Fatalf("expected ask change details, got %#v", changes["ask"])
	}

	oldValue, _ := ask["old"].(float64)
	newValue, _ := ask["new"].(float64)
	delta, _ := ask["delta"].(float64)
	if math.Abs(oldValue-91384.2) > 0.000001 {
		t.Fatalf("unexpected old value: %v", oldValue)
	}
	if math.Abs(newValue-91360.1) > 0.000001 {
		t.Fatalf("unexpected new value: %v", newValue)
	}
	if math.Abs(delta-(-24.1)) > 0.000001 {
		t.Fatalf("unexpected delta value: %v", delta)
	}
}

func TestFormatNotificationDetailArrayDecodesStringEntries(t *testing.T) {
	diff := &selectionDiff{
		Kind: "array",
		Details: map[string]any{
			"added": map[string]int{
				`"DOT-AUD"`: 1,
			},
			"removed": map[string]int{
				`"FFF-AUD"`: 1,
			},
		},
	}

	formatted := formatNotificationDetail(diff)
	if !strings.Contains(formatted, "Added: DOT-AUD (x1)") {
		t.Fatalf("expected decoded added entry, got %q", formatted)
	}
	if !strings.Contains(formatted, "Removed: FFF-AUD (x1)") {
		t.Fatalf("expected decoded removed entry, got %q", formatted)
	}
	if strings.Contains(formatted, `\"DOT-AUD\"`) {
		t.Fatalf("did not expect escaped quotes in output, got %q", formatted)
	}
}

func TestFormatNotificationDetailArrayObjectDecodesStringKeys(t *testing.T) {
	diff := &selectionDiff{
		Kind: "arrayObject",
		Details: map[string]any{
			"keyField": "id",
			"added":    []string{`"BTC-AUD"`},
			"removed":  []string{`"ETH-AUD"`},
			"updated":  []string{`"XRP-AUD"`},
		},
	}

	formatted := formatNotificationDetail(diff)
	if !strings.Contains(formatted, "Added by id: BTC-AUD") {
		t.Fatalf("expected decoded added entry, got %q", formatted)
	}
	if !strings.Contains(formatted, "Removed by id: ETH-AUD") {
		t.Fatalf("expected decoded removed entry, got %q", formatted)
	}
	if !strings.Contains(formatted, "Updated by id: XRP-AUD") {
		t.Fatalf("expected decoded updated entry, got %q", formatted)
	}
}

func TestFormatMonitorDiffMessageIncludesLabelWhenPresent(t *testing.T) {
	label := "BTC Markets"
	row := &ent.Monitor{
		ID:    42,
		Label: &label,
		URL:   "https://api.btcmarkets.net/v3/markets",
	}

	diff := &selectionDiff{
		Kind:    "object",
		Summary: "object changed (+0 -0 ~1)",
	}

	message := formatMonitorDiffMessage(row, diff, time.Date(2026, time.February, 25, 10, 30, 0, 0, time.UTC))
	if !strings.Contains(message, "Monitor: BTC Markets (#42)") {
		t.Fatalf("expected labeled monitor line, got %q", message)
	}
}

func TestFormatMonitorDiffMessageFallsBackToIDWhenLabelMissing(t *testing.T) {
	row := &ent.Monitor{
		ID:  42,
		URL: "https://api.btcmarkets.net/v3/markets",
	}

	diff := &selectionDiff{
		Kind:    "object",
		Summary: "object changed (+0 -0 ~1)",
	}

	message := formatMonitorDiffMessage(row, diff, time.Date(2026, time.February, 25, 10, 30, 0, 0, time.UTC))
	if !strings.Contains(message, "Monitor: 42") {
		t.Fatalf("expected monitor id line, got %q", message)
	}
	if strings.Contains(message, "(#42)") {
		t.Fatalf("did not expect label suffix when missing, got %q", message)
	}
}
