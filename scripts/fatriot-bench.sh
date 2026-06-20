#!/usr/bin/env bash
# Head-to-head latency benchmark: identical queries against Postgres and DuckDB
# (both hosted on FATRIOT). Each query runs $RUNS times per engine; we report the
# cold (1st) run and the warm median of the rest. Timings come from each engine's
# own query timer (psql \timing / duckdb .timer), so client/connection startup is
# excluded and only query planning+execution is measured.
#
# Usage: scripts/fatriot-bench.sh [RUNS]   (default 7)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
source "$ROOT_DIR/scripts/fatriot-env.sh"
DUCKDB_BIN="${DUCKDB_BIN:-/opt/homebrew/bin/duckdb}"
RUNS="${1:-7}"
RESULTS="${RESULTS:-$FATRIOT/bench-results.csv}"

# ---- preflight: both engines must be usable, or we'd write an all-blank CSV ----
command -v psql >/dev/null 2>&1 || { echo "FATAL: psql not found on PATH" >&2; exit 1; }
{ [[ -x "$DUCKDB_BIN" ]] || command -v "$DUCKDB_BIN" >/dev/null 2>&1; } \
  || { echo "FATAL: duckdb not found at '$DUCKDB_BIN'" >&2; exit 1; }
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -Atqc 'SELECT 1 FROM nar_addresses LIMIT 1' >/dev/null 2>&1 \
  || { echo "FATAL: Postgres unreachable or nar_addresses missing at $PGHOST:$PGPORT/$PGDATABASE" >&2; exit 1; }
[[ -f "$DUCKDB_FILE" ]] || { echo "FATAL: DuckDB file missing: $DUCKDB_FILE" >&2; exit 1; }
"$DUCKDB_BIN" "$DUCKDB_FILE" -batch -noheader -c 'SELECT 1 FROM nar_addresses LIMIT 1' >/dev/null 2>&1 \
  || { echo "FATAL: DuckDB not queryable: $DUCKDB_FILE" >&2; exit 1; }

# ---- workload: name | description | SQL (identical text for both engines) ----
NAMES=(); DESCS=(); SQLS=()
add(){ NAMES+=("$1"); DESCS+=("$2"); SQLS+=("$3"); }

add count_all          "full table count"                 "SELECT count(*) FROM nar_addresses;"
add postal_point       "exact postal lookup (indexed)"    "SELECT count(*) FROM nar_addresses WHERE mail_postal_code='M5V3L9';"
add city_prov_count    "city+province count (indexed)"    "SELECT count(*) FROM nar_addresses WHERE lower(csd_eng_name)='toronto' AND mail_prov_abvn='ON';"
add city_fuzzy         "fuzzy city ILIKE (PG trgm vs scan)" "SELECT count(*) FROM nar_addresses WHERE csd_eng_name ILIKE '%toron%';"
add street_prefix      "street name prefix scan"          "SELECT count(*) FROM nar_addresses WHERE lower(official_street_name) LIKE 'main%';"
add group_by_prov      "aggregate over all rows (OLAP)"   "SELECT mail_prov_abvn, count(*) c FROM nar_addresses GROUP BY 1 ORDER BY c DESC;"
add top20_cities       "group + sort top-20 cities"       "SELECT csd_eng_name, count(*) c FROM nar_addresses GROUP BY 1 ORDER BY c DESC LIMIT 20;"
add distinct_postal    "count distinct postal codes"      "SELECT count(DISTINCT mail_postal_code) FROM nar_addresses;"
add random_in_city     "random address in a city (app)"   "SELECT addr_guid FROM nar_addresses WHERE lower(csd_eng_name)='toronto' ORDER BY random() LIMIT 1;"
add point_by_guid      "point lookup by PK guid"          "SELECT civic_no, official_street_name FROM nar_addresses WHERE addr_guid='7ef6145d-efb1-4277-b1f9-821c22ba8234';"

# ---- timing helpers: echo a single float in milliseconds ----
time_pg(){
  psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -q -At -P pager=off -v ON_ERROR_STOP=1 \
       -c '\timing on' -c "$1" 2>/dev/null | awk '/^Time:/{t=$2} END{print t}'
}
time_duck(){
  "$DUCKDB_BIN" "$DUCKDB_FILE" -batch -noheader -c ".timer on" -c "$1" 2>/dev/null \
    | awk '/Run Time/{for(i=1;i<=NF;i++) if($i=="real") t=$(i+1)*1000} END{print t}'
}

# median of stdin numbers
median(){ sort -n | awk '{a[NR]=$1} END{ if(NR==0){print "NA";exit} m=int(NR/2); print (NR%2)?a[m+1]:(a[m]+a[m+1])/2 }'; }
minv(){ sort -n | head -1; }

echo "engine,query,cold_ms,warm_median_ms,warm_min_ms" > "$RESULTS"
printf "%-16s | %-11s | %-11s | %-11s || %-11s | %-11s | %-11s\n" \
  "query" "PG cold" "PG warm" "PG min" "Duck cold" "Duck warm" "Duck min"
printf '%s\n' "--------------------------------------------------------------------------------------------------------"

for i in "${!NAMES[@]}"; do
  q="${SQLS[$i]}"; name="${NAMES[$i]}"
  pg=(); dk=()
  for ((r=1;r<=RUNS;r++)); do
    v=$(time_pg "$q"); [[ -n "$v" ]] || { echo "FATAL: no Postgres timing for '$name' (query failed?)" >&2; exit 1; }
    pg+=("$v")
  done
  for ((r=1;r<=RUNS;r++)); do
    v=$(time_duck "$q"); [[ -n "$v" ]] || { echo "FATAL: no DuckDB timing for '$name' (query failed?)" >&2; exit 1; }
    dk+=("$v")
  done
  pg_cold="${pg[0]}"; dk_cold="${dk[0]}"
  pg_warm=$(printf '%s\n' "${pg[@]:1}" | median); pg_min=$(printf '%s\n' "${pg[@]:1}" | minv)
  dk_warm=$(printf '%s\n' "${dk[@]:1}" | median); dk_min=$(printf '%s\n' "${dk[@]:1}" | minv)
  printf "%-16s | %11s | %11s | %11s || %11s | %11s | %11s\n" \
    "$name" "$pg_cold" "$pg_warm" "$pg_min" "$dk_cold" "$dk_warm" "$dk_min"
  echo "postgres,$name,$pg_cold,$pg_warm,$pg_min" >> "$RESULTS"
  echo "duckdb,$name,$dk_cold,$dk_warm,$dk_min" >> "$RESULTS"
done

echo
echo "RUNS=$RUNS per engine/query. cold=1st run, warm=median/min of remaining. All ms."
echo "CSV: $RESULTS"
