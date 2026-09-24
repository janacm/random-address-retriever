#!/usr/bin/env bash
set -euo pipefail

# Copies the local sample database (built by scripts/sample-build.sh) into a
# hosted Postgres such as Neon or Supabase.
#
#   SAMPLE_DATABASE_URL        libpq connection URI for the hosted database (required),
#                              e.g. postgresql://user:pass@host/db?sslmode=require
#   SAMPLE_DATABASE            local sample database to read (default random_address_sample)
#   SAMPLE_STORAGE_LIMIT_MB    hosted storage cap used by the pre-flight check (default 500)
#   SAMPLE_PUSH_IN_PLACE=1     replace the live tables directly instead of staging
#
# Default (staged): loads nar_addresses and nar_cities into a nar_staging schema,
# builds the indexes, verifies the row count, then swaps both into public in a
# single transaction. The API keeps serving the old data until the swap, and a
# failed or interrupted run leaves the live tables untouched.
#
# Staging holds the old and new copies at once, so it needs about twice the
# sample's size. When that would exceed SAMPLE_STORAGE_LIMIT_MB (a full-size
# sample on a 0.5 GB free tier), the script refuses before touching anything.
# SAMPLE_PUSH_IN_PLACE=1 then drops the live tables and reloads them: the API
# returns no matches until the load finishes, and an interrupted run leaves the
# tables empty or partial until the push is re-run.
#
# Nothing outside nar_addresses, nar_cities, and nar_staging is touched. Keep
# the URL in your shell or .env.local, never in a committed file.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

SAMPLE_DATABASE="${SAMPLE_DATABASE:-random_address_sample}"
SAMPLE_STORAGE_LIMIT_MB="${SAMPLE_STORAGE_LIMIT_MB:-500}"
SAMPLE_PUSH_IN_PLACE="${SAMPLE_PUSH_IN_PLACE:-0}"
: "${SAMPLE_DATABASE_URL:?Set SAMPLE_DATABASE_URL to the hosted database connection URI}"

"$ROOT_DIR/scripts/db-start.sh" >/dev/null

# db-env.sh exports PGHOST/PGPORT/PGDATABASE/PGUSER for the local cluster. libpq
# fills any field the URL omits from those (hosted URLs usually omit the port),
# so the remote side must not inherit them.
remote_psql() {
  env -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER psql "$SAMPLE_DATABASE_URL" "$@"
}

local_psql() {
  psql -h "$PGHOST" -p "$PGPORT" -d "$SAMPLE_DATABASE" -v ON_ERROR_STOP=1 "$@"
}

local_rows="$(local_psql -Atqc "SELECT count(*) FROM nar_addresses")"
sample_bytes="$(local_psql -Atqc "SELECT pg_total_relation_size('nar_addresses') + pg_total_relation_size('nar_cities')")"
echo "Pushing $local_rows rows ($((sample_bytes / 1048576)) MB) from local $SAMPLE_DATABASE to:"
remote_psql -v ON_ERROR_STOP=1 -c '\conninfo'

# Install pg_trgm up front so the IF NOT EXISTS in sample-schema.sql never
# creates it inside nar_staging (which is dropped after the swap).
remote_psql -v ON_ERROR_STOP=1 -q -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

if [[ "$SAMPLE_PUSH_IN_PLACE" == "1" ]]; then
  target_schema="public"
  echo "In-place mode: dropping the live tables; the API has no data until the load finishes."
  remote_psql -v ON_ERROR_STOP=1 -q \
    -c "DROP SCHEMA IF EXISTS nar_staging CASCADE;" \
    -c "DROP MATERIALIZED VIEW IF EXISTS public.nar_cities;" \
    -c "DROP TABLE IF EXISTS public.nar_addresses;"
else
  target_schema="nar_staging"

  # Clear leftovers from an earlier interrupted run before measuring, so they
  # are not counted against the limit.
  remote_psql -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA IF EXISTS nar_staging CASCADE;"
  remote_bytes="$(remote_psql -Atqc "SELECT pg_database_size(current_database())")"
  limit_bytes=$((SAMPLE_STORAGE_LIMIT_MB * 1048576))
  if (( remote_bytes + sample_bytes > limit_bytes )); then
    echo "Staging needs ~$(((remote_bytes + sample_bytes) / 1048576)) MB (current $((remote_bytes / 1048576)) MB + sample $((sample_bytes / 1048576)) MB)," >&2
    echo "over SAMPLE_STORAGE_LIMIT_MB=$SAMPLE_STORAGE_LIMIT_MB. Nothing was changed." >&2
    echo "Re-run with SAMPLE_PUSH_IN_PLACE=1 to replace the live tables directly (brief outage)," >&2
    echo "or build a smaller sample so old and new copies fit side by side." >&2
    exit 1
  fi

  # On any failure before the swap, drop the partial staging copy so it does
  # not hold storage. The live tables are never modified before the swap.
  trap 'echo "Push failed; dropping nar_staging. Live tables are unchanged." >&2
        remote_psql -q -c "DROP SCHEMA IF EXISTS nar_staging CASCADE;" || true' ERR
  remote_psql -v ON_ERROR_STOP=1 -q -c "CREATE SCHEMA nar_staging;"
fi

# The SQL files use unqualified names, so search_path decides where they land.
# public stays on the path so pg_trgm's gin_trgm_ops resolves.
search_path="SET search_path TO $target_schema, public;"

remote_psql -v ON_ERROR_STOP=1 -q -c "$search_path" -f "$ROOT_DIR/sql/sample-schema.sql"

echo "Copying rows into $target_schema..."
local_psql -q -c "COPY nar_addresses TO STDOUT" \
  | remote_psql -v ON_ERROR_STOP=1 -q -c "COPY $target_schema.nar_addresses FROM STDIN"

echo "Building indexes and city view..."
remote_psql -v ON_ERROR_STOP=1 -q -c "$search_path" -f "$ROOT_DIR/sql/sample-indexes.sql"

loaded_rows="$(remote_psql -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM $target_schema.nar_addresses")"
if [[ "$loaded_rows" != "$local_rows" ]]; then
  echo "Row count mismatch: local $local_rows, loaded $loaded_rows" >&2
  false
fi

if [[ "$target_schema" == "nar_staging" ]]; then
  echo "Swapping nar_staging into public..."
  # Indexes move with their table, and the view keeps pointing at the moved
  # table. Readers see either the old tables or the new ones, never neither.
  remote_psql -v ON_ERROR_STOP=1 -q -1 \
    -c "DROP MATERIALIZED VIEW IF EXISTS public.nar_cities;" \
    -c "DROP TABLE IF EXISTS public.nar_addresses;" \
    -c "ALTER TABLE nar_staging.nar_addresses SET SCHEMA public;" \
    -c "ALTER MATERIALIZED VIEW nar_staging.nar_cities SET SCHEMA public;" \
    -c "DROP SCHEMA nar_staging;"
  trap - ERR
fi

remote_psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT count(*) AS cities FROM public.nar_cities;
SELECT pg_size_pretty(pg_total_relation_size('public.nar_addresses')) AS nar_addresses_size,
       pg_size_pretty(pg_database_size(current_database())) AS database_size;
SQL

echo "Done: $loaded_rows rows on the hosted database."
