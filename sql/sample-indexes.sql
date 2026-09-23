-- Indexes and city typeahead view for the sample database. Run after the bulk
-- COPY into nar_addresses (sql/sample-schema.sql).

-- Serves the random pick: WHERE lower(csd_eng_name) = lower($1)
-- [AND mail_prov_abvn = $2]. A plain index rather than the covering
-- nar_addresses_random_pick_idx used locally, which would roughly double the
-- database size; at sample scale the heap fetches are cheap.
CREATE INDEX nar_addresses_city_province_idx
    ON nar_addresses (lower(csd_eng_name), mail_prov_abvn);

-- Same definition as sql/schema.sql, so address_count reflects the rows the
-- sample actually holds.
CREATE MATERIALIZED VIEW nar_cities AS
    SELECT csd_eng_name AS city,
           mail_prov_abvn AS province,
           count(*) AS address_count
    FROM nar_addresses
    WHERE csd_eng_name IS NOT NULL AND csd_eng_name <> ''
    GROUP BY csd_eng_name, mail_prov_abvn;

CREATE UNIQUE INDEX nar_cities_city_prov_idx
    ON nar_cities (city, province);

CREATE INDEX nar_cities_city_trgm_idx
    ON nar_cities USING gin (city gin_trgm_ops);

CREATE INDEX nar_cities_city_lower_idx
    ON nar_cities (lower(city));

VACUUM ANALYZE nar_addresses;
