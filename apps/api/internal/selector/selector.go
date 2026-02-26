package selector

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/tidwall/gjson"
)

type Selection struct {
	Exists bool
	Type   string
	Raw    string
	Value  string
}

func SelectJSON(payload []byte, selector string) (Selection, error) {
	if !gjson.ValidBytes(payload) {
		return Selection{}, fmt.Errorf("invalid JSON payload")
	}

	trimmedSelector := strings.TrimSpace(selector)
	if trimmedSelector == "" {
		root := gjson.ParseBytes(payload)
		raw := strings.TrimSpace(string(payload))
		return Selection{
			Exists: true,
			Type:   gjsonType(root.Type),
			Raw:    raw,
			Value:  normalizeValue(root, raw),
		}, nil
	}

	selected := gjson.GetBytes(payload, trimmedSelector)
	if !selected.Exists() {
		return Selection{Exists: false, Type: "none"}, nil
	}

	raw := strings.TrimSpace(selected.Raw)
	return Selection{
		Exists: true,
		Type:   gjsonType(selected.Type),
		Raw:    raw,
		Value:  normalizeValue(selected, raw),
	}, nil
}

func gjsonType(valueType gjson.Type) string {
	switch valueType {
	case gjson.Null:
		return "null"
	case gjson.False:
		return "false"
	case gjson.Number:
		return "number"
	case gjson.String:
		return "string"
	case gjson.True:
		return "true"
	case gjson.JSON:
		return "json"
	default:
		return "none"
	}
}

func normalizeValue(result gjson.Result, raw string) string {
	if result.Type == gjson.String {
		return strings.TrimSpace(result.String())
	}

	trimmedRaw := strings.TrimSpace(raw)
	if trimmedRaw == "" && result.Type == gjson.Null {
		trimmedRaw = "null"
	}

	var decoded any
	if err := json.Unmarshal([]byte(trimmedRaw), &decoded); err == nil {
		encoded, encodeErr := json.Marshal(decoded)
		if encodeErr == nil {
			return strings.TrimSpace(string(encoded))
		}
	}

	return trimmedRaw
}
