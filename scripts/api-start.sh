#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/pg-env.sh"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

: "${ADDRESS_API_TOKEN:?Set ADDRESS_API_TOKEN in the environment or .env.local}"

"$ROOT_DIR/scripts/pg.sh" start >/dev/null

exec node "$ROOT_DIR/server/random-address-api.mjs"
