# syntax=docker/dockerfile:1

FROM oven/bun:1.3 AS web-builder
WORKDIR /src

# Keep dependency installation independent of source changes.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# API and Docker-only edits should not invalidate the web build.
COPY packages/api-client ./packages/api-client
COPY apps/web ./apps/web
ARG VITE_API_BASE_URL=/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN bun run --cwd apps/web build

FROM golang:1.24-bookworm AS api-builder
WORKDIR /src/apps/api

# github.com/mattn/go-sqlite3 requires a C toolchain during build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY apps/api/go.mod apps/api/go.sum ./
# Keep downloaded modules in the layer as well as caching compilation below;
# the existing CI layer cache can restore them on a fresh runner.
RUN go mod download

COPY apps/api ./
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 go build -trimpath -ldflags='-s -w' -o /out/goanna-api ./cmd/server

# The entrypoint runs both JavaScript processes with Bun, so Node is unnecessary.
FROM debian:bookworm-slim AS runtime
WORKDIR /app

COPY --from=web-builder /usr/local/bin/bun /usr/local/bin/bun

RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates libstdc++6 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/data

ENV NODE_ENV=production
ENV GOANNA_WEB_HOST=0.0.0.0
ENV GOANNA_WEB_PORT=9044
ENV GOANNA_WEB_INTERNAL_PORT=9045
ENV GOANNA_API_ADDR=:8080
ENV GOANNA_API_INTERNAL_URL=http://127.0.0.1:8080
ENV GOANNA_API_DSN=file:/app/data/goanna.db?_fk=1
ENV GOANNA_MAX_RESPONSE_BODY_BYTES=25165824

COPY --from=api-builder /out/goanna-api /app/bin/goanna-api
COPY --from=web-builder /src/apps/web/.output /app/web/.output
COPY --chmod=755 docker/entrypoint.sh /app/docker/entrypoint.sh
COPY docker/gateway.mjs /app/docker/gateway.mjs

RUN sed -i 's/\r$//' /app/docker/entrypoint.sh

EXPOSE 9044 8080
VOLUME ["/app/data"]

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
