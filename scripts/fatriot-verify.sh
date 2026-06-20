#!/usr/bin/env bash
# Parity check: confirm Postgres and DuckDB on FATRIOT hold identical data.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/fatriot-env.sh"
DUCKDB_BIN="${DUCKDB_BIN:-/opt/homebrew/bin/duckdb}"

# Identical aggregate query for both engines.
read -r -d '' Q <<'SQL' || true
SELECT
  count(*)                                   AS total_rows,
  count(DISTINCT addr_guid)                  AS distinct_addr_guid,
  count(DISTINCT mail_postal_code)           AS distinct_postal,
  count(DISTINCT lower(csd_eng_name))        AS distinct_city,
  round(sum(bg_x))                           AS sum_bg_x,
  round(sum(bg_y))                           AS sum_bg_y
FROM nar_addresses;
SQL

echo "=== Postgres ==="
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -P pager=off -c "$Q"

echo "=== DuckDB ==="
"$DUCKDB_BIN" "$DUCKDB_FILE" -c "$Q"

echo "=== top 5 provinces (both should match) ==="
echo "-- Postgres --"
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -P pager=off -c \
  "SELECT mail_prov_abvn, count(*) FROM nar_addresses GROUP BY 1 ORDER BY 2 DESC LIMIT 5;"
echo "-- DuckDB --"
"$DUCKDB_BIN" "$DUCKDB_FILE" -c \
  "SELECT mail_prov_abvn, count(*) AS count FROM nar_addresses GROUP BY 1 ORDER BY 2 DESC LIMIT 5;"
