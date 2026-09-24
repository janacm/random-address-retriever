#!/usr/bin/env bash
set -euo pipefail

# Copies the local sample database (built by scripts/sample-build.sh) into a
# hosted Postgres such as Neon or Supabase.
#
#   SAMPLE_DATABASE_URL        libpq connection URI for the hosted database (required),
#                              e.g. postgresql://user:pass@host/db?sslmode=require
#   SAMPLE_DATABASE            local sample database to read (default random_address_sample)
#   SAMPLE_STORAGE_LIMIT_MB    storage cap for the pre-flight check, in whole MiB. Default:
#                              Neon's neon.max_cluster_size when the target reports it,
#                              else 500. Can lower a reported cap, never raise it
#   SAMPLE_PUSH_IN_PLACE=1     replace the live tables directly instead of staging
#   SAMPLE_PUSH_ALLOW_SHRINK=1 allow a sample that covers fewer cities than the target
#
# Default (staged): loads nar_addresses and nar_cities into a nar_staging schema,
# builds the indexes, verifies row and city counts, then swaps both into public
# in a single transaction. The API keeps serving the old data until the swap,
# and a failed or interrupted run drops the staging copy and leaves the live
# tables untouched.
#
# A read-only pre-flight runs first and refuses, without changing the target,
# when: the local sample is empty or its columns differ from sql/sample-schema.sql;
# it covers fewer cities than the target serves; or the result would not fit
# the storage cap, measured across the whole target cluster (Neon's cap counts
# every database, not just this one). Staging holds the old and new copies at
# once, so on a 0.5 GB free tier a full-size sample does not fit staged.
# SAMPLE_PUSH_IN_PLACE=1 then drops and recreates the live table in one
# transaction and reloads it: lookups find nothing and /api/cities errors until
# the load finishes, and a failed run leaves the tables empty or partial until
# the push is re-run.
#
# Besides pg_trgm (installed if missing), nothing outside nar_addresses,
# nar_cities, and nar_staging is touched. Keep the URL in your shell or
# .env.local, never in a committed file.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

SAMPLE_DATABASE="${SAMPLE_DATABASE:-random_address_sample}"
SAMPLE_STORAGE_LIMIT_MB="${SAMPLE_STORAGE_LIMIT_MB:-}"
SAMPLE_PUSH_IN_PLACE="${SAMPLE_PUSH_IN_PLACE:-0}"
SAMPLE_PUSH_ALLOW_SHRINK="${SAMPLE_PUSH_ALLOW_SHRINK:-0}"
: "${SAMPLE_DATABASE_URL:?Set SAMPLE_DATABASE_URL to the hosted database connection URI}"

refuse() {
  printf '%s\n' "$@" "Nothing on the target was changed." >&2
  exit 1
}

mib() { echo "$(($1 / 1048576))"; }

[[ "$SAMPLE_PUSH_IN_PLACE" =~ ^[01]$ ]] || refuse "SAMPLE_PUSH_IN_PLACE must be 0 or 1."
[[ "$SAMPLE_PUSH_ALLOW_SHRINK" =~ ^[01]$ ]] || refuse "SAMPLE_PUSH_ALLOW_SHRINK must be 0 or 1."
[[ -z "$SAMPLE_STORAGE_LIMIT_MB" || "$SAMPLE_STORAGE_LIMIT_MB" =~ ^[0-9]+$ ]] \
  || refuse "SAMPLE_STORAGE_LIMIT_MB must be a whole number of MiB (got '$SAMPLE_STORAGE_LIMIT_MB')."

"$ROOT_DIR/scripts/db-start.sh" >/dev/null

# db-env.sh exports PGHOST/PGPORT/PGDATABASE/PGUSER for the local cluster. libpq
# fills any field the URL omits from those (hosted URLs usually omit the port),
# so the remote side must not inherit them. -X keeps a user psqlrc from adding
# lines (e.g. \timing) to the output parsed below.
remote_psql() {
  env -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER psql -X "$SAMPLE_DATABASE_URL" "$@"
}

local_psql() {
  psql -X -h "$PGHOST" -p "$PGPORT" -d "$SAMPLE_DATABASE" -v ON_ERROR_STOP=1 "$@"
}

# Counts city/province pairs the same way nar_cities does (sql/sample-indexes.sql),
# but from the address rows, so a stale or missing view cannot skew it.
city_pairs_sql() {
  echo "SELECT count(*) FROM (SELECT 1 FROM $1 WHERE csd_eng_name IS NOT NULL AND csd_eng_name <> '' GROUP BY csd_eng_name, mail_prov_abvn) pairs"
}

# Column signature of a table: name, type, and NOT NULL, in column order.
signature_sql() {
  echo "SELECT string_agg(attname || ' ' || format_type(atttypid, atttypmod) || CASE WHEN attnotnull THEN ' not null' ELSE '' END, ', ' ORDER BY attnum) FROM pg_attribute WHERE attrelid = '$1'::regclass AND attnum > 0 AND NOT attisdropped"
}

# --- Local sample (read-only) -------------------------------------------------

# COPY maps columns by position, so the sample must have exactly the columns
# sample-schema.sql creates. Build that table in a throwaway schema inside a
# transaction that is rolled back, so the local sample is not changed.
expected_signature="$(local_psql -Atq \
  -c "SET client_min_messages TO warning;" \
  -c "BEGIN;" \
  -c "CREATE SCHEMA sample_push_shape_probe;" \
  -c "SET LOCAL search_path TO sample_push_shape_probe, public;" \
  -f "$ROOT_DIR/sql/sample-schema.sql" \
  -c "$(signature_sql sample_push_shape_probe.nar_addresses)" \
  -c "ROLLBACK;")"
local_signature="$(local_psql -Atqc "$(signature_sql public.nar_addresses)")"
if [[ -z "$expected_signature" || "$local_signature" != "$expected_signature" ]]; then
  refuse "Local $SAMPLE_DATABASE.nar_addresses does not match sql/sample-schema.sql." \
         "  sample:   $local_signature" \
         "  expected: ${expected_signature:-<could not build from sql/sample-schema.sql>}" \
         "Rebuild it with ./scripts/sample-build.sh."
fi

local_rows="$(local_psql -Atqc "SELECT count(*) FROM nar_addresses")"
if (( local_rows == 0 )); then
  refuse "Local $SAMPLE_DATABASE has 0 rows in nar_addresses; run ./scripts/sample-build.sh first."
fi
local_cities="$(local_psql -Atqc "$(city_pairs_sql nar_addresses)")"
sample_bytes="$(local_psql -Atqc "SELECT pg_total_relation_size('nar_addresses') + pg_total_relation_size('nar_cities')")"

echo "Pushing $local_rows rows / $local_cities cities ($(mib "$sample_bytes") MiB) from local $SAMPLE_DATABASE to:"
remote_psql -v ON_ERROR_STOP=1 -c '\conninfo'

# --- Target pre-flight (read-only) --------------------------------------------
# Neon enforces neon.max_cluster_size over the sum of all databases (postgres,
# template0/1, and this one), so measure the whole cluster. A leftover
# nar_staging from an earlier failed run is dropped before loading, so its size
# is subtracted. Command substitution (not read < <(...)) so a failed query
# aborts under set -e instead of leaving the checks below comparing blanks.
preflight="$(remote_psql -v ON_ERROR_STOP=1 -AtqF ' ' <<'SQL'
SELECT (SELECT sum(pg_database_size(datname)) FROM pg_database),
       (SELECT coalesce(sum(pg_total_relation_size(c.oid)), 0)
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'nar_staging' AND c.relkind IN ('r', 'm')),
       coalesce(pg_total_relation_size(to_regclass('public.nar_addresses')), 0)
         + coalesce(pg_total_relation_size(to_regclass('public.nar_cities')), 0),
       CASE WHEN current_setting('neon.max_cluster_size', true) ~ '^[0-9]'
            THEN pg_size_bytes(current_setting('neon.max_cluster_size', true)) ELSE 0 END,
       to_regclass('public.nar_addresses') IS NOT NULL,
       coalesce((SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'pg_trgm'), 'public');
SQL
)"
read -r cluster_bytes staging_bytes live_bytes neon_cap_bytes addresses_exist trgm_schema <<<"$preflight"

remote_cities=0
if [[ "$addresses_exist" == "t" ]]; then
  remote_cities="$(remote_psql -v ON_ERROR_STOP=1 -Atqc "$(city_pairs_sql public.nar_addresses)")"
fi
for value in "$cluster_bytes" "$staging_bytes" "$live_bytes" "$neon_cap_bytes" "$remote_cities"; do
  [[ "$value" =~ ^[0-9]+$ ]] || refuse "Pre-flight query returned an unexpected value ($preflight / $remote_cities)."
done
[[ "$trgm_schema" =~ ^[a-z_][a-z0-9_]*$ ]] || refuse "Unexpected pg_trgm schema name: $trgm_schema"

if [[ -n "$SAMPLE_STORAGE_LIMIT_MB" ]]; then
  limit_bytes=$((10#$SAMPLE_STORAGE_LIMIT_MB * 1048576)); limit_source="SAMPLE_STORAGE_LIMIT_MB"
  if (( neon_cap_bytes > 0 && limit_bytes > neon_cap_bytes )); then
    limit_bytes=$neon_cap_bytes; limit_source="neon.max_cluster_size; override above the cap ignored"
  fi
elif (( neon_cap_bytes > 0 )); then
  limit_bytes=$neon_cap_bytes; limit_source="neon.max_cluster_size"
else
  limit_bytes=$((500 * 1048576)); limit_source="default"
fi

if (( local_cities < remote_cities )) && [[ "$SAMPLE_PUSH_ALLOW_SHRINK" != "1" ]]; then
  refuse "The sample covers $local_cities cities but the target serves $remote_cities." \
         "Re-run with SAMPLE_PUSH_ALLOW_SHRINK=1 if dropping cities is intended."
fi

base_bytes=$((cluster_bytes - staging_bytes))
in_place_bytes=$((base_bytes - live_bytes + sample_bytes))
staged_bytes=$((base_bytes + sample_bytes))
if [[ "$SAMPLE_PUSH_IN_PLACE" == "1" ]]; then needed_bytes=$in_place_bytes; else needed_bytes=$staged_bytes; fi
echo "Storage: cluster $(mib "$cluster_bytes") MiB (live NAR tables $(mib "$live_bytes") MiB, leftover staging $(mib "$staging_bytes") MiB);" \
     "needs ~$(mib "$needed_bytes") MiB of $(mib "$limit_bytes") MiB ($limit_source)."

if (( needed_bytes > limit_bytes )); then
  if [[ "$SAMPLE_PUSH_IN_PLACE" == "1" ]]; then
    refuse "The sample does not fit even after dropping the live tables." \
           "Build a smaller sample (SAMPLE_TARGET_ROWS) or raise the limit if the plan allows it."
  elif (( in_place_bytes <= limit_bytes )); then
    refuse "Staging holds the old and new copies at once and would exceed the limit." \
           "Re-run with SAMPLE_PUSH_IN_PLACE=1 to replace the live tables directly (~$(mib "$in_place_bytes") MiB; brief outage)," \
           "or build a smaller sample so old and new copies fit side by side."
  else
    refuse "The sample does not fit the limit, staged or in place (~$(mib "$in_place_bytes") MiB in place)." \
           "Build a smaller sample (SAMPLE_TARGET_ROWS)."
  fi
fi

# --- Load -----------------------------------------------------------------------
# From here on the target changes. The EXIT trap reports (and for staging, cleans
# up) any failure, including ones inside remote_psql and Ctrl-C.

push_state="setup"
on_exit() {
  local status=$?
  (( status == 0 )) && return
  case "$push_state" in
    staging)
      echo "Push failed; dropping nar_staging. Live tables are unchanged." >&2
      remote_psql -q -c "DROP SCHEMA IF EXISTS nar_staging CASCADE;" >/dev/null 2>&1 || true ;;
    in_place)
      echo "Push failed after the live tables were replaced; they stay empty or partial until the push is re-run." >&2 ;;
  esac
}
trap on_exit EXIT

remote_psql -v ON_ERROR_STOP=1 -q \
  -c "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;" \
  -c "DROP SCHEMA IF EXISTS nar_staging CASCADE;"

# The SQL files use unqualified names, so search_path decides where they land.
# The pg_trgm schema stays on the path so gin_trgm_ops resolves.
if [[ "$SAMPLE_PUSH_IN_PLACE" == "1" ]]; then
  target_schema="public"
  push_state="in_place"
  echo "In-place mode: replacing the live tables; lookups find nothing until the load finishes."
  # Drop and recreate in one transaction so nar_addresses is never missing
  # (only empty). nar_cities is rebuilt by sample-indexes.sql after the load.
  remote_psql -v ON_ERROR_STOP=1 -q -1 \
    -c "DROP MATERIALIZED VIEW IF EXISTS public.nar_cities;" \
    -c "DROP TABLE IF EXISTS public.nar_addresses;" \
    -c "SET search_path TO public, \"$trgm_schema\";" \
    -f "$ROOT_DIR/sql/sample-schema.sql"
else
  target_schema="nar_staging"
  push_state="staging"
  remote_psql -v ON_ERROR_STOP=1 -q \
    -c "CREATE SCHEMA nar_staging;" \
    -c "SET search_path TO nar_staging, public, \"$trgm_schema\";" \
    -f "$ROOT_DIR/sql/sample-schema.sql"
fi
search_path="SET search_path TO $target_schema, public, \"$trgm_schema\";"

echo "Copying rows into $target_schema..."
local_psql -q -c "COPY nar_addresses TO STDOUT" \
  | remote_psql -v ON_ERROR_STOP=1 -q -c "COPY $target_schema.nar_addresses FROM STDIN"

echo "Building indexes and city view..."
remote_psql -v ON_ERROR_STOP=1 -q -c "$search_path" -f "$ROOT_DIR/sql/sample-indexes.sql"

loaded_rows="$(remote_psql -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM $target_schema.nar_addresses")"
loaded_cities="$(remote_psql -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM $target_schema.nar_cities")"
if [[ "$loaded_rows" != "$local_rows" || "$loaded_cities" != "$local_cities" ]]; then
  echo "Loaded $loaded_rows rows / $loaded_cities cities; expected $local_rows / $local_cities." >&2
  exit 1
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
fi
push_state="done"

remote_psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT count(*) AS cities FROM public.nar_cities;
SELECT pg_total_relation_size('public.nar_addresses') / 1048576 AS nar_addresses_mib,
       (SELECT sum(pg_database_size(datname)) FROM pg_database) / 1048576 AS cluster_mib;
SQL

echo "Done: $loaded_rows rows / $loaded_cities cities on the hosted database."
