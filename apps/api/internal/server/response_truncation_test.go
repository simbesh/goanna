package server

import (
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"goanna/apps/api/ent"
)

func TestTruncateResponseStringLeavesShortValueUntouched(t *testing.T) {
	value := "short value"
	got := truncateResponseString(value)

	if got != value {
		t.Fatalf("expected value to remain unchanged, got %q", got)
	}
}

func TestTruncateResponseStringLimitsLargeValues(t *testing.T) {
	value := strings.Repeat("x", maxResponseStringBytes+128)
	got := truncateResponseString(value)

	if len(got) != maxResponseStringBytes {
		t.Fatalf("expected truncated length %d, got %d", maxResponseStringBytes, len(got))
	}

	if !strings.HasSuffix(got, truncationSuffix) {
		t.Fatalf("expected truncation suffix %q, got %q", truncationSuffix, got)
	}
}

func TestTruncateResponseStringKeepsUTF8Boundary(t *testing.T) {
	prefixBytes := maxResponseStringBytes - len(truncationSuffix)
	value := strings.Repeat("a", prefixBytes-1) + "\u00e9tail"

	got := truncateResponseString(value)
	if !utf8.ValidString(got) {
		t.Fatalf("expected truncated value to be valid UTF-8, got %q", got)
	}
}

func TestTruncateTestResponseStringLimitsToSmallPreview(t *testing.T) {
	value := strings.Repeat("z", maxTestResponseBodyBytes+64)
	got := truncateTestResponseString(value)

	if len(got) != maxTestResponseBodyBytes {
		t.Fatalf("expected truncated length %d, got %d", maxTestResponseBodyBytes, len(got))
	}

	if !strings.HasSuffix(got, truncationSuffix) {
		t.Fatalf("expected truncation suffix %q, got %q", truncationSuffix, got)
	}
}

func TestTruncateSelectorPreviewStringLimitsToSmallPreview(t *testing.T) {
	value := strings.Repeat("q", maxSelectorPreviewBytes+64)
	got := truncateSelectorPreviewString(value)

	if len(got) != maxSelectorPreviewBytes {
		t.Fatalf("expected truncated length %d, got %d", maxSelectorPreviewBytes, len(got))
	}

	if !strings.HasSuffix(got, truncationSuffix) {
		t.Fatalf("expected truncation suffix %q, got %q", truncationSuffix, got)
	}
}

func TestDecodeTestResponseBodyTruncatesLargeJSON(t *testing.T) {
	payload := []byte(`{"items":[` + strings.Repeat(`{"value":"abcdefghij"},`, 512) + `{}]}`)

	decoded := decodeTestResponseBody(payload, "application/json")
	text, ok := decoded.(string)
	if !ok {
		t.Fatalf("expected large payload to return a truncated string preview, got %T", decoded)
	}

	if len(text) != maxTestResponseBodyBytes {
		t.Fatalf("expected truncated preview length %d, got %d", maxTestResponseBodyBytes, len(text))
	}

	if !strings.HasSuffix(text, truncationSuffix) {
		t.Fatalf("expected preview to end with %q, got %q", truncationSuffix, text)
	}
}

func TestDecodeTestResponseBodyDecodesSmallJSON(t *testing.T) {
	payload := []byte(`{"ok":true,"value":"small"}`)

	decoded := decodeTestResponseBody(payload, "application/json")
	object, ok := decoded.(map[string]any)
	if !ok {
		t.Fatalf("expected decoded JSON object, got %T", decoded)
	}

	if object["ok"] != true {
		t.Fatalf("expected decoded field ok=true, got %#v", object["ok"])
	}
}

func TestStoreAndLoadSelectorPayload(t *testing.T) {
	server := New(nil)
	payload := []byte(`{"value":42}`)

	token := server.storeSelectorPayload(payload)
	if token == "" {
		t.Fatal("expected selector payload token")
	}

	loaded, ok := server.loadSelectorPayload(token)
	if !ok {
		t.Fatal("expected selector payload to be available")
	}

	if string(loaded) != string(payload) {
		t.Fatalf("expected loaded payload %q, got %q", string(payload), string(loaded))
	}
}

func TestLoadSelectorPayloadExpires(t *testing.T) {
	server := New(nil)
	server.selectorPayloads["expired"] = selectorPayloadEntry{
		payload:   []byte(`{"expired":true}`),
		expiresAt: time.Now().UTC().Add(-time.Second),
	}

	_, ok := server.loadSelectorPayload("expired")
	if ok {
		t.Fatal("expected expired payload to be unavailable")
	}
}

func TestMapMonitorCheckTruncatesLargeStringFields(t *testing.T) {
	large := strings.Repeat("y", maxResponseStringBytes+64)
	row := &ent.CheckResult{
		ID:             1,
		Status:         "ok",
		DiffChanged:    true,
		ErrorMessage:   &large,
		SelectionValue: &large,
		DiffSummary:    &large,
		DiffDetails:    &large,
	}

	mapped := mapMonitorCheck(row)

	assertTruncatedPointer(t, mapped.ErrorMessage)
	assertTruncatedPointer(t, mapped.SelectionValue)
	assertTruncatedPointer(t, mapped.DiffSummary)
	assertTruncatedPointer(t, mapped.DiffDetails)
}

func assertTruncatedPointer(t *testing.T, value *string) {
	t.Helper()

	if value == nil {
		t.Fatal("expected value to be present")
	}

	if len(*value) != maxResponseStringBytes {
		t.Fatalf("expected truncated length %d, got %d", maxResponseStringBytes, len(*value))
	}

	if !strings.HasSuffix(*value, truncationSuffix) {
		t.Fatalf("expected value to end with %q, got %q", truncationSuffix, *value)
	}
}
