# API

Go backend scaffold using Ent + SQLite.

## API surface

- `GET /healthz`
- `GET /v1/monitors`
- `POST /v1/monitors`
- `GET /v1/monitors/{monitorId}/checks`
- `GET /v1/settings/notifications/telegram`
- `PUT /v1/settings/notifications/telegram`
- `GET /v1/settings/runtime`
- `PUT /v1/settings/runtime`

## Worker behavior

- Polls enabled monitors, schedules runs using cron expressions, and executes checks
- Persists runtime status and lifetime counters in `monitor_runtime`
- Stores check history in `check_results` and keeps only the latest configured limit per monitor

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
- max response body bytes for worker checks and selector payload caching: `25165824` (`GOANNA_MAX_RESPONSE_BODY_BYTES`)
