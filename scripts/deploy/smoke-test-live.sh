#!/bin/bash
set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Usage: $0 <healthcheck-url>"
  exit 2
fi

ATTEMPTS="${SMOKE_ATTEMPTS:-6}"
INTERVAL_SECONDS="${SMOKE_INTERVAL_SECONDS:-10}"
MAX_TIME_SECONDS="${SMOKE_MAX_TIME_SECONDS:-20}"
ALLOW_INSECURE_TLS="${SMOKE_INSECURE_TLS:-false}"

if [[ "$ALLOW_INSECURE_TLS" == "true" ]]; then
  CURL_TLS_ARGS=(-k)
else
  CURL_TLS_ARGS=()
fi

echo "Running live smoke test against: $URL"
echo "Attempts=$ATTEMPTS interval=${INTERVAL_SECONDS}s timeout=${MAX_TIME_SECONDS}s insecureTLS=$ALLOW_INSECURE_TLS"

for (( attempt=1; attempt<=ATTEMPTS; attempt++ )); do
  status_code=$(curl -sS "${CURL_TLS_ARGS[@]}" --max-time "$MAX_TIME_SECONDS" -o /tmp/nunti-smoke-body.out -w "%{http_code}" "$URL" || true)

  if [[ "$status_code" == "200" ]]; then
    echo "Smoke test passed on attempt $attempt/$ATTEMPTS (HTTP 200)."
    head -c 300 /tmp/nunti-smoke-body.out || true
    echo
    exit 0
  fi

  echo "Attempt $attempt/$ATTEMPTS failed (HTTP $status_code)."
  if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
    sleep "$INTERVAL_SECONDS"
  fi
done

echo "Smoke test failed after $ATTEMPTS attempts. Last response preview:"
if [[ -f /tmp/nunti-smoke-body.out ]]; then
  head -c 500 /tmp/nunti-smoke-body.out || true
else
  echo "No response body captured."
fi
echo
exit 1