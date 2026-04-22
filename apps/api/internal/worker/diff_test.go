package worker

import (
	"math"
	"testing"
)

func TestBuildSelectionDiffInitial(t *testing.T) {
	current := &selectionSnapshot{Exists: true, Type: "string", Value: "ready"}
	diff := buildSelectionDiff(nil, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}
	if diff.Kind != "initial" {
		t.Fatalf("expected initial kind, got %q", diff.Kind)
	}
	if diff.Changed {
		t.Fatal("expected initial diff to be unchanged")
	}
}

func TestBuildSelectionDiffNumber(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "number", Value: "10"}
	current := &selectionSnapshot{Exists: true, Type: "number", Value: "12.5"}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}
	if diff.Kind != "number" {
		t.Fatalf("expected number kind, got %q", diff.Kind)
	}
	if !diff.Changed {
		t.Fatal("expected number diff to be marked changed")
	}
	if diff.Details["delta"] != 2.5 {
		t.Fatalf("expected delta 2.5, got %#v", diff.Details["delta"])
	}
}

func TestBuildSelectionDiffPrimitiveArray(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "json", Raw: `["a","b"]`, Value: `["a","b"]`}
	current := &selectionSnapshot{Exists: true, Type: "json", Raw: `["a","c"]`, Value: `["a","c"]`}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}
	if diff.Kind != "array" {
		t.Fatalf("expected array kind, got %q", diff.Kind)
	}
	if !diff.Changed {
		t.Fatal("expected array diff to be marked changed")
	}
}

func TestBuildSelectionDiffGenericArrayIncludesAddedAndRemovedEntries(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "json", Raw: `[["BTC","AUD"],["ETH","AUD"]]`, Value: `[["BTC","AUD"],["ETH","AUD"]]`}
	current := &selectionSnapshot{Exists: true, Type: "json", Raw: `[["BTC","AUD"],["XRP","AUD"]]`, Value: `[["BTC","AUD"],["XRP","AUD"]]`}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}
	if diff.Kind != "array" {
		t.Fatalf("expected array kind, got %q", diff.Kind)
	}

	addedEntries, ok := diff.Details["addedEntries"].([]any)
	if !ok || len(addedEntries) != 1 {
		t.Fatalf("expected one added entry, got %#v", diff.Details["addedEntries"])
	}
	addedEntry, ok := addedEntries[0].([]any)
	if !ok || len(addedEntry) != 2 || addedEntry[0] != "XRP" || addedEntry[1] != "AUD" {
		t.Fatalf("expected XRP added entry, got %#v", addedEntries[0])
	}

	removedEntries, ok := diff.Details["removedEntries"].([]any)
	if !ok || len(removedEntries) != 1 {
		t.Fatalf("expected one removed entry, got %#v", diff.Details["removedEntries"])
	}
	removedEntry, ok := removedEntries[0].([]any)
	if !ok || len(removedEntry) != 2 || removedEntry[0] != "ETH" || removedEntry[1] != "AUD" {
		t.Fatalf("expected ETH removed entry, got %#v", removedEntries[0])
	}
	if diff.Details["oldCount"] != 2 || diff.Details["newCount"] != 2 {
		t.Fatalf("expected old/new counts to be retained, got %#v", diff.Details)
	}
}

func TestBuildSelectionDiffTypeChanged(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "number", Value: "1"}
	current := &selectionSnapshot{Exists: true, Type: "string", Value: "1"}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}
	if diff.Kind != "typeChanged" {
		t.Fatalf("expected typeChanged kind, got %q", diff.Kind)
	}
	if !diff.Changed {
		t.Fatal("expected typeChanged diff to be marked changed")
	}
}

func TestBuildSelectionDiffObjectOmitsEmptyFieldsAndIncludesChanges(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "json", Raw: `{"ask":91384.2,"bid":91218}`, Value: `{"ask":91384.2,"bid":91218}`}
	current := &selectionSnapshot{Exists: true, Type: "json", Raw: `{"ask":91360.1,"bid":91218}`, Value: `{"ask":91360.1,"bid":91218}`}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}
	if diff.Kind != "object" {
		t.Fatalf("expected object kind, got %q", diff.Kind)
	}
	if !diff.Changed {
		t.Fatal("expected object diff to be marked changed")
	}

	if _, exists := diff.Details["added"]; exists {
		t.Fatalf("expected added to be omitted, got %#v", diff.Details["added"])
	}
	if _, exists := diff.Details["removed"]; exists {
		t.Fatalf("expected removed to be omitted, got %#v", diff.Details["removed"])
	}

	changed, ok := diff.Details["changed"].([]string)
	if !ok || len(changed) != 1 || changed[0] != "ask" {
		t.Fatalf("expected changed to contain ask, got %#v", diff.Details["changed"])
	}

	changes, ok := diff.Details["changes"].(map[string]map[string]any)
	if !ok {
		t.Fatalf("expected changes map, got %#v", diff.Details["changes"])
	}
	ask, ok := changes["ask"]
	if !ok {
		t.Fatalf("expected ask key in changes, got %#v", changes)
	}

	oldValue, oldOk := ask["old"].(float64)
	newValue, newOk := ask["new"].(float64)
	deltaValue, deltaOk := ask["delta"].(float64)
	if !oldOk || !newOk || !deltaOk {
		t.Fatalf("expected numeric old/new/delta values, got %#v", ask)
	}
	if math.Abs(oldValue-91384.2) > 0.000001 {
		t.Fatalf("unexpected old value: %v", oldValue)
	}
	if math.Abs(newValue-91360.1) > 0.000001 {
		t.Fatalf("unexpected new value: %v", newValue)
	}
	if math.Abs(deltaValue-(-24.1)) > 0.000001 {
		t.Fatalf("unexpected delta value: %v", deltaValue)
	}
}

func TestBuildSelectionDiffArrayObjectIncludesEntryDetails(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "json", Raw: `[{"id":"BTC-AUD","price":10},{"id":"ETH-AUD","price":20}]`, Value: `[{"id":"BTC-AUD","price":10},{"id":"ETH-AUD","price":20}]`}
	current := &selectionSnapshot{Exists: true, Type: "json", Raw: `[{"id":"BTC-AUD","price":11},{"id":"XRP-AUD","price":30}]`, Value: `[{"id":"BTC-AUD","price":11},{"id":"XRP-AUD","price":30}]`}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}
	if diff.Kind != "arrayObject" {
		t.Fatalf("expected arrayObject kind, got %q", diff.Kind)
	}

	addedEntries, ok := diff.Details["addedEntries"].([]map[string]any)
	if !ok || len(addedEntries) != 1 || addedEntries[0]["id"] != "XRP-AUD" {
		t.Fatalf("expected XRP-AUD added entry, got %#v", diff.Details["addedEntries"])
	}

	removedEntries, ok := diff.Details["removedEntries"].([]map[string]any)
	if !ok || len(removedEntries) != 1 || removedEntries[0]["id"] != "ETH-AUD" {
		t.Fatalf("expected ETH-AUD removed entry, got %#v", diff.Details["removedEntries"])
	}

	updatedDetails, ok := diff.Details["updatedDetails"].(map[string]map[string]any)
	if !ok {
		t.Fatalf("expected updatedDetails map, got %#v", diff.Details["updatedDetails"])
	}
	btcDetails, ok := updatedDetails[`"BTC-AUD"`]
	if !ok {
		t.Fatalf("expected BTC-AUD updated details, got %#v", updatedDetails)
	}
	changed, ok := btcDetails["changed"].([]string)
	if !ok || len(changed) != 1 || changed[0] != "price" {
		t.Fatalf("expected changed field price, got %#v", btcDetails["changed"])
	}
	changes, ok := btcDetails["changes"].(map[string]map[string]any)
	if !ok {
		t.Fatalf("expected changes map, got %#v", btcDetails["changes"])
	}
	price, ok := changes["price"]
	if !ok || price["old"] != float64(10) || price["new"] != float64(11) || price["delta"] != float64(1) {
		t.Fatalf("expected price old/new/delta, got %#v", price)
	}
}

func TestBuildSelectionDiffObjectStringNumbersIncludeDelta(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "json", Raw: `{"ask":"91384.2","bid":"91218"}`, Value: `{"ask":"91384.2","bid":"91218"}`}
	current := &selectionSnapshot{Exists: true, Type: "json", Raw: `{"ask":"91360.1","bid":"91218"}`, Value: `{"ask":"91360.1","bid":"91218"}`}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}

	changes, ok := diff.Details["changes"].(map[string]map[string]any)
	if !ok {
		t.Fatalf("expected changes map, got %#v", diff.Details["changes"])
	}

	ask, ok := changes["ask"]
	if !ok {
		t.Fatalf("expected ask key in changes, got %#v", changes)
	}

	oldValue, oldOK := ask["old"].(string)
	newValue, newOK := ask["new"].(string)
	deltaValue, deltaOK := ask["delta"].(float64)
	if !oldOK || !newOK || !deltaOK {
		t.Fatalf("expected old/new string and delta float, got %#v", ask)
	}
	if oldValue != "91384.2" {
		t.Fatalf("unexpected old value: %q", oldValue)
	}
	if newValue != "91360.1" {
		t.Fatalf("unexpected new value: %q", newValue)
	}
	if math.Abs(deltaValue-(-24.1)) > 0.000001 {
		t.Fatalf("unexpected delta value: %v", deltaValue)
	}
}

func TestBuildSelectionDiffObjectStringNumberDeltaRoundedToOneDecimal(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "json", Raw: `{"ask":"91650.3"}`, Value: `{"ask":"91650.3"}`}
	current := &selectionSnapshot{Exists: true, Type: "json", Raw: `{"ask":"91652.9"}`, Value: `{"ask":"91652.9"}`}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}

	changes, ok := diff.Details["changes"].(map[string]map[string]any)
	if !ok {
		t.Fatalf("expected changes map, got %#v", diff.Details["changes"])
	}

	ask, ok := changes["ask"]
	if !ok {
		t.Fatalf("expected ask key in changes, got %#v", changes)
	}

	deltaValue, deltaOK := ask["delta"].(float64)
	if !deltaOK {
		t.Fatalf("expected numeric delta value, got %#v", ask["delta"])
	}
	if deltaValue != 2.6 {
		t.Fatalf("expected rounded delta 2.6, got %v", deltaValue)
	}
}

func TestBuildSelectionDiffObjectStringNumberDeltaRoundedToTwoDecimals(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "json", Raw: `{"bid":"91242.61"}`, Value: `{"bid":"91242.61"}`}
	current := &selectionSnapshot{Exists: true, Type: "json", Raw: `{"bid":"91500.31"}`, Value: `{"bid":"91500.31"}`}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}

	changes, ok := diff.Details["changes"].(map[string]map[string]any)
	if !ok {
		t.Fatalf("expected changes map, got %#v", diff.Details["changes"])
	}

	bid, ok := changes["bid"]
	if !ok {
		t.Fatalf("expected bid key in changes, got %#v", changes)
	}

	deltaValue, deltaOK := bid["delta"].(float64)
	if !deltaOK {
		t.Fatalf("expected numeric delta value, got %#v", bid["delta"])
	}
	if deltaValue != 257.7 {
		t.Fatalf("expected rounded delta 257.7, got %v", deltaValue)
	}
}

func TestBuildSelectionDiffNumberDeltaRounded(t *testing.T) {
	previous := &selectionSnapshot{Exists: true, Type: "number", Value: "91650.3"}
	current := &selectionSnapshot{Exists: true, Type: "number", Value: "91652.9"}

	diff := buildSelectionDiff(previous, current)
	if diff == nil {
		t.Fatal("expected diff result")
	}

	deltaValue, ok := diff.Details["delta"].(float64)
	if !ok {
		t.Fatalf("expected numeric delta value, got %#v", diff.Details["delta"])
	}
	if deltaValue != 2.6 {
		t.Fatalf("expected rounded delta 2.6, got %v", deltaValue)
	}
}
