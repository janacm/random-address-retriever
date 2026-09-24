-- Slim schema for a hosted, free-tier-sized sample of the NAR dataset.
--
-- Keeps only the columns the API reads (see server/src/db.ts) and only the
-- indexes its two queries use, so a few million rows fit in a ~500 MB
-- free-tier Postgres. Table, column, and view names match sql/schema.sql, so
-- the API runs against either database unchanged. GUIDs are stored as uuid
-- (16 bytes vs 37 as text); every NAR GUID is lower-case, so the API returns
-- the same strings it does locally.
--
-- Loaded by scripts/sample-build.sh (into a fresh local database) and
-- scripts/sample-push.sh (into a staging schema, via search_path). Names are
-- unqualified and nothing is dropped here, so the file only ever creates
-- relations in the first schema on the search_path. Indexes and the city view
-- are created after the bulk COPY (sql/sample-indexes.sql).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE nar_addresses (
    loc_guid uuid NOT NULL,
    addr_guid uuid NOT NULL,
    apt_no_label text,
    civic_no text,
    civic_no_suffix text,
    official_street_name text,
    official_street_type text,
    official_street_dir text,
    csd_eng_name text,
    mail_prov_abvn text,
    mail_postal_code text
);
