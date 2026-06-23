#!/usr/bin/env bash
# Initialize + load Postgres on the external SSD volume from the staged CSVs.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/pg-env.sh"

mkdir -p "$PGDATA" "$PG_LOGDIR"

# 1. Cluster
if [[ ! -d "$PGDATA/base" ]]; then
  echo ">> initdb at $PGDATA"
  initdb -D "$PGDATA" --encoding=UTF8 --locale=C >/dev/null
fi

# 2. Server. Only the runtime connection params (port/socket) are passed as
#    -o flags; the single-user benchmark tuning is persisted with ALTER SYSTEM
#    below (into postgresql.auto.conf) so a plain `pg_ctl ... start` keeps it
#    instead of silently reverting to defaults like work_mem=4MB.
start_pg(){ pg_ctl -D "$PGDATA" -l "$PG_LOGDIR/postgres.log" -o "-p $PGPORT -k /tmp" start; }

if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  echo ">> starting postgres on $PGPORT"
  start_pg
fi

echo ">> persisting tuning via ALTER SYSTEM (postgresql.auto.conf)"
psql -h "$PGHOST" -p "$PGPORT" -d postgres -v ON_ERROR_STOP=1 <<'SQL'
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET work_mem = '256MB';
ALTER SYSTEM SET maintenance_work_mem = '1GB';
ALTER SYSTEM SET max_wal_size = '8GB';
SQL
# shared_buffers only takes effect after a restart, so restart now; subsequent
# bare restarts read these values from postgresql.auto.conf automatically.
echo ">> restarting postgres to apply persisted tuning"
pg_ctl -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
start_pg

# 3. Database + schema
if ! psql -h "$PGHOST" -p "$PGPORT" -d postgres -Atqc \
     "SELECT 1 FROM pg_database WHERE datname='$PGDATABASE'" | grep -q 1; then
  createdb -h "$PGHOST" -p "$PGPORT" "$PGDATABASE"
fi
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/sql/schema.sql"

# 4. Fast bulk load: drop constraints/indexes, truncate, \copy, rebuild
echo ">> preparing table for bulk load"
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE nar_addresses SET UNLOGGED;
ALTER TABLE nar_addresses DROP CONSTRAINT IF EXISTS nar_addresses_pkey;
DROP INDEX IF EXISTS nar_addresses_city_idx;
DROP INDEX IF EXISTS nar_addresses_city_province_idx;
DROP INDEX IF EXISTS nar_addresses_postal_idx;
DROP INDEX IF EXISTS nar_addresses_street_idx;
DROP INDEX IF EXISTS nar_addresses_city_trgm_idx;
TRUNCATE nar_addresses;
SQL

for csv in "$ADDR_DIR"/Address_*.csv; do
  echo ">> importing $(basename "$csv")"
  psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -v ON_ERROR_STOP=1 \
    -c "\\copy nar_addresses FROM '$csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')"
done

echo ">> building indexes"
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -v ON_ERROR_STOP=1 <<'SQL'
SET maintenance_work_mem = '1GB';
ALTER TABLE nar_addresses ADD CONSTRAINT nar_addresses_pkey PRIMARY KEY (addr_guid);
CREATE INDEX IF NOT EXISTS nar_addresses_city_idx          ON nar_addresses (lower(csd_eng_name));
CREATE INDEX IF NOT EXISTS nar_addresses_city_province_idx ON nar_addresses (lower(csd_eng_name), mail_prov_abvn);
CREATE INDEX IF NOT EXISTS nar_addresses_postal_idx        ON nar_addresses (mail_postal_code);
CREATE INDEX IF NOT EXISTS nar_addresses_street_idx        ON nar_addresses (lower(official_street_name));
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS nar_addresses_city_trgm_idx     ON nar_addresses USING gin (csd_eng_name gin_trgm_ops);
ANALYZE nar_addresses;
SELECT count(*) AS postgres_rows FROM nar_addresses;
SQL

echo ">> Postgres ready: postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
