package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"goanna/apps/api/ent"
	"goanna/apps/api/internal/server"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	dsn := flag.String("dsn", "file:./data/goanna.db?_fk=1", "SQLite DSN")
	flag.Parse()

	if err := os.MkdirAll(filepath.Dir("./data/goanna.db"), 0o755); err != nil {
		log.Fatalf("failed creating data directory: %v", err)
	}

	client, err := ent.Open("sqlite3", *dsn)
	if err != nil {
		log.Fatalf("failed opening sqlite database: %v", err)
	}
	defer client.Close()

	if err := client.Schema.Create(context.Background()); err != nil {
		log.Fatalf("failed running schema migrations: %v", err)
	}

	mux := http.NewServeMux()
	api := server.New(client)
	api.RegisterRoutes(mux)

	log.Printf("api listening on %s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}
