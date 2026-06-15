CREATE UNLOGGED TABLE IF NOT EXISTS nar_addresses (
    loc_guid text NOT NULL,
    addr_guid text NOT NULL,
    apt_no_label text,
    civic_no text,
    civic_no_suffix text,
    official_street_name text,
    official_street_type text,
    official_street_dir text,
    prov_code text,
    csd_eng_name text,
    csd_fre_name text,
    csd_type_eng_code text,
    csd_type_fre_code text,
    mail_street_name text,
    mail_street_type text,
    mail_street_dir text,
    mail_mun_name text,
    mail_prov_abvn text,
    mail_postal_code text,
    bg_dls_lsd text,
    bg_dls_qtr text,
    bg_dls_sctn text,
    bg_dls_twnshp text,
    bg_dls_rng text,
    bg_dls_mrd text,
    bg_x numeric,
    bg_y numeric,
    bu_n_civic_add text,
    bu_use text
);

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
