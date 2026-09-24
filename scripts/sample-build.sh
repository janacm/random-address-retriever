#!/usr/bin/env bash
set -euo pipefail

# Builds a free-tier-sized sample of the full NAR import into a separate local
# database (default: random_address_sample) and prints its size, so the sample
# can be checked before scripts/sample-push.sh copies it to a hosted Postgres.
#
#   SAMPLE_TARGET_ROWS  approximate rows to keep        (default 3000000)
#   SAMPLE_CITY_FLOOR   rows kept per city/province     (default 25)
#   SAMPLE_DATABASE     local database to (re)create    (default random_address_sample)
#
# The full database is only read. The sample database is dropped and rebuilt
# on every run.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

SAMPLE_TARGET_ROWS="${SAMPLE_TARGET_ROWS:-3000000}"
SAMPLE_CITY_FLOOR="${SAMPLE_CITY_FLOOR:-25}"
SAMPLE_DATABASE="${SAMPLE_DATABASE:-random_address_sample}"

if [[ "$SAMPLE_DATABASE" == "$PGDATABASE" ]]; then
  echo "SAMPLE_DATABASE must differ from the full database ($PGDATABASE)." >&2
  exit 1
fi

"$ROOT_DIR/scripts/db-start.sh" >/dev/null

psql -h "$PGHOST" -p "$PGPORT" -d postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS \"$SAMPLE_DATABASE\";" \
  -c "CREATE DATABASE \"$SAMPLE_DATABASE\";"

psql -h "$PGHOST" -p "$PGPORT" -d "$SAMPLE_DATABASE" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT_DIR/sql/sample-schema.sql"

echo "Sampling ~$SAMPLE_TARGET_ROWS rows (floor $SAMPLE_CITY_FLOOR per city) from $PGDATABASE..."
PGOPTIONS="-c work_mem=512MB" psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" \
  -v ON_ERROR_STOP=1 -q \
  -v target="$SAMPLE_TARGET_ROWS" -v floor="$SAMPLE_CITY_FLOOR" \
  -f "$ROOT_DIR/sql/sample-select.sql" \
  | psql -h "$PGHOST" -p "$PGPORT" -d "$SAMPLE_DATABASE" -v ON_ERROR_STOP=1 -q \
      -c "COPY nar_addresses FROM STDIN"

psql -h "$PGHOST" -p "$PGPORT" -d "$SAMPLE_DATABASE" -v ON_ERROR_STOP=1 -q \
  -f "$ROOT_DIR/sql/sample-indexes.sql"

psql -h "$PGHOST" -p "$PGPORT" -d "$SAMPLE_DATABASE" -v ON_ERROR_STOP=1 <<'SQL'
SELECT count(*) AS sample_rows FROM nar_addresses;
SELECT count(*) AS cities FROM nar_cities;
SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS total_size
FROM pg_class
WHERE relname IN ('nar_addresses', 'nar_cities')
ORDER BY pg_total_relation_size(oid) DESC;
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;
SQL

echo "Sample ready in $SAMPLE_DATABASE. Push it with ./scripts/sample-push.sh."
