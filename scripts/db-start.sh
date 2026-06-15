#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

"$ROOT_DIR/scripts/db-mount.sh" >/dev/null

mkdir -p "$ROOT_DIR/logs"

if [[ ! -d "$PGDATA/base" ]]; then
  "$ROOT_DIR/scripts/db-init.sh"
  exit 0
fi

if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  echo "Postgres is already running at postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
else
  pg_ctl -D "$PGDATA" -l "$ROOT_DIR/logs/postgres.log" -o "-p $PGPORT -k /tmp" start
  echo "Postgres started at postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
fi
