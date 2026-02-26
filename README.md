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
