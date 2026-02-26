# goanna

Monorepo scaffold for endpoint monitoring.

## Stack

- `apps/web`: TanStack Start + Tailwind + shadcn/ui
- `apps/api`: Go API + Ent ORM + SQLite
- `packages/api-client`: generated TypeScript client from OpenAPI
- `openapi/openapi.yaml`: shared API contract

## Prerequisites

- Bun 1.3+
- Go 1.24+

## Bootstrap

```bash
bun run bootstrap
```

## Common commands

```bash
# Frontend dev server
bun run dev:web

# Backend dev server
bun run dev:api

# Regenerate Ent and OpenAPI code
bun run gen:ent
bun run gen:api
```

## Configuration

- `GOANNA_MAX_RESPONSE_BODY_BYTES` (optional): max API response body size for monitor checks and selector payload caching
- default: `25165824` (24 MB)
- example: `GOANNA_MAX_RESPONSE_BODY_BYTES=33554432 bun run dev:api`

## Docker (single image, production)

This repository now includes a production `Dockerfile` that runs both services in one container:

- Web (TanStack Start/Nitro) on `9044`
- API (Go + SQLite) internally on `8080` (optional external port mapping)

### Build image

```bash
docker build -t goanna:latest --build-arg VITE_API_BASE_URL=/ .
```

`VITE_API_BASE_URL` is a build-time variable used by the web app. Use `/` to route browser API calls through the web gateway in the same container.

### Runtime environment variables

- `GOANNA_WEB_HOST` (default: `0.0.0.0`)
- `GOANNA_WEB_PORT` (default: `9044`)
- `GOANNA_WEB_INTERNAL_PORT` (default: `9045`)
- `GOANNA_API_ADDR` (default: `:8080`)
- `GOANNA_API_DSN` (default: `file:/app/data/goanna.db?_fk=1`)
- `GOANNA_MAX_RESPONSE_BODY_BYTES` (default: `25165824`)
- `GOANNA_API_INTERNAL_URL` (optional, default: `http://127.0.0.1:8080`)

By default, only the web port is published. The API stays internal and is proxied through the web port for `/v1/*` and `/healthz`.

### Docker Compose example (all options)

```yaml
services:
  goanna:
    image: ghcr.io/simbesh/goanna:latest
    # Optional: build locally instead of pulling
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: /
    environment:
      GOANNA_WEB_HOST: 0.0.0.0
      GOANNA_WEB_PORT: '9044'
      GOANNA_WEB_INTERNAL_PORT: '9045'
      GOANNA_API_ADDR: ':8080'
      GOANNA_API_DSN: file:/app/data/goanna.db?_fk=1
      GOANNA_MAX_RESPONSE_BODY_BYTES: '25165824'
    ports:
      - '9044:9044'
      # Optional: expose API publicly if needed later
      # - '8080:8080'
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### One-line `docker run` example

```bash
docker run -d --name goanna -p 9044:9044 -e GOANNA_WEB_HOST=0.0.0.0 -e GOANNA_WEB_PORT=9044 -e GOANNA_WEB_INTERNAL_PORT=9045 -e GOANNA_API_ADDR=:8080 -e GOANNA_API_DSN='file:/app/data/goanna.db?_fk=1' -e GOANNA_MAX_RESPONSE_BODY_BYTES=25165824 -v ./data:/app/data goanna:latest
```

To expose the API later, add `-p 8080:8080` to `docker run` (or uncomment it in Compose).

### GitHub Actions image pipeline

CI is configured in `.github/workflows/docker-image.yml`:

- Pull requests: build-only validation
- `main`/tags: build and push to `ghcr.io/simbesh/goanna`
- Optional repo variable for frontend API URL: `VITE_API_BASE_URL`

## Layout

```text
apps/
  api/
  web/
openapi/
packages/
  api-client/
```

## Current scaffold features

- Monitor CRUD API with cron-only scheduling (`/v1/monitors`)
- Monitor recent checks API (`/v1/monitors/{monitorId}/checks`)
- Background worker stores monitor runtime state (`pending|ok|error|retrying|disabled`)
- Lifetime counters per monitor (`checkCount`, success/error/retry counters)
- Global history retention setting for all monitors (`/v1/settings/runtime`)
- Telegram notification channel settings API (`/v1/settings/notifications/telegram`)
- Frontend monitor creation form with a built-in cron builder + custom cron input
- Frontend Settings page with Notifications + Runtime tabs
