package worker

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
)

type selectionSnapshot struct {
	Exists bool
	Type   string
	Raw    string
	Value  string
}

type selectionDiff struct {
	Kind    string
	Changed bool
	Summary string
	Details map[string]any
}

func buildSelectionDiff(previous *selectionSnapshot, current *selectionSnapshot) *selectionDiff {
	if current == nil || !current.Exists {
		return nil
	}

	currentKind := selectionKind(current)
	if previous == nil || !previous.Exists {
		return &selectionDiff{
			Kind:    "initial",
			Changed: false,
			Summary: "initial value captured",
			Details: map[string]any{
				"type":    currentKind,
				"current": current.Value,
			},
		}
	}

	previousKind := selectionKind(previous)
	if previousKind != currentKind {
		return &selectionDiff{
			Kind:    "typeChanged",
			Changed: true,
			Summary: fmt.Sprintf("type changed from %s to %s", previousKind, currentKind),
			Details: map[string]any{
				"oldType": previousKind,
				"newType": currentKind,
				"old":     previous.Value,
				"new":     current.Value,
			},
		}
	}

	switch currentKind {
	case "number":
		return buildNumberDiff(previous, current)
	case "boolean":
		return buildBooleanDiff(previous, current)
	case "null":
		changed := previous.Type != current.Type
		summary := "null unchanged"
		if changed {
			summary = "value changed to null"
		}
		return &selectionDiff{
			Kind:    "null",
			Changed: changed,
			Summary: summary,
			Details: map[string]any{"old": previous.Value, "new": current.Value},
		}
	case "text":
		if dateDiff := buildDateTimeDiff(previous, current); dateDiff != nil {
			return dateDiff
		}
		return buildTextDiff(previous, current)
	case "array":
		return buildArrayDiff(previous, current)
	case "object":
		return buildObjectDiff(previous, current)
	default:
		return buildTextDiff(previous, current)
	}
}

func selectionKind(snapshot *selectionSnapshot) string {
	if snapshot == nil || !snapshot.Exists {
		return "none"
	}

	switch snapshot.Type {
	case "string":
		return "text"
	case "number":
		return "number"
	case "true", "false":
		return "boolean"
	case "null":
		return "null"
	case "json":
		raw := strings.TrimSpace(snapshot.Raw)
		if raw == "" {
			raw = strings.TrimSpace(snapshot.Value)
		}
		if strings.HasPrefix(raw, "[") {
			return "array"
		}
		if strings.HasPrefix(raw, "{") {
			return "object"
		}
		return "json"
	default:
		return "unknown"
	}
}

func buildTextDiff(previous *selectionSnapshot, current *selectionSnapshot) *selectionDiff {
	changed := previous.Value != current.Value
	summary := "text unchanged"
	if changed {
		summary = "text changed"
	}

	return &selectionDiff{
		Kind:    "text",
		Changed: changed,
		Summary: summary,
		Details: map[string]any{
			"old": previous.Value,
			"new": current.Value,
		},
	}
}

func buildNumberDiff(previous *selectionSnapshot, current *selectionSnapshot) *selectionDiff {
	previousNumber, previousErr := strconv.ParseFloat(strings.TrimSpace(previous.Value), 64)
	currentNumber, currentErr := strconv.ParseFloat(strings.TrimSpace(current.Value), 64)
	if previousErr != nil || currentErr != nil {
		return buildTextDiff(previous, current)
	}

	precision := maxDecimalPlaces(
		decimalPlacesFromNumericString(previous.Value),
		decimalPlacesFromNumericString(current.Value),
	)
	delta := roundToDecimalPlaces(currentNumber-previousNumber, precision)
	changed := delta != 0
	percent := math.NaN()
	if previousNumber != 0 {
		percent = (delta / previousNumber) * 100
	}

	summary := "number unchanged"
	if changed {
		summary = fmt.Sprintf("number changed by %s", formatFloat(delta))
	}

	details := map[string]any{
		"old":   previousNumber,
		"new":   currentNumber,
		"delta": delta,
	}
	if !math.IsNaN(percent) {
		details["percent"] = percent
	}

	return &selectionDiff{
		Kind:    "number",
		Changed: changed,
		Summary: summary,
		Details: details,
	}
}

func buildBooleanDiff(previous *selectionSnapshot, current *selectionSnapshot) *selectionDiff {
	previousValue := previous.Type == "true"
	currentValue := current.Type == "true"
	changed := previousValue != currentValue

	summary := "boolean unchanged"
	if changed {
		summary = fmt.Sprintf("boolean changed from %t to %t", previousValue, currentValue)
	}

	return &selectionDiff{
		Kind:    "boolean",
		Changed: changed,
		Summary: summary,
		Details: map[string]any{"old": previousValue, "new": currentValue},
	}
}

func buildDateTimeDiff(previous *selectionSnapshot, current *selectionSnapshot) *selectionDiff {
	previousTime, previousOK := parseDateTime(previous.Value)
	currentTime, currentOK := parseDateTime(current.Value)
	if !previousOK || !currentOK {
		return nil
	}

	delta := currentTime.Sub(previousTime)
	changed := delta != 0
	summary := "datetime unchanged"
	if changed {
		summary = fmt.Sprintf("datetime shifted by %s", delta.String())
	}

	return &selectionDiff{
		Kind:    "dateTime",
		Changed: changed,
		Summary: summary,
		Details: map[string]any{
			"old":          previousTime.Format(time.RFC3339Nano),
			"new":          currentTime.Format(time.RFC3339Nano),
			"deltaSeconds": delta.Seconds(),
		},
	}
}

func parseDateTime(value string) (time.Time, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, false
	}

	if parsed, err := time.Parse(time.RFC3339Nano, trimmed); err == nil {
		return parsed, true
	}
	if parsed, err := time.Parse(time.RFC3339, trimmed); err == nil {
		return parsed, true
	}

	return time.Time{}, false
}

func buildArrayDiff(previous *selectionSnapshot, current *selectionSnapshot) *selectionDiff {
	previousArray, currentArray, ok := parseJSONArrayPair(previous, current)
	if !ok {
		return buildTextDiff(previous, current)
	}

	if primitiveDiff := buildPrimitiveArrayDiff(previousArray, currentArray); primitiveDiff != nil {
		return primitiveDiff
	}

	if keyedDiff := buildKeyedObjectArrayDiff(previousArray, currentArray); keyedDiff != nil {
		return keyedDiff
	}

	changed := !reflect.DeepEqual(previousArray, currentArray)
	summary := "array unchanged"
	if changed {
		summary = fmt.Sprintf("array changed (%d to %d items)", len(previousArray), len(currentArray))
	}

	return &selectionDiff{
		Kind:    "array",
		Changed: changed,
		Summary: summary,
		Details: map[string]any{"oldCount": len(previousArray), "newCount": len(currentArray)},
	}
}

func parseJSONArrayPair(previous *selectionSnapshot, current *selectionSnapshot) ([]any, []any, bool) {
	var previousArray []any
	if err := json.Unmarshal([]byte(previous.Value), &previousArray); err != nil {
		return nil, nil, false
	}

	var currentArray []any
	if err := json.Unmarshal([]byte(current.Value), &currentArray); err != nil {
		return nil, nil, false
	}

	return previousArray, currentArray, true
}

func buildPrimitiveArrayDiff(previousArray []any, currentArray []any) *selectionDiff {
	if !allPrimitives(previousArray) || !allPrimitives(currentArray) {
		return nil
	}

	previousCounts, previousOrder := arrayCountMap(previousArray)
	currentCounts, currentOrder := arrayCountMap(currentArray)
	added := mapCountDiff(currentCounts, previousCounts)
	removed := mapCountDiff(previousCounts, currentCounts)
	reorderOnly := len(added) == 0 && len(removed) == 0 && !reflect.DeepEqual(previousOrder, currentOrder)
	changed := reorderOnly || len(added) > 0 || len(removed) > 0

	kind := "array"
	summary := "array unchanged"
	if reorderOnly {
		kind = "arrayReorder"
		summary = fmt.Sprintf("array reordered (%d items)", len(currentArray))
	} else if changed {
		summary = fmt.Sprintf("array changed (+%d -%d)", totalMapCount(added), totalMapCount(removed))
	}

	return &selectionDiff{
		Kind:    kind,
		Changed: changed,
		Summary: summary,
		Details: map[string]any{
			"oldCount":      len(previousArray),
			"newCount":      len(currentArray),
			"added":         added,
			"removed":       removed,
			"reorderedOnly": reorderOnly,
		},
	}
}

func buildKeyedObjectArrayDiff(previousArray []any, currentArray []any) *selectionDiff {
	previousObjects := asObjectSlice(previousArray)
	currentObjects := asObjectSlice(currentArray)
	if previousObjects == nil || currentObjects == nil {
		return nil
	}

	keyField := detectObjectArrayKey(previousObjects, currentObjects)
	if keyField == "" {
		return nil
	}

	previousMap := mapObjectsByKey(previousObjects, keyField)
	currentMap := mapObjectsByKey(currentObjects, keyField)
	if previousMap == nil || currentMap == nil {
		return nil
	}

	added := make([]string, 0)
	removed := make([]string, 0)
	updated := make([]string, 0)

	for key := range currentMap {
		if _, ok := previousMap[key]; !ok {
			added = append(added, key)
		}
	}
	for key := range previousMap {
		if _, ok := currentMap[key]; !ok {
			removed = append(removed, key)
			continue
		}
		if !reflect.DeepEqual(previousMap[key], currentMap[key]) {
			updated = append(updated, key)
		}
	}

	sort.Strings(added)
	sort.Strings(removed)
	sort.Strings(updated)

	changed := len(added) > 0 || len(removed) > 0 || len(updated) > 0
	summary := "array unchanged"
	if changed {
		summary = fmt.Sprintf("array objects changed (+%d -%d ~%d)", len(added), len(removed), len(updated))
	}

	return &selectionDiff{
		Kind:    "arrayObject",
		Changed: changed,
		Summary: summary,
		Details: map[string]any{
			"keyField": keyField,
			"added":    added,
			"removed":  removed,
			"updated":  updated,
		},
	}
}

func buildObjectDiff(previous *selectionSnapshot, current *selectionSnapshot) *selectionDiff {
	var previousValue any
	if err := json.Unmarshal([]byte(previous.Value), &previousValue); err != nil {
		return buildTextDiff(previous, current)
	}
	var currentValue any
	if err := json.Unmarshal([]byte(current.Value), &currentValue); err != nil {
		return buildTextDiff(previous, current)
	}

	previousObject, previousOK := previousValue.(map[string]any)
	currentObject, currentOK := currentValue.(map[string]any)
	if !previousOK || !currentOK {
		return buildTextDiff(previous, current)
	}

	added := make([]string, 0)
	removed := make([]string, 0)
	changedPaths := make([]string, 0)
	changes := map[string]map[string]any{}
	collectObjectDiff("", previousObject, currentObject, &added, &removed, &changedPaths, changes)
	sort.Strings(added)
	sort.Strings(removed)
	sort.Strings(changedPaths)

	changed := len(added) > 0 || len(removed) > 0 || len(changedPaths) > 0
	summary := "object unchanged"
	if changed {
		summary = fmt.Sprintf("object changed (+%d -%d ~%d)", len(added), len(removed), len(changedPaths))
	}

	details := map[string]any{}
	if len(added) > 0 {
		details["added"] = added
	}
	if len(removed) > 0 {
		details["removed"] = removed
	}
	if len(changedPaths) > 0 {
		details["changed"] = changedPaths
	}
	if len(changes) > 0 {
		details["changes"] = changes
	}

	return &selectionDiff{
		Kind:    "object",
		Changed: changed,
		Summary: summary,
		Details: details,
	}
}

func collectObjectDiff(prefix string, previous map[string]any, current map[string]any, added *[]string, removed *[]string, changed *[]string, changes map[string]map[string]any) {
	keysMap := make(map[string]struct{}, len(previous)+len(current))
	for key := range previous {
		keysMap[key] = struct{}{}
	}
	for key := range current {
		keysMap[key] = struct{}{}
	}

	keys := make([]string, 0, len(keysMap))
	for key := range keysMap {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, key := range keys {
		path := key
		if prefix != "" {
			path = prefix + "." + key
		}

		previousValue, previousExists := previous[key]
		currentValue, currentExists := current[key]
		switch {
		case !previousExists && currentExists:
			*added = append(*added, path)
		case previousExists && !currentExists:
			*removed = append(*removed, path)
		default:
			previousObject, previousIsObject := previousValue.(map[string]any)
			currentObject, currentIsObject := currentValue.(map[string]any)
			if previousIsObject && currentIsObject {
				collectObjectDiff(path, previousObject, currentObject, added, removed, changed, changes)
				continue
			}
			if !reflect.DeepEqual(previousValue, currentValue) {
				*changed = append(*changed, path)
				changeEntry := map[string]any{
					"old": previousValue,
					"new": currentValue,
				}

				previousNumber, previousIsNumber := numericValue(previousValue)
				currentNumber, currentIsNumber := numericValue(currentValue)
				if previousIsNumber && currentIsNumber {
					precision := maxDecimalPlaces(
						decimalPlacesFromValue(previousValue),
						decimalPlacesFromValue(currentValue),
					)
					changeEntry["delta"] = roundToDecimalPlaces(currentNumber-previousNumber, precision)
				}

				changes[path] = changeEntry
			}
		}
	}
}

func numericValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int8:
		return float64(typed), true
	case int16:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint8:
		return float64(typed), true
	case uint16:
		return float64(typed), true
	case uint32:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	case json.Number:
		parsed, err := typed.Float64()
		if err != nil {
			return 0, false
		}
		return parsed, true
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return 0, false
		}
		parsed, err := strconv.ParseFloat(trimmed, 64)
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}

func allPrimitives(values []any) bool {
	for _, value := range values {
		switch value.(type) {
		case nil, string, float64, bool:
		default:
			return false
		}
	}
	return true
}

func arrayCountMap(values []any) (map[string]int, []string) {
	counts := make(map[string]int, len(values))
	ordered := make([]string, 0, len(values))
	for _, value := range values {
		key := stableJSON(value)
		counts[key]++
		ordered = append(ordered, key)
	}
	return counts, ordered
}

func mapCountDiff(left map[string]int, right map[string]int) map[string]int {
	diff := map[string]int{}
	for key, count := range left {
		delta := count - right[key]
		if delta > 0 {
			diff[key] = delta
		}
	}
	return diff
}

func totalMapCount(values map[string]int) int {
	total := 0
	for _, count := range values {
		total += count
	}
	return total
}

func asObjectSlice(values []any) []map[string]any {
	objects := make([]map[string]any, 0, len(values))
	for _, value := range values {
		objectValue, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		objects = append(objects, objectValue)
	}
	return objects
}

func detectObjectArrayKey(previous []map[string]any, current []map[string]any) string {
	candidates := []string{"id", "key", "name", "slug", "uuid"}
	for _, candidate := range candidates {
		if hasUniqueKey(candidate, previous) && hasUniqueKey(candidate, current) {
			return candidate
		}
	}
	return ""
}

func hasUniqueKey(key string, values []map[string]any) bool {
	seen := map[string]struct{}{}
	for _, item := range values {
		raw, ok := item[key]
		if !ok {
			return false
		}
		switch raw.(type) {
		case nil, map[string]any, []any:
			return false
		}

		encoded := stableJSON(raw)
		if _, ok := seen[encoded]; ok {
			return false
		}
		seen[encoded] = struct{}{}
	}
	return true
}

func mapObjectsByKey(values []map[string]any, key string) map[string]map[string]any {
	result := make(map[string]map[string]any, len(values))
	for _, item := range values {
		keyValue, ok := item[key]
		if !ok {
			return nil
		}
		encodedKey := stableJSON(keyValue)
		if _, exists := result[encodedKey]; exists {
			return nil
		}
		result[encodedKey] = item
	}
	return result
}

func stableJSON(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("%v", value)
	}
	return string(encoded)
}

func formatFloat(value float64) string {
	if value > 0 {
		return "+" + strconv.FormatFloat(value, 'f', -1, 64)
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func decimalPlacesFromValue(value any) int {
	switch typed := value.(type) {
	case json.Number:
		return decimalPlacesFromNumericString(string(typed))
	case string:
		return decimalPlacesFromNumericString(typed)
	case float64:
		return decimalPlacesFromNumericString(strconv.FormatFloat(typed, 'f', -1, 64))
	case float32:
		return decimalPlacesFromNumericString(strconv.FormatFloat(float64(typed), 'f', -1, 64))
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return 0
	default:
		return -1
	}
}

func decimalPlacesFromNumericString(raw string) int {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return -1
	}

	if _, err := strconv.ParseFloat(trimmed, 64); err != nil {
		return -1
	}

	parts := strings.SplitN(trimmed, "e", 2)
	if len(parts) == 1 {
		parts = strings.SplitN(trimmed, "E", 2)
	}

	mantissa := parts[0]
	exponent := 0
	if len(parts) == 2 {
		parsedExponent, err := strconv.Atoi(parts[1])
		if err != nil {
			return -1
		}
		exponent = parsedExponent
	}

	decimalPlaces := 0
	if decimalIndex := strings.IndexByte(mantissa, '.'); decimalIndex >= 0 {
		decimalPlaces = len(mantissa) - decimalIndex - 1
	}

	decimalPlaces -= exponent
	if decimalPlaces < 0 {
		return 0
	}

	return decimalPlaces
}

func maxDecimalPlaces(left int, right int) int {
	if left < 0 {
		return right
	}
	if right < 0 {
		return left
	}
	if left > right {
		return left
	}
	return right
}

func roundToDecimalPlaces(value float64, decimalPlaces int) float64 {
	if decimalPlaces < 0 {
		return value
	}

	factor := math.Pow10(decimalPlaces)
	rounded := math.Round(value*factor) / factor
	if rounded == 0 {
		return 0
	}

	return rounded
}
