#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

"$ROOT_DIR/scripts/db-init.sh" >/dev/null

psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" <<'SQL'
ALTER TABLE nar_addresses SET UNLOGGED;
ALTER TABLE nar_addresses DROP CONSTRAINT IF EXISTS nar_addresses_pkey;
DROP INDEX IF EXISTS nar_addresses_city_idx;
DROP INDEX IF EXISTS nar_addresses_city_province_idx;
DROP INDEX IF EXISTS nar_addresses_postal_idx;
DROP INDEX IF EXISTS nar_addresses_street_idx;
DROP INDEX IF EXISTS nar_addresses_city_trgm_idx;
-- Drop the large covering index (if a prior run of scripts/db-optimize.sh
-- created it) so COPY does not maintain it row-by-row during the bulk load.
DROP INDEX IF EXISTS nar_addresses_random_pick_idx;
TRUNCATE nar_addresses;
SQL

for csv in "$ROOT_DIR"/Addresses/Address_*.csv; do
  echo "Importing ${csv#$ROOT_DIR/}"
  psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" \
    -c "\\copy nar_addresses FROM '$csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')"
done

psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" <<'SQL'
SET maintenance_work_mem = '1GB';

ALTER TABLE nar_addresses
    ADD CONSTRAINT nar_addresses_pkey PRIMARY KEY (addr_guid);

CREATE INDEX IF NOT EXISTS nar_addresses_city_idx
    ON nar_addresses (lower(csd_eng_name));

CREATE INDEX IF NOT EXISTS nar_addresses_city_province_idx
    ON nar_addresses (lower(csd_eng_name), mail_prov_abvn);

CREATE INDEX IF NOT EXISTS nar_addresses_postal_idx
    ON nar_addresses (mail_postal_code);

CREATE INDEX IF NOT EXISTS nar_addresses_street_idx
    ON nar_addresses (lower(official_street_name));

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS nar_addresses_city_trgm_idx
    ON nar_addresses USING gin (csd_eng_name gin_trgm_ops);

ANALYZE nar_addresses;

-- Rebuild the city typeahead index from the freshly imported rows. nar_cities
-- is a materialized view (created WITH NO DATA by schema.sql), so it stays
-- empty — and the /api/cities search returns nothing — until refreshed here.
REFRESH MATERIALIZED VIEW nar_cities;

SELECT count(*) AS imported_rows FROM nar_addresses;
SELECT count(*) AS city_index_rows FROM nar_cities;
SQL

echo "Import complete. Run ./scripts/db-optimize.sh to build the covering index for fast lookups."
