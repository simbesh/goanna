package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"

	"goanna/apps/api/ent"
	"goanna/apps/api/internal/server"
	"goanna/apps/api/internal/worker"

	_ "github.com/mattn/go-sqlite3"
)

const maxResponseBodyBytesEnv = "GOANNA_MAX_RESPONSE_BODY_BYTES"

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	addr := flag.String("addr", ":8080", "HTTP listen address")
	dsn := flag.String("dsn", "file:./data/goanna.db?_fk=1", "SQLite DSN")
	flag.Parse()

	if err := os.MkdirAll(filepath.Dir("./data/goanna.db"), 0o755); err != nil {
		logger.Error("failed creating data directory", "error", err)
		os.Exit(1)
	}

	client, err := ent.Open("sqlite3", *dsn)
	if err != nil {
		logger.Error("failed opening sqlite database", "error", err)
		os.Exit(1)
	}
	defer client.Close()

	if err := client.Schema.Create(context.Background()); err != nil {
		logger.Error("failed running schema migrations", "error", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	maxResponseBodyBytes := loadPositiveIntEnv(
		maxResponseBodyBytesEnv,
		worker.DefaultMaxResponseBodyBytes,
		logger,
	)
	api := server.NewWithConfig(client, server.Config{
		MaxSelectorPayloadBytes: maxResponseBodyBytes,
	})
	api.RegisterRoutes(mux)

	go worker.NewWithConfig(client, worker.Config{
		MaxResponseBodyBytes: maxResponseBodyBytes,
	}).Start(context.Background())
	logger.Info("background worker started")

	handler := withRequestLogging(logger, withCORS(mux))

	logger.Info("api listening", "addr", *addr)
	if err := http.ListenAndServe(*addr, handler); err != nil {
		logger.Error("server exited with error", "error", err)
		os.Exit(1)
	}
}

func withRequestLogging(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		responseWriter := &loggingResponseWriter{ResponseWriter: w}

		next.ServeHTTP(responseWriter, r)

		attrs := []any{
			"method", r.Method,
			"path", r.URL.Path,
			"status", responseWriter.StatusCode(),
			"bytes", responseWriter.bytesWritten,
			"duration_ms", time.Since(start).Milliseconds(),
		}
		if r.Pattern != "" {
			attrs = append(attrs, "pattern", r.Pattern)
		}

		logger.Info("http request", attrs...)
	})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type loggingResponseWriter struct {
	http.ResponseWriter
	statusCode   int
	bytesWritten int
}

func (w *loggingResponseWriter) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *loggingResponseWriter) Write(body []byte) (int, error) {
	if w.statusCode == 0 {
		w.statusCode = http.StatusOK
	}

	bytesWritten, err := w.ResponseWriter.Write(body)
	w.bytesWritten += bytesWritten
	return bytesWritten, err
}

func (w *loggingResponseWriter) StatusCode() int {
	if w.statusCode == 0 {
		return http.StatusOK
	}

	return w.statusCode
}

func loadPositiveIntEnv(key string, fallback int, logger *slog.Logger) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		logger.Warn(
			"invalid environment override, using default",
			"key",
			key,
			"value",
			raw,
			"default",
			fallback,
		)
		return fallback
	}

	return parsed
}
