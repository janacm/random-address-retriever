#!/usr/bin/env bash
set -euo pipefail

# Quick liveness check for both Postgres and the local API.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

: "${ADDRESS_API_TOKEN:?Set ADDRESS_API_TOKEN in the environment or .env.local}"

API_HOST="${ADDRESS_API_HOST:-127.0.0.1}"
API_PORT="${ADDRESS_API_PORT:-8787}"

echo "Postgres ($PGHOST:$PGPORT):"
pg_isready -h "$PGHOST" -p "$PGPORT"

echo "API ($API_HOST:$API_PORT):"
curl -fsS \
  -H "Authorization: Bearer $ADDRESS_API_TOKEN" \
  "http://$API_HOST:$API_PORT/healthz"
echo
