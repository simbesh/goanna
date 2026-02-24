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
