#!/usr/bin/env bash
# Build the DuckDB database on FATRIOT from the same staged CSVs, with a
# schema that mirrors sql/schema.sql (text columns + numeric bg_x/bg_y).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/fatriot-env.sh"

DUCKDB_BIN="${DUCKDB_BIN:-/opt/homebrew/bin/duckdb}"
mkdir -p "$(dirname "$DUCKDB_FILE")"
rm -f "$DUCKDB_FILE"

echo ">> building $DUCKDB_FILE from $ADDR_DIR"
"$DUCKDB_BIN" "$DUCKDB_FILE" <<SQL
PRAGMA threads=10;

CREATE TABLE nar_addresses (
    loc_guid            VARCHAR NOT NULL,
    addr_guid           VARCHAR NOT NULL,
    apt_no_label        VARCHAR,
    civic_no            VARCHAR,
    civic_no_suffix     VARCHAR,
    official_street_name VARCHAR,
    official_street_type VARCHAR,
    official_street_dir VARCHAR,
    prov_code           VARCHAR,
    csd_eng_name        VARCHAR,
    csd_fre_name        VARCHAR,
    csd_type_eng_code   VARCHAR,
    csd_type_fre_code   VARCHAR,
    mail_street_name    VARCHAR,
    mail_street_type    VARCHAR,
    mail_street_dir     VARCHAR,
    mail_mun_name       VARCHAR,
    mail_prov_abvn      VARCHAR,
    mail_postal_code    VARCHAR,
    bg_dls_lsd          VARCHAR,
    bg_dls_qtr          VARCHAR,
    bg_dls_sctn         VARCHAR,
    bg_dls_twnshp       VARCHAR,
    bg_dls_rng          VARCHAR,
    bg_dls_mrd          VARCHAR,
    bg_x                DOUBLE,
    bg_y                DOUBLE,
    bu_n_civic_add      VARCHAR,
    bu_use              VARCHAR
);

-- QUOTE/ESCAPE pinned to '"' so RFC4180 doubled-quotes ("") inside quoted
-- fields (e.g. The ""Y"") parse instead of tripping the sniffer's strict mode.
COPY nar_addresses FROM '$ADDR_DIR/Address_*.csv'
    (FORMAT CSV, HEADER true, QUOTE '"', ESCAPE '"', NULL_PADDING true);

-- Equality-lookup indexes (DuckDB ART). Trigram/GIN has no DuckDB equivalent;
-- DuckDB leans on columnar scans + zonemaps for the fuzzy city search instead.
CREATE INDEX nar_city_idx   ON nar_addresses (csd_eng_name);
CREATE INDEX nar_postal_idx ON nar_addresses (mail_postal_code);
CREATE INDEX nar_street_idx ON nar_addresses (official_street_name);

ANALYZE;
SELECT count(*) AS duckdb_rows FROM nar_addresses;
SQL

echo ">> DuckDB ready: $DUCKDB_FILE"
