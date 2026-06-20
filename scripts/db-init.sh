#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

"$ROOT_DIR/scripts/db-mount.sh" >/dev/null

mkdir -p "$ROOT_DIR/logs"

if [[ ! -d "$PGDATA/base" ]]; then
  initdb -D "$PGDATA" --encoding=UTF8 --locale=C
fi

if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  pg_ctl -D "$PGDATA" -l "$ROOT_DIR/logs/postgres.log" -o "-p $PGPORT -k /tmp" start
fi

if ! psql -h "$PGHOST" -p "$PGPORT" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$PGDATABASE'" | grep -q 1; then
  createdb -h "$PGHOST" -p "$PGPORT" "$PGDATABASE"
fi

psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -f "$ROOT_DIR/sql/schema.sql"

echo "Postgres is running at postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
