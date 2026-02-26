#!/bin/sh
set -eu

mkdir -p /app/data

api_pid=''
web_pid=''
gateway_pid=''

shutdown() {
  if [ -n "$api_pid" ]; then
    kill -TERM "$api_pid" 2>/dev/null || true
  fi

  if [ -n "$web_pid" ]; then
    kill -TERM "$web_pid" 2>/dev/null || true
  fi

  if [ -n "$gateway_pid" ]; then
    kill -TERM "$gateway_pid" 2>/dev/null || true
  fi
}

trap shutdown INT TERM

/app/bin/goanna-api -addr "$GOANNA_API_ADDR" -dsn "$GOANNA_API_DSN" &
api_pid=$!

HOST='127.0.0.1' \
PORT="$GOANNA_WEB_INTERNAL_PORT" \
NITRO_HOST='127.0.0.1' \
NITRO_PORT="$GOANNA_WEB_INTERNAL_PORT" \
bun /app/web/.output/server/index.mjs &
web_pid=$!

GOANNA_WEB_INTERNAL_URL="http://127.0.0.1:${GOANNA_WEB_INTERNAL_PORT}" \
GOANNA_API_INTERNAL_URL="${GOANNA_API_INTERNAL_URL:-http://127.0.0.1:8080}" \
bun /app/docker/gateway.mjs &
gateway_pid=$!

status=0
while :; do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    wait "$api_pid" || status=$?
    break
  fi

  if ! kill -0 "$web_pid" 2>/dev/null; then
    wait "$web_pid" || status=$?
    break
  fi

  if ! kill -0 "$gateway_pid" 2>/dev/null; then
    wait "$gateway_pid" || status=$?
    break
  fi

  sleep 1
done

shutdown
wait "$api_pid" 2>/dev/null || true
wait "$web_pid" 2>/dev/null || true
wait "$gateway_pid" 2>/dev/null || true

exit "$status"
