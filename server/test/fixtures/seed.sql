-- Minimal nar_addresses fixture for CI / integration tests.
-- Mirrors the columns the API touches (see ../../sql/schema.sql for the full
-- production schema) and inserts a handful of rows the live-db tests expect.

DROP TABLE IF EXISTS nar_addresses;

CREATE TABLE nar_addresses (
    loc_guid text NOT NULL,
    addr_guid text NOT NULL,
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

CREATE INDEX nar_addresses_city_province_idx
    ON nar_addresses (lower(csd_eng_name), mail_prov_abvn);

CREATE INDEX nar_addresses_random_pick_idx
    ON nar_addresses (lower(csd_eng_name), mail_prov_abvn)
    INCLUDE (apt_no_label, civic_no, civic_no_suffix,
             official_street_name, official_street_type, official_street_dir,
             csd_eng_name, mail_postal_code, loc_guid, addr_guid);

INSERT INTO nar_addresses
    (loc_guid, addr_guid, apt_no_label, civic_no, civic_no_suffix,
     official_street_name, official_street_type, official_street_dir,
     csd_eng_name, mail_prov_abvn, mail_postal_code)
VALUES
    ('loc-on-1', 'addr-on-1', NULL, '586', NULL, 'Phoebe', 'CRES', NULL,
     'Burlington', 'ON', 'L7L6H7'),
    ('loc-on-2', 'addr-on-2', NULL, '1280', NULL, 'Rosseau', 'PL', NULL,
     'Burlington', 'ON', 'L7P3N2'),
    ('loc-on-3', 'addr-on-3', '4', '123', 'A', 'Main', 'ST', 'N',
     'Burlington', 'ON', 'L7R1A1'),
    ('loc-nl-1', 'addr-nl-1', NULL, '43', NULL, 'Horncastle', 'DR', NULL,
     'Burlington', 'NL', 'A0A0A0'),
    ('loc-tor-1', 'addr-tor-1', NULL, '1', NULL, 'Main', 'ST', NULL,
     'Toronto', 'ON', 'M1M1A1');

ANALYZE nar_addresses;
