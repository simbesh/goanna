package worker

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"goanna/apps/api/ent"
	"goanna/apps/api/ent/monitor"
)

func TestExecuteOnceHandlesLargeJSONResponses(t *testing.T) {
	body := buildPairResponseJSON(50000)
	if len(body) <= 1<<20 {
		t.Fatalf("expected test payload above 1 MiB, got %d", len(body))
	}
	if len(body) >= DefaultMaxResponseBodyBytes {
		t.Fatalf("expected test payload below %d bytes, got %d", DefaultMaxResponseBodyBytes, len(body))
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	defer server.Close()

	selector := `result.@keys.#(%"*AUD")#`
	row := &ent.Monitor{
		Method:       http.MethodGet,
		URL:          server.URL,
		ExpectedType: monitor.ExpectedTypeJSON,
		Selector:     &selector,
	}

	w := &Worker{client: server.Client()}
	w.maxResponseBodyBytes = DefaultMaxResponseBodyBytes
	result := w.executeOnce(t.Context(), row)

	if !result.success {
		if result.errorMessage != nil {
			t.Fatalf("expected large JSON response to succeed, got error %q", *result.errorMessage)
		}
		t.Fatal("expected large JSON response to succeed")
	}
	if result.selection == nil || !result.selection.Exists {
		t.Fatalf("expected selector to resolve, got %#v", result.selection)
	}
	if !strings.Contains(result.selection.Value, "PAIR0AUD") {
		t.Fatalf("expected selector output to include first pair key, got %q", result.selection.Value)
	}
}

func TestExecuteOnceRejectsOversizedResponses(t *testing.T) {
	oversized := `{"result":"` + strings.Repeat("a", DefaultMaxResponseBodyBytes) + `"}`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(oversized))
	}))
	defer server.Close()

	row := &ent.Monitor{
		Method:       http.MethodGet,
		URL:          server.URL,
		ExpectedType: monitor.ExpectedTypeJSON,
	}

	w := &Worker{client: server.Client()}
	w.maxResponseBodyBytes = DefaultMaxResponseBodyBytes
	result := w.executeOnce(t.Context(), row)

	if result.success {
		t.Fatal("expected oversized response to fail")
	}
	if result.errorMessage == nil {
		t.Fatal("expected oversized response error message")
	}
	want := fmt.Sprintf(
		"response body exceeds %d bytes limit (increase GOANNA_MAX_RESPONSE_BODY_BYTES)",
		DefaultMaxResponseBodyBytes,
	)
	if *result.errorMessage != want {
		t.Fatalf("expected error %q, got %q", want, *result.errorMessage)
	}
}

func buildPairResponseJSON(count int) []byte {
	var builder strings.Builder
	builder.Grow(count*32 + 32)
	builder.WriteString(`{"result":{`)
	for index := 0; index < count; index++ {
		if index > 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(`"PAIR`)
		builder.WriteString(strconv.Itoa(index))
		builder.WriteString(`AUD":{"status":"online"}`)
	}
	builder.WriteString(`}}`)

	return []byte(builder.String())
}
