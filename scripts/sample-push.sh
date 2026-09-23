#!/usr/bin/env bash
set -euo pipefail

# Copies the local sample database (built by scripts/sample-build.sh) into a
# hosted Postgres such as Neon or Supabase.
#
#   SAMPLE_DATABASE_URL  libpq connection URI for the hosted database (required),
#                        e.g. postgresql://user:pass@host/db?sslmode=require
#   SAMPLE_DATABASE      local sample database to read (default random_address_sample)
#
# Replaces nar_addresses and nar_cities on the target (sql/sample-schema.sql
# drops them first); nothing else in the target database is touched. Keep the
# URL in your shell or .env.local, never in a committed file.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

SAMPLE_DATABASE="${SAMPLE_DATABASE:-random_address_sample}"
: "${SAMPLE_DATABASE_URL:?Set SAMPLE_DATABASE_URL to the hosted database connection URI}"

"$ROOT_DIR/scripts/db-start.sh" >/dev/null

# db-env.sh exports PGHOST/PGPORT/PGDATABASE/PGUSER for the local cluster. libpq
# fills any field the URL omits from those (hosted URLs usually omit the port),
# so the remote side must not inherit them.
remote_psql() {
  env -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER psql "$SAMPLE_DATABASE_URL" "$@"
}

local_rows="$(psql -h "$PGHOST" -p "$PGPORT" -d "$SAMPLE_DATABASE" -Atqc "SELECT count(*) FROM nar_addresses")"
echo "Pushing $local_rows rows from local $SAMPLE_DATABASE to:"
remote_psql -v ON_ERROR_STOP=1 -c '\conninfo'

remote_psql -v ON_ERROR_STOP=1 -q -f "$ROOT_DIR/sql/sample-schema.sql"

echo "Copying rows..."
psql -h "$PGHOST" -p "$PGPORT" -d "$SAMPLE_DATABASE" -v ON_ERROR_STOP=1 -q \
  -c "COPY nar_addresses TO STDOUT" \
  | remote_psql -v ON_ERROR_STOP=1 -q -c "COPY nar_addresses FROM STDIN"

echo "Building indexes and city view..."
remote_psql -v ON_ERROR_STOP=1 -q -f "$ROOT_DIR/sql/sample-indexes.sql"

remote_rows="$(remote_psql -Atqc "SELECT count(*) FROM nar_addresses")"
if [[ "$remote_rows" != "$local_rows" ]]; then
  echo "Row count mismatch: local $local_rows, remote $remote_rows" >&2
  exit 1
fi

remote_psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT count(*) AS cities FROM nar_cities;
SELECT pg_size_pretty(pg_total_relation_size('nar_addresses')) AS nar_addresses_size,
       pg_size_pretty(pg_database_size(current_database())) AS database_size;
SQL

echo "Done: $remote_rows rows on the hosted database."
