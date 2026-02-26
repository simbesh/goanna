# AGENTS.md

This file is guidance for autonomous coding agents working in `d:\dev\goanna`.

## Mission and Scope

- Respect existing architecture and conventions in this monorepo.
- Make minimal, targeted changes.
- Prefer updating source-of-truth files, then regenerate derived code.
- Do not introduce unrelated refactors.

## Non-Negotiable Runtime Rule

- Never run the API server or web dev server in this repository.
- The human user starts/stops servers manually.
- Forbidden examples:
  - `bun run dev:web`
  - `bun run dev:api`
  - `go run ./apps/api/cmd/server`
  - `vite dev` / `vite preview`
- If validation would normally require a running server, use build/lint/test/type-check commands instead.

## Repository Map

- `apps/web`: TanStack Start + React + TypeScript + Tailwind + shadcn/ui.
- `apps/api`: Go API using Ent and SQLite.
- `packages/api-client`: generated TypeScript client from OpenAPI.
- `openapi/openapi.yaml`: shared API contract.

## Toolchain

- Bun `1.3+`
- Go `1.24+`
- TypeScript `5.9.x` (root/api-client) and `5.7.x` (web)

## Workspace Policy Files

- Checked for Cursor rules in `.cursor/rules/` and `.cursorrules`: none found.
- Checked for Copilot rules in `.github/copilot-instructions.md`: none found.
- If these files are added later, treat them as higher-priority constraints and merge their guidance into your plan.

## Install and Bootstrap

- Install deps: `bun install`
- Full bootstrap (deps + codegen): `bun run bootstrap`

## Build Commands

- Build web app: `bun run build:web`
- Build web app directly: `bun run --cwd apps/web build`
- Build Go API binary (without running): `go build ./cmd/server` (run in `apps/api`)
- Type-check API client package: `bun run --cwd packages/api-client check`

## Lint and Format Commands

- Web lint: `bun run --cwd apps/web lint .`
- Web auto-fix + format: `bun run --cwd apps/web check`
- Web format only: `bun run --cwd apps/web format --write .`
- Go formatting (when touching Go files): `gofmt -w <files>`
- Optional Go static checks: `go vet ./...` (run in `apps/api`)

## Test Commands

- Web tests (all): `bun run test:web`
- Web tests (package): `bun run --cwd apps/web test`
- Web single test file:
  - `bun run --cwd apps/web vitest run src/path/to/file.test.ts`
- Web single test by name:
  - `bun run --cwd apps/web vitest run src/path/to/file.test.ts -t "test name"`
  - or via root passthrough: `bun run test:web -- src/path/to/file.test.ts -t "test name"`
- Go tests (all): `go test ./...` (run in `apps/api`)
- Go single package: `go test ./internal/server`
- Go single test by name:
  - `go test ./internal/server -run '^TestName$'`
  - `go test ./... -run '^TestName$'`

## Code Generation Commands

- Regenerate Ent code: `bun run gen:ent` or `go generate ./ent` (in `apps/api`)
- Regenerate OpenAPI Go types: `bun run gen:api:go` or `go generate ./internal/api/gen` (in `apps/api`)
- Regenerate TS client: `bun run gen:api:ts` or `bun run --cwd packages/api-client generate`
- Regenerate both OpenAPI outputs: `bun run gen:api`

## Generated Files and Edit Rules

- Do not hand-edit generated files unless explicitly requested.
- Generated locations include:
  - `apps/api/ent/**` (except schema/source generator files like `apps/api/ent/schema/*.go`, `apps/api/ent/generate.go`)
  - `apps/api/internal/api/gen/openapi.gen.go`
  - `packages/api-client/src/generated/**`
  - `apps/web/src/routeTree.gen.ts`
- When changing API contracts or Ent schema:
  1. Edit source-of-truth files.
  2. Run generation commands.
  3. Include regenerated outputs in the same change.

## General Coding Style

- Keep diffs small and focused.
- Follow existing naming and file placement patterns.
- Prefer explicit, readable code over dense abstractions.
- Avoid adding new dependencies unless justified.
- Use UTC where time behavior matters (matches existing backend behavior).

## TypeScript/React Conventions (`apps/web`, `packages/api-client`)

- Formatting is Prettier-driven in web:
  - single quotes
  - no semicolons
  - trailing commas
- Use `import type` for type-only imports.
- Group imports as: third-party -> local alias (`@/...`) -> relative; keep a blank line between groups.
- Prefer function components and local helper functions over class components.
- Use PascalCase for React components/types; camelCase for variables/functions.
- Keep route modules aligned with TanStack file routing (`src/routes/*.tsx`).
- Use strict TypeScript patterns:
  - avoid `any` unless unavoidable
  - model optional values explicitly (`string | undefined`, nullable API fields)
  - narrow unknown data before use
- Reuse shared utilities (`cn`, UI primitives) instead of duplicating helpers.

## Go Conventions (`apps/api`)

- Let `gofmt` define formatting; do not manually align whitespace.
- Keep packages small and purpose-specific (`internal/server`, `internal/worker`, etc.).
- Prefer early returns for validation and error paths.
- Wrap external input handling with clear validation (path/query/body).
- Use typed structs for JSON requests/responses with explicit tags.
- Keep optional JSON fields as pointer types when omission matters.
- Use `context.Context` from request flow; propagate it through DB operations.
- Prefer descriptive but concise log/error messages.
- Never use panic for expected runtime errors.

## Naming Conventions

- Go exported identifiers: PascalCase; unexported: camelCase.
- TS/React components/types/interfaces: PascalCase.
- TS variables/functions/hooks: camelCase.
- Constants:
  - Go: camelCase (or PascalCase if exported), matching current codebase.
  - TS: camelCase by default; reserve UPPER_SNAKE for true global constants.

## Error Handling and API Behavior

- Keep user-facing error messages actionable and stable.
- In HTTP handlers, return early after writing an error response.
- Do not leak internal stack traces or SQL errors in API responses.
- Preserve current response shapes in `openapi/openapi.yaml` and server handlers.
- For frontend async flows, maintain loading/saving flags and clear prior messages before retries.

## Validation Checklist for Agents

- Run only relevant checks for touched areas.
- Minimum for web changes: lint + targeted tests (or full web tests if no target exists).
- Minimum for API changes: `go test` for touched package(s), optionally `go test ./...`.
- If schema or OpenAPI changed, run generation and include generated artifacts.
- Do not start servers as part of validation.

## Git Hygiene

- Do not revert unrelated user changes.
- Do not rewrite history unless explicitly asked.
- Keep commits cohesive and explain the why in commit messages.
- Never Push.
