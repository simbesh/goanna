# API

Go backend scaffold using Ent + SQLite.

## Commands

```bash
# Regenerate Ent client
go generate ./ent

# Regenerate OpenAPI Go types
go generate ./internal/api/gen

# Run API server
go run ./cmd/server
```

Server defaults:

- address: `:8080`
- sqlite dsn: `file:./data/goanna.db?_fk=1`
