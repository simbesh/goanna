FROM oven/bun:1.3 AS web-builder
WORKDIR /src

# Install workspace dependencies first for better layer caching.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN bun install --frozen-lockfile

# Build the production web bundle.
COPY . .
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
RUN go mod download

COPY apps/api ./
RUN go build -o /out/goanna-api ./cmd/server

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

COPY --from=web-builder /usr/local/bin/bun /usr/local/bin/bun

RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

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
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
COPY docker/gateway.mjs /app/docker/gateway.mjs

RUN chmod +x /app/bin/goanna-api /app/docker/entrypoint.sh /app/docker/gateway.mjs \
  && sed -i 's/\r$//' /app/docker/entrypoint.sh \
  && mkdir -p /app/data

EXPOSE 9044 8080
VOLUME ["/app/data"]

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
