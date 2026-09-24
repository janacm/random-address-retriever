-- Computes the Facts page data from the full local NAR import and prints it
-- as one JSON object on stdout. Run by scripts/facts-build.sh, which pretty-
-- prints the result into apps/web/src/facts.generated.json.
--
-- Inputs:
--   nar_addresses       the full import (only read)
--   $NAR_ZIP            environment variable naming the NAR release zip; its
--                       Locations/*.csv files supply CSD_CODE and coordinates
--                       per LOC_GUID, which nar_addresses does not carry
--   :release            psql variable, the release label stamped in the output
--
-- Everything built here is a temp table (or pg_temp function) of this
-- session, so nothing persists and nothing in the database is modified.
--
-- A "municipality" is a census subdivision (CSD), identified by CSD_CODE.
-- Names alone are not unique: 67 names are shared by two CSDs in the same
-- province. Rows without a CSD (NULL csd_eng_name) are left out of every
-- municipality fact and counted in the dataset stamp.
--
-- Ties: rankings list every tied member at a cut-off, or record the value
-- just past the cut so the page can say there is no tie. Ordering tiebreaks
-- (csd_code, addr_guid) only keep output deterministic.
--
-- Some page copy states a claim in words (for example "Toronto has more
-- addresses than the Atlantic provinces and territories combined"). The
-- assertions at the end fail the build if a new release breaks one of those
-- claims, so the copy gets rewritten instead of silently going stale.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Source tables
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE loc_raw (
    loc_guid text, csd_code text, fed_code text, fed_eng_name text, fed_fre_name text,
    er_code text, er_eng_name text, er_fre_name text, bg_latitude text, bg_longitude text
);

-- Each Locations CSV starts with a (BOM-prefixed) header line; drop them all.
\copy loc_raw FROM PROGRAM 'unzip -p "$NAR_ZIP" "Locations/*.csv" | LC_ALL=C sed "/LOC_GUID,CSD_CODE,/d"' WITH (FORMAT csv)

CREATE TEMP TABLE loc AS
SELECT loc_guid,
       nullif(csd_code, '') AS csd_code,
       nullif(bg_latitude, '')::float8 AS lat,
       nullif(bg_longitude, '')::float8 AS lon
FROM loc_raw;
ALTER TABLE loc ADD PRIMARY KEY (loc_guid);  -- fails if a LOC_GUID repeats
ANALYZE loc;
DROP TABLE loc_raw;

CREATE TEMP TABLE prov (code text PRIMARY KEY, abbr text NOT NULL);
INSERT INTO prov VALUES
    ('10', 'NL'), ('11', 'PE'), ('12', 'NS'), ('13', 'NB'), ('24', 'QC'),
    ('35', 'ON'), ('46', 'MB'), ('47', 'SK'), ('48', 'AB'), ('59', 'BC'),
    ('60', 'YT'), ('61', 'NT'), ('62', 'NU');

-- One row per address with its CSD code and the columns the facts use.
-- nm is the street name lower-cased with ICU rules, so accented capitals fold
-- too (the database collation is C, whose lower() only folds ASCII).
CREATE TEMP TABLE ac AS
SELECT a.loc_guid,
       l.csd_code,
       l.loc_guid IS NULL AS no_location,
       a.prov_code,
       a.csd_eng_name,
       a.csd_type_eng_code,
       a.official_street_name AS street,
       lower(a.official_street_name COLLATE "und-x-icu") AS nm,
       a.official_street_type AS typ,
       a.official_street_dir AS dir,
       a.civic_no,
       a.civic_no_suffix,
       a.apt_no_label
FROM nar_addresses a
LEFT JOIN loc l USING (loc_guid);
ANALYZE ac;

-- One row per municipality.
CREATE TEMP TABLE csd AS
SELECT csd_code,
       min(csd_eng_name) AS name,
       min(prov_code) AS prov_code,
       min(csd_type_eng_code) AS typ,
       count(DISTINCT (csd_eng_name, prov_code, csd_type_eng_code)) AS variants,
       count(*) AS n,
       count(DISTINCT loc_guid) AS b
FROM ac
WHERE csd_code IS NOT NULL
GROUP BY csd_code;

-- Ranked once; ties broken by csd_code so ranks are stable.
CREATE TEMP TABLE csd_r AS
SELECT c.*, p.abbr, row_number() OVER (ORDER BY c.n DESC, c.csd_code) AS rn
FROM csd c
JOIN prov p ON p.code = c.prov_code;

-- ---------------------------------------------------------------------------
-- Data-shape checks the queries below rely on
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    bad bigint;
BEGIN
    SELECT count(*) INTO bad FROM ac WHERE no_location;
    IF bad > 0 THEN
        RAISE EXCEPTION '% addresses have no row in Locations/*.csv', bad;
    END IF;

    SELECT count(*) INTO bad FROM ac WHERE (csd_code IS NULL) <> (csd_eng_name IS NULL);
    IF bad > 0 THEN
        RAISE EXCEPTION '% addresses disagree on having a CSD code and a CSD name', bad;
    END IF;

    SELECT count(*) INTO bad FROM csd WHERE variants > 1;
    IF bad > 0 THEN
        RAISE EXCEPTION '% CSD codes carry more than one name/province/type', bad;
    END IF;

    -- Blank values are NULL in this import; the formatting helpers depend on it.
    SELECT count(*) INTO bad FROM nar_addresses
    WHERE '' IN (csd_eng_name, apt_no_label, civic_no, civic_no_suffix, official_street_name,
                 official_street_type, official_street_dir, mail_mun_name, mail_prov_abvn,
                 mail_postal_code);
    IF bad > 0 THEN
        RAISE EXCEPTION '% addresses have empty-string fields; expected NULLs', bad;
    END IF;

    -- Civic numbers are cast to integers and bucketed by digit count.
    SELECT count(*) INTO bad FROM nar_addresses WHERE civic_no !~ '^[1-9][0-9]*$' AND civic_no <> '0';
    IF bad > 0 THEN
        RAISE EXCEPTION '% civic numbers are not plain integers', bad;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Formatting helpers
-- ---------------------------------------------------------------------------

CREATE FUNCTION pg_temp.fmt_postal(postal text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN length(postal) = 6 THEN substr(postal, 1, 3) || ' ' || substr(postal, 4) ELSE postal END
$$;

-- "Unit 3, 420 First ST" / "19490C 99 HWY" / "211 3/4 John ST"
CREATE FUNCTION pg_temp.fmt_street(apt text, civic text, suffix text, street text, typ text, dir text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT nullif(concat_ws(', ',
        'Unit ' || apt,
        nullif(concat_ws(' ',
            nullif(concat(civic, CASE WHEN suffix LIKE '%/%' THEN ' ' || suffix ELSE suffix END), ''),
            street, typ, dir), '')), '')
$$;

-- Street line plus the Canada Post mailing town, province and postal code.
CREATE FUNCTION pg_temp.fmt_address(apt text, civic text, suffix text, street text, typ text, dir text,
                                    town text, prov text, postal text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT concat_ws(', ',
        pg_temp.fmt_street(apt, civic, suffix, street, typ, dir),
        nullif(concat_ws(' ', town, prov, pg_temp.fmt_postal(postal)), ''))
$$;

-- Great-circle distance in km.
CREATE FUNCTION pg_temp.km(lat1 float8, lon1 float8, lat2 float8, lon2 float8) RETURNS float8
LANGUAGE sql IMMUTABLE AS $$
    SELECT 6371 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
           + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

CREATE TEMP TABLE facts (ord serial, key text UNIQUE NOT NULL, value json NOT NULL);

-- ---------------------------------------------------------------------------
-- Dataset stamp
-- ---------------------------------------------------------------------------

INSERT INTO facts (key, value)
SELECT 'dataset', json_build_object(
    'source', 'Statistics Canada, National Address Register',
    'release', :'release',
    'addresses', (SELECT count(*) FROM ac),
    'addressesWithMunicipality', (SELECT count(*) FROM ac WHERE csd_code IS NOT NULL),
    'addressesWithoutMunicipality', (SELECT count(*) FROM ac WHERE csd_code IS NULL),
    'municipalities', (SELECT count(*) FROM csd),
    'buildings', (SELECT count(*) FROM loc),
    'geocodedBuildings', (SELECT count(*) FROM loc WHERE lat IS NOT NULL),
    'generatedBy', 'scripts/facts-build.sh'
);

-- ---------------------------------------------------------------------------
-- Small municipalities
-- ---------------------------------------------------------------------------

INSERT INTO facts (key, value)
SELECT 'tinyMunicipalities', json_build_object(
    'municipalities', count(*),
    'under25', count(*) FILTER (WHERE n < 25),
    'under10', count(*) FILTER (WHERE n < 10),
    'exactlyOne', count(*) FILTER (WHERE n = 1),
    'under25Reserves', count(*) FILTER (WHERE n < 25 AND typ = 'IRI'),
    'under25RuralMunicipalities', count(*) FILTER (WHERE n < 25 AND typ = 'RM'),
    'under25RuralMunicipalitiesOutsideSk', count(*) FILTER (WHERE n < 25 AND typ = 'RM' AND prov_code <> '47'),
    'skRuralMunicipalities', (
        SELECT json_build_object(
            'municipalities', count(*),
            'under25', count(*) FILTER (WHERE n < 25),
            'exactlyOne', count(*) FILTER (WHERE n = 1),
            'median', percentile_cont(0.5) WITHIN GROUP (ORDER BY n))
        FROM csd_r WHERE prov_code = '47' AND typ = 'RM'),
    -- Grouping by name and province instead of CSD code merges same-name CSDs.
    'byNameAndProvince', (
        SELECT json_build_object(
            'municipalities', count(*),
            'under25', count(*) FILTER (WHERE n < 25),
            'under10', count(*) FILTER (WHERE n < 10),
            'exactlyOne', count(*) FILTER (WHERE n = 1))
        FROM (SELECT name, prov_code, sum(n) AS n FROM csd_r GROUP BY 1, 2) m),
    -- The retriever's city list groups by name and mailing province, which is
    -- missing on some rows, so it has more (and smaller) entries.
    'retrieverCityList', (
        SELECT json_build_object(
            'entries', count(*),
            'entriesWithoutMailProvince', count(*) FILTER (WHERE province IS NULL OR province = ''),
            'under25', count(*) FILTER (WHERE address_count < 25),
            'exactlyOne', count(*) FILTER (WHERE address_count = 1))
        FROM nar_cities)
)
FROM csd_r;

-- Every municipality tied for smallest, with its one address.
CREATE TEMP TABLE smallest_rows AS
SELECT c.csd_code, c.name, c.abbr, c.typ, a.*
FROM nar_addresses a
JOIN (SELECT loc_guid, csd_code FROM ac
      WHERE csd_code IN (SELECT csd_code FROM csd_r WHERE n = (SELECT min(n) FROM csd_r))) x USING (loc_guid)
JOIN csd_r c ON c.csd_code = x.csd_code;

INSERT INTO facts (key, value)
SELECT 'smallestMunicipalities', json_build_object(
    'addressesEach', (SELECT min(n) FROM csd_r),
    'count', count(DISTINCT csd_code),
    'byType', (
        SELECT json_agg(json_build_object('csdType', typ, 'municipalities', k) ORDER BY k DESC, typ)
        FROM (SELECT typ, count(DISTINCT csd_code) AS k FROM smallest_rows GROUP BY 1) t),
    'byProvince', (
        SELECT json_agg(json_build_object('province', abbr, 'municipalities', k) ORDER BY k DESC, abbr)
        FROM (SELECT abbr, count(DISTINCT csd_code) AS k FROM smallest_rows GROUP BY 1) t),
    'missingMailingParts', count(*) FILTER (WHERE mail_mun_name IS NULL OR mail_postal_code IS NULL),
    'municipalities', json_agg(json_build_object(
        'csdCode', csd_code,
        'name', name,
        'province', abbr,
        'csdType', typ,
        'address', pg_temp.fmt_address(apt_no_label, civic_no, civic_no_suffix, official_street_name,
                                       official_street_type, official_street_dir,
                                       mail_mun_name, mail_prov_abvn, mail_postal_code))
        ORDER BY abbr, name, csd_code, addr_guid)
)
FROM smallest_rows;

-- Little Bay Islands, NL is one of the one-address towns; its record is odd.
INSERT INTO facts (key, value)
SELECT 'littleBayIslands', json_build_object(
    'address', pg_temp.fmt_address(s.apt_no_label, s.civic_no, s.civic_no_suffix, s.official_street_name,
                                   s.official_street_type, s.official_street_dir,
                                   s.mail_mun_name, s.mail_prov_abvn, s.mail_postal_code),
    'hasCoordinates', l.lat IS NOT NULL,
    'mailTown', s.mail_mun_name,
    'postalCode', pg_temp.fmt_postal(s.mail_postal_code),
    'otherMunicipalitiesOnPostalCode', (
        SELECT json_agg(json_build_object('name', m, 'addresses', k) ORDER BY k DESC, m)
        FROM (SELECT csd_eng_name AS m, count(*) AS k FROM nar_addresses
              WHERE mail_postal_code = s.mail_postal_code AND csd_eng_name IS DISTINCT FROM s.name
              GROUP BY 1) x)
)
FROM smallest_rows s
JOIN loc l USING (loc_guid)
WHERE s.name = 'Little Bay Islands' AND s.abbr = 'NL';

-- ---------------------------------------------------------------------------
-- Typical size and spread
-- ---------------------------------------------------------------------------

INSERT INTO facts (key, value)
WITH s AS (
    SELECT count(*) AS m, sum(n) AS a, percentile_cont(0.5) WITHIN GROUP (ORDER BY n) AS med, max(n) AS mx
    FROM csd_r
)
SELECT 'meanMedian', json_build_object(
    'municipalities', s.m,
    'addresses', s.a,
    'mean', round(s.a::numeric / s.m, 1),
    'median', s.med,
    'meanOverMedian', round((s.a::numeric / s.m) / s.med::numeric, 1),
    'belowMean', (SELECT count(*) FROM csd_r WHERE n * s.m < s.a),
    'pctBelowMean', round(100.0 * (SELECT count(*) FROM csd_r WHERE n * s.m < s.a) / s.m, 1),
    'largestOverMedian', round(s.mx / s.med::numeric)
)
FROM s;

INSERT INTO facts (key, value)
WITH t AS (SELECT count(*) AS m, sum(n) AS a FROM csd_r),
b AS (
    -- 0 = exactly one address, otherwise the digit count (7+ digits pooled)
    SELECT CASE WHEN n = 1 THEN 0 ELSE least(length(n::text), 7) END AS d, count(*) AS k, sum(n) AS s
    FROM csd_r GROUP BY 1
)
SELECT 'sizeBands', json_build_object(
    'municipalities', t.m,
    'bands', (
        SELECT json_agg(json_build_object(
            'band', CASE b.d WHEN 0 THEN 'exactly 1' WHEN 1 THEN '2-9' WHEN 7 THEN '1,000,000+'
                    ELSE to_char(power(10, b.d - 1), 'FM999,999,999') || '-' ||
                         to_char(power(10, b.d) - 1, 'FM999,999,999') END,
            'municipalities', b.k,
            'pctMunicipalities', round(100.0 * b.k / t.m, 1),
            'addresses', b.s,
            'pctAddresses', round(100.0 * b.s / t.a, 2)) ORDER BY b.d)
        FROM b),
    'atLeast100k', (
        SELECT json_build_object('municipalities', count(*), 'addresses', sum(n),
                                 'pctAddresses', round(100.0 * sum(n) / t.a, 1))
        FROM csd_r WHERE n >= 100000),
    'atLeast1m', (SELECT count(*) FROM csd_r WHERE n >= 1000000),
    -- discrete percentiles: each value is a real municipality's count
    'percentiles', (
        SELECT json_build_object(
            'p25', percentile_disc(0.25) WITHIN GROUP (ORDER BY n),
            'p50', percentile_disc(0.5) WITHIN GROUP (ORDER BY n),
            'p75', percentile_disc(0.75) WITHIN GROUP (ORDER BY n))
        FROM csd_r)
)
FROM t;

INSERT INTO facts (key, value)
WITH c AS (SELECT csd_r.*, sum(n) OVER (ORDER BY rn) AS cum FROM csd_r),
t AS (SELECT count(*) AS m, sum(n) AS tot FROM csd_r),
bottom AS (SELECT count(*) AS k, sum(n) AS s FROM c, t WHERE rn > t.m - t.m / 2)
SELECT 'halfOfAddresses', json_build_object(
    'municipalities', t.m,
    'for50pct', (SELECT min(rn) FROM c WHERE 2 * cum >= t.tot),
    'for75pct', (SELECT min(rn) FROM c WHERE 4 * cum >= 3 * t.tot),
    'for90pct', (SELECT min(rn) FROM c WHERE 10 * cum >= 9 * t.tot),
    'tippingMunicipality', (
        SELECT json_build_object('name', name, 'province', abbr, 'addresses', n,
                                 'cumulativePct', round(100.0 * cum / t.tot, 2))
        FROM c WHERE 2 * cum >= t.tot ORDER BY rn LIMIT 1),
    'bottomHalf', json_build_object(
        'municipalities', bottom.k,
        'addresses', bottom.s,
        'pct', round(100.0 * bottom.s / t.tot, 2),
        -- the claim block checks these differ, so no tie straddles the cut
        'largestIncluded', (SELECT n FROM c WHERE rn = t.m - t.m / 2 + 1),
        'smallestExcluded', (SELECT n FROM c WHERE rn = t.m - t.m / 2)),
    'smallestLargerThanBottomHalf', (
        SELECT json_build_object('name', name, 'province', abbr, 'addresses', n, 'rank', rn)
        FROM csd_r WHERE n > bottom.s ORDER BY n, csd_code LIMIT 1)
)
FROM t, bottom;

-- ---------------------------------------------------------------------------
-- Large municipalities
-- ---------------------------------------------------------------------------

INSERT INTO facts (key, value)
WITH tot AS (SELECT count(*) AS all_rows FROM nar_addresses),
r AS (SELECT csd_r.*, sum(n) OVER (ORDER BY rn) AS cum FROM csd_r)
SELECT 'topMunicipalities', json_build_object(
    'totalAddresses', tot.all_rows,
    'top', (
        SELECT json_agg(json_build_object(
            'rank', rn, 'csdCode', csd_code, 'name', name, 'province', abbr, 'csdType', typ,
            'addresses', n, 'buildings', b,
            'pctOfCanada', round(100.0 * n / tot.all_rows, 2),
            'cumulativePct', round(100.0 * cum / tot.all_rows, 2)) ORDER BY rn)
        FROM r WHERE rn <= 10),
    'top5Addresses', (SELECT cum FROM r WHERE rn = 5),
    'top5Pct', (SELECT round(100.0 * cum / tot.all_rows, 2) FROM r WHERE rn = 5),
    'top10Addresses', (SELECT cum FROM r WHERE rn = 10),
    'top10Pct', (SELECT round(100.0 * cum / tot.all_rows, 2) FROM r WHERE rn = 10),
    'rank11', (SELECT json_build_object('name', name, 'province', abbr, 'csdType', typ, 'addresses', n)
               FROM r WHERE rn = 11),
    'tiesInTop11', (SELECT count(*) - count(DISTINCT n) FROM r WHERE rn <= 11)
)
FROM tot;

INSERT INTO facts (key, value)
SELECT 'biggestCity', json_build_object(
    'cityTypes', json_build_array('C', 'CY', 'CV'),
    'cityTypeMunicipalities', (SELECT count(*) FROM csd_r WHERE typ IN ('C', 'CY', 'CV')),
    'villes', (SELECT count(*) FROM csd_r WHERE typ = 'V'),
    'largestCity', (
        SELECT json_build_object('name', name, 'province', abbr, 'csdType', typ, 'addresses', n, 'rank', rn)
        FROM csd_r WHERE typ IN ('C', 'CY', 'CV') ORDER BY rn LIMIT 1),
    'top10AllCityOrVille', (SELECT bool_and(typ IN ('C', 'CY', 'CV', 'V')) FROM csd_r WHERE rn <= 10),
    'largestNonCity', (
        SELECT json_build_object('name', name, 'province', abbr, 'csdType', typ, 'addresses', n, 'rank', rn)
        FROM csd_r WHERE typ NOT IN ('C', 'CY', 'CV', 'V') ORDER BY rn LIMIT 1)
);

INSERT INTO facts (key, value)
WITH r AS (SELECT csd_r.*, row_number() OVER (ORDER BY b DESC, csd_code) AS br FROM csd_r)
SELECT 'mostBuildings', json_build_object(
    'top', (
        SELECT json_agg(json_build_object(
            'rank', br, 'name', name, 'province', abbr, 'buildings', b, 'addresses', n,
            'addressesPerBuilding', round(n::numeric / b, 2), 'addressRank', rn) ORDER BY br)
        FROM r WHERE br <= 5),
    'sixthBuildings', (SELECT b FROM r WHERE br = 6)
);

-- Province totals include the rows without a municipality.
CREATE TEMP TABLE prov_tot AS
SELECT prov_code, count(*) AS addresses, count(DISTINCT loc_guid) AS buildings
FROM ac GROUP BY 1;

INSERT INTO facts (key, value)
WITH top AS (SELECT * FROM csd_r WHERE rn = 1),
g AS (
    SELECT sum(addresses) FILTER (WHERE prov_code IN ('10', '11', '12', '13', '60', '61', '62')) AS atl_terr_a,
           sum(buildings) FILTER (WHERE prov_code IN ('10', '11', '12', '13', '60', '61', '62')) AS atl_terr_b,
           sum(addresses) FILTER (WHERE prov_code IN ('46', '47')) AS mbsk_a,
           sum(buildings) FILTER (WHERE prov_code IN ('46', '47')) AS mbsk_b
    FROM prov_tot
)
SELECT 'torontoVsRegions', json_build_object(
    'municipality', json_build_object('name', top.name, 'province', top.abbr, 'addresses', top.n, 'buildings', top.b),
    'atlanticPlusTerritories', json_build_object('addresses', g.atl_terr_a, 'buildings', g.atl_terr_b),
    'manitobaPlusSaskatchewan', json_build_object('addresses', g.mbsk_a, 'buildings', g.mbsk_b)
)
FROM top, g;

INSERT INTO facts (key, value)
WITH nu AS (SELECT addresses FROM prov_tot WHERE prov_code = '62')
SELECT 'nunavut', json_build_object(
    'addresses', nu.addresses,
    'municipalAddresses', (SELECT sum(n) FROM csd_r WHERE prov_code = '62'),
    'communities', (
        SELECT json_agg(json_build_object('name', name, 'addresses', n) ORDER BY n DESC, name)
        FROM csd_r WHERE prov_code = '62'),
    'municipalitiesBigger', (SELECT count(*) FROM csd_r WHERE n > nu.addresses),
    'municipalitiesEqual', (SELECT count(*) FROM csd_r WHERE n = nu.addresses),
    'nextLarger', (
        SELECT json_build_object('name', name, 'province', abbr, 'csdType', typ, 'addresses', n)
        FROM csd_r WHERE n > nu.addresses ORDER BY n, csd_code LIMIT 1)
)
FROM nu;

INSERT INTO facts (key, value)
WITH town AS (SELECT * FROM csd_r WHERE typ = 'T' ORDER BY rn LIMIT 1)
SELECT 'biggestTown', json_build_object(
    'name', town.name, 'province', town.abbr, 'csdType', town.typ, 'addresses', town.n, 'rank', town.rn,
    'sameCount', (SELECT count(*) FROM csd_r WHERE n = town.n) - 1,
    'cityTypeMunicipalities', (SELECT count(*) FROM csd_r WHERE typ IN ('C', 'CY', 'CV')),
    'cityTypeSmaller', (SELECT count(*) FROM csd_r WHERE typ IN ('C', 'CY', 'CV') AND n < town.n),
    'cityOrVilleMunicipalities', (SELECT count(*) FROM csd_r WHERE typ IN ('C', 'CY', 'CV', 'V')),
    'cityOrVilleSmaller', (SELECT count(*) FROM csd_r WHERE typ IN ('C', 'CY', 'CV', 'V') AND n < town.n),
    'nextTown', (
        SELECT json_build_object('name', name, 'province', abbr, 'addresses', n)
        FROM csd_r WHERE typ = 'T' ORDER BY rn OFFSET 1 LIMIT 1)
)
FROM town;

INSERT INTO facts (key, value)
SELECT 'smallestCities', json_build_object(
    'cities', (
        SELECT json_agg(json_build_object('name', name, 'province', abbr, 'csdType', typ, 'addresses', n) ORDER BY n, csd_code)
        FROM (SELECT * FROM csd_r WHERE typ IN ('C', 'CY', 'CV') ORDER BY n, csd_code LIMIT 3) x),
    'villes', (
        SELECT json_agg(json_build_object('name', name, 'province', abbr, 'csdType', typ, 'addresses', n) ORDER BY n, csd_code)
        FROM (SELECT * FROM csd_r WHERE typ = 'V' ORDER BY n, csd_code LIMIT 3) x)
);

-- ---------------------------------------------------------------------------
-- Province by province
-- ---------------------------------------------------------------------------

INSERT INTO facts (key, value)
WITH r AS (
    SELECT c.*,
           rank() OVER (PARTITION BY prov_code ORDER BY n DESC) AS top,
           rank() OVER (PARTITION BY prov_code ORDER BY n) AS bot,
           sum(n) OVER (PARTITION BY prov_code) AS pt,
           count(*) OVER (PARTITION BY prov_code) AS pc
    FROM csd_r c
), p AS (
    SELECT prov_code, abbr, max(pc) AS municipalities, max(pt) AS addresses,
           round(max(pt)::numeric / max(pc)) AS mean,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY n) AS median,
           min(n) AS smallest,
           count(*) FILTER (WHERE bot = 1) AS smallest_tied
    FROM r GROUP BY prov_code, abbr
)
SELECT 'provinceExtremes', json_agg(json_build_object(
    'province', p.abbr,
    'municipalities', p.municipalities,
    'addresses', p.addresses,
    'mean', p.mean,
    'median', p.median,
    'biggest', (
        SELECT json_agg(json_build_object('name', name, 'csdType', typ, 'addresses', n,
                                          'pctOfProvince', round(100.0 * n / pt, 1)) ORDER BY name)
        FROM r WHERE r.prov_code = p.prov_code AND top = 1),
    'smallestAddresses', p.smallest,
    'smallestTied', p.smallest_tied,
    -- Large ties at the national minimum are already listed in
    -- smallestMunicipalities, so only name the members of other ties here.
    'smallest', CASE WHEN p.smallest_tied <= 6 OR p.smallest > (SELECT min(n) FROM csd_r) THEN (
        SELECT json_agg(json_build_object('name', name, 'csdType', typ) ORDER BY name)
        FROM r WHERE r.prov_code = p.prov_code AND bot = 1) END
) ORDER BY p.prov_code)
FROM p;

-- ---------------------------------------------------------------------------
-- Names
-- ---------------------------------------------------------------------------

INSERT INTO facts (key, value)
WITH d AS (
    SELECT name, prov_code, abbr, count(*) AS k, count(DISTINCT typ) AS types, max(n) AS biggest
    FROM csd_r GROUP BY 1, 2, 3 HAVING count(*) > 1
)
SELECT 'sameNameSameProvince', json_build_object(
    'names', (SELECT count(*) FROM d),
    'sameType', (SELECT count(*) FROM d WHERE types = 1),
    'maxPerName', (SELECT max(k) FROM d),
    'byProvince', (
        SELECT json_agg(json_build_object('province', abbr, 'names', k) ORDER BY k DESC, abbr)
        FROM (SELECT abbr, count(*) AS k FROM d GROUP BY 1) x),
    -- the three pairs with the largest member
    'largest', (
        SELECT json_agg(json_build_object('name', e.name, 'province', e.abbr,
            'municipalities', (
                SELECT json_agg(json_build_object('csdType', typ, 'addresses', n) ORDER BY n DESC, csd_code)
                FROM csd_r c WHERE c.name = e.name AND c.prov_code = e.prov_code))
            ORDER BY e.biggest DESC, e.name)
        FROM (SELECT * FROM d ORDER BY biggest DESC, name LIMIT 3) e)
);

INSERT INTO facts (key, value)
WITH k AS (
    SELECT name, count(DISTINCT prov_code) AS provinces, count(*) AS municipalities
    FROM csd_r GROUP BY 1 HAVING count(DISTINCT prov_code) >= 3
),
-- spelling key: lower case, accents stripped, Saint/Sainte shortened, punctuation dropped
norm AS (
    SELECT c.*, regexp_replace(regexp_replace(regexp_replace(
               lower(translate(name, 'ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜàâäçéèêëîïôöùûü', 'AAACEEEEIIOOUUUaaaceeeeiioouuu')),
               '\msainte\M', 'ste', 'g'), '\msaint\M', 'st', 'g'), '[^a-z0-9]', '', 'g') AS nk
    FROM csd_r c
)
SELECT 'sharedNames', json_build_object(
    'names', (
        SELECT json_agg(json_build_object(
            'name', k.name, 'provinces', k.provinces, 'municipalities', k.municipalities,
            'places', (
                SELECT json_agg(json_build_object('province', abbr, 'csdType', typ, 'addresses', n)
                                ORDER BY prov_code, n DESC, csd_code)
                FROM csd_r c WHERE c.name = k.name))
            ORDER BY k.provinces DESC, k.municipalities DESC, k.name)
        FROM k),
    -- names that reach 3+ provinces only once spelling variants are merged
    'spellingVariants', (
        SELECT json_agg(json_build_object('spellings', spellings, 'provinces', provinces, 'municipalities', municipalities)
                        ORDER BY provinces DESC, nk)
        FROM (SELECT nk, count(DISTINCT prov_code) AS provinces, count(*) AS municipalities,
                     json_agg(DISTINCT name) AS spellings
              FROM norm GROUP BY nk
              HAVING count(DISTINCT prov_code) >= 3 AND count(DISTINCT name) > 1) v),
    -- the retriever's default city
    'burlington', (
        SELECT json_agg(json_build_object('province', abbr, 'csdType', typ, 'addresses', n) ORDER BY n DESC)
        FROM csd_r WHERE name = 'Burlington')
);

INSERT INTO facts (key, value)
WITH mx AS (SELECT max(char_length(name)) AS l FROM csd_r),
mn AS (SELECT min(char_length(name)) AS l FROM csd_r),
st AS (SELECT max(char_length(official_street_name)) AS l FROM nar_addresses)
SELECT 'nameLengths', json_build_object(
    'longest', (
        SELECT json_agg(json_build_object('name', name, 'province', abbr, 'csdType', typ,
                                          'length', char_length(name), 'addresses', n) ORDER BY name, csd_code)
        FROM csd_r, mx WHERE char_length(name) = mx.l),
    'shortest', (
        SELECT json_agg(json_build_object('name', name, 'province', abbr, 'csdType', typ,
                                          'length', char_length(name), 'addresses', n) ORDER BY name, csd_code)
        FROM csd_r, mn WHERE char_length(name) = mn.l),
    'longestStreet', (
        SELECT json_agg(json_build_object(
            'street', concat_ws(' ', s.official_street_name, s.official_street_type, s.official_street_dir),
            'length', st.l, 'municipality', s.csd_eng_name, 'province', p.abbr,
            'addresses', s.k, 'example', s.example) ORDER BY s.official_street_name, s.csd_eng_name)
        FROM (SELECT official_street_name, official_street_type, official_street_dir, csd_eng_name, prov_code,
                     count(*) AS k,
                     min(pg_temp.fmt_address(apt_no_label, civic_no, civic_no_suffix, official_street_name,
                                             official_street_type, official_street_dir,
                                             mail_mun_name, mail_prov_abvn, mail_postal_code)) AS example
              FROM nar_addresses, st
              WHERE char_length(official_street_name) = st.l
              GROUP BY 1, 2, 3, 4, 5) s
        JOIN prov p ON p.code = s.prov_code)
)
FROM mx, mn, st;

INSERT INTO facts (key, value)
SELECT 'quebecSaints', json_build_object(
    'quebecMunicipalities', count(*),
    'saint', count(*) FILTER (WHERE name LIKE 'Saint-%'),
    'sainte', count(*) FILTER (WHERE name LIKE 'Sainte-%'),
    'pct', round(100.0 * count(*) FILTER (WHERE name LIKE 'Saint-%' OR name LIKE 'Sainte-%') / count(*), 1),
    'exclamationMunicipalities', (
        SELECT json_agg(json_build_object('name', name, 'province', abbr, 'addresses', n) ORDER BY name)
        FROM csd_r WHERE name LIKE '%!%'),
    'exclamationStreets', (
        SELECT json_agg(json_build_object('street', s, 'municipality', m, 'province', p, 'addresses', k) ORDER BY s, m)
        FROM (SELECT concat_ws(' ', street, typ, dir) AS s, csd_eng_name AS m, abbr AS p, count(*) AS k
              FROM ac JOIN prov ON prov.code = ac.prov_code
              WHERE street LIKE '%!%' GROUP BY 1, 2, 3) x)
)
FROM csd_r
WHERE prov_code = '24';

-- ---------------------------------------------------------------------------
-- Streets
-- ---------------------------------------------------------------------------

-- One row per (building, street) with its address count.
CREATE TEMP TABLE sb AS
SELECT loc_guid, csd_code, prov_code, nm, coalesce(typ, '') AS typ, coalesce(dir, '') AS dir,
       min(street) AS street, count(*) AS addrs
FROM ac
WHERE nm IS NOT NULL
GROUP BY loc_guid, csd_code, prov_code, nm, coalesce(typ, ''), coalesce(dir, '');
ANALYZE sb;

-- Per street name, nationally (all rows, including those without a municipality).
CREATE TEMP TABLE sn AS
SELECT nm, sum(addrs) AS addrs, count(DISTINCT loc_guid) AS bldgs, count(DISTINCT csd_code) AS csds,
       count(DISTINCT prov_code) AS provs
FROM sb GROUP BY nm;

-- Per name and street type, across municipalities.
CREATE TEMP TABLE sft AS
SELECT nm, typ, count(DISTINCT csd_code) AS csds, count(DISTINCT prov_code) AS provs, sum(addrs) AS addrs
FROM sb WHERE csd_code IS NOT NULL GROUP BY nm, typ;

-- The most common original spelling of each name, for display.
CREATE TEMP TABLE sdisp AS
SELECT nm, mode() WITHIN GROUP (ORDER BY street) AS street FROM sb GROUP BY nm;

INSERT INTO facts (key, value)
SELECT 'mainStreet', json_build_object(
    'byAddresses', (
        SELECT json_agg(json_build_object('name', d.street, 'addresses', s.addrs, 'buildings', s.bldgs,
                                          'municipalities', s.csds, 'provinces', s.provs) ORDER BY s.addrs DESC, s.nm)
        FROM (SELECT * FROM sn ORDER BY addrs DESC, nm LIMIT 5) s JOIN sdisp d USING (nm)),
    -- six rows: the sixth shows there is no tie at fifth place
    'byMunicipalities', (
        SELECT json_agg(json_build_object('name', d.street, 'municipalities', s.csds) ORDER BY s.csds DESC, s.nm)
        FROM (SELECT * FROM sn ORDER BY csds DESC, nm LIMIT 6) s JOIN sdisp d USING (nm)),
    'fullNameByMunicipalities', (
        SELECT json_agg(json_build_object('name', d.street, 'type', f.typ, 'municipalities', f.csds,
                                          'provinces', f.provs, 'addresses', f.addrs) ORDER BY f.csds DESC, f.nm, f.typ)
        FROM (SELECT * FROM sft ORDER BY csds DESC, nm, typ LIMIT 5) f JOIN sdisp d USING (nm)),
    'provincesWithout', (
        SELECT json_agg(p.abbr ORDER BY p.code) FROM prov p
        WHERE NOT EXISTS (SELECT 1 FROM sb WHERE nm = (SELECT nm FROM sn ORDER BY addrs DESC, nm LIMIT 1)
                                             AND sb.prov_code = p.code))
);

INSERT INTO facts (key, value)
SELECT 'principale', json_build_object(
    'byBuildings', (
        SELECT json_agg(json_build_object('name', d.street, 'buildings', s.bldgs, 'addresses', s.addrs,
                                          'addressesPerBuilding', round(s.addrs::numeric / s.bldgs, 2))
                        ORDER BY s.bldgs DESC, s.nm)
        FROM (SELECT * FROM sn ORDER BY bldgs DESC, nm LIMIT 3) s JOIN sdisp d USING (nm)),
    'buildingsByProvince', (
        SELECT json_agg(json_build_object('province', p.abbr, 'buildings', k) ORDER BY k DESC, p.abbr)
        FROM (SELECT prov_code, count(DISTINCT loc_guid) AS k FROM sb WHERE nm = 'principale' GROUP BY 1) x
        JOIN prov p ON p.code = x.prov_code),
    'fullNames', (
        SELECT json_agg(json_build_object('name', d.street, 'type', x.typ, 'buildings', x.b, 'addresses', x.a)
                        ORDER BY x.b DESC)
        FROM (SELECT nm, typ, count(DISTINCT loc_guid) AS b, sum(addrs) AS a FROM sb
              WHERE (nm, typ) IN (('principale', 'RUE'), ('main', 'ST')) GROUP BY 1, 2) x
        JOIN sdisp d USING (nm))
);

-- Per street within a municipality.
CREATE TEMP TABLE sm AS
SELECT csd_code, nm, typ, dir, sum(addrs) AS addrs, count(*) AS bldgs,
       mode() WITHIN GROUP (ORDER BY street) AS street
FROM sb WHERE csd_code IS NOT NULL GROUP BY csd_code, nm, typ, dir;

INSERT INTO facts (key, value)
SELECT 'busiestStreets', json_build_object(
    'streets', (SELECT count(*) FROM sm),
    'byAddresses', (
        SELECT json_agg(json_build_object(
            'street', concat_ws(' ', s.street, nullif(s.typ, ''), nullif(s.dir, '')),
            'municipality', c.name, 'province', c.abbr, 'addresses', s.addrs, 'buildings', s.bldgs)
            ORDER BY s.addrs DESC, s.csd_code, s.nm)
        FROM (SELECT * FROM sm ORDER BY addrs DESC, csd_code, nm LIMIT 3) s JOIN csd_r c USING (csd_code)),
    'fourthAddresses', (SELECT addrs FROM sm ORDER BY addrs DESC LIMIT 1 OFFSET 3),
    'byBuildings', (
        SELECT json_agg(json_build_object(
            'street', concat_ws(' ', s.street, nullif(s.typ, ''), nullif(s.dir, '')),
            'municipality', c.name, 'province', c.abbr, 'addresses', s.addrs, 'buildings', s.bldgs)
            ORDER BY s.bldgs DESC, s.csd_code, s.nm)
        FROM (SELECT * FROM sm ORDER BY bldgs DESC, csd_code, nm LIMIT 3) s JOIN csd_r c USING (csd_code)),
    'fourthBuildings', (SELECT bldgs FROM sm ORDER BY bldgs DESC LIMIT 1 OFFSET 3)
);

-- Exact street addresses (number, suffix, name, type, direction) by the number
-- of municipalities that have one. A suffixed number such as 12A is its own
-- address, distinct from 12.
CREATE TEMP TABLE rep AS
SELECT civic_no, sfx, nm, typ, dir, count(*) AS csds
FROM (SELECT DISTINCT civic_no, coalesce(civic_no_suffix, '') AS sfx, nm,
             coalesce(typ, '') AS typ, coalesce(dir, '') AS dir, csd_code
      FROM ac
      WHERE csd_code IS NOT NULL AND nm IS NOT NULL AND civic_no IS NOT NULL) d
GROUP BY 1, 2, 3, 4, 5;

CREATE TEMP TABLE rep_nodir AS
SELECT civic_no, sfx, nm, typ, count(*) AS csds
FROM (SELECT DISTINCT civic_no, coalesce(civic_no_suffix, '') AS sfx, nm,
             coalesce(typ, '') AS typ, csd_code
      FROM ac
      WHERE csd_code IS NOT NULL AND nm IS NOT NULL AND civic_no IS NOT NULL) d
GROUP BY 1, 2, 3, 4;

INSERT INTO facts (key, value)
WITH cut AS (SELECT csds FROM rep ORDER BY csds DESC LIMIT 1 OFFSET 4)
SELECT 'repeatedAddresses', json_build_object(
    -- the top five plus anything tied with fifth place
    'top', (
        SELECT json_agg(json_build_object(
            'address', pg_temp.fmt_street(NULL, r.civic_no, nullif(r.sfx, ''), d.street,
                                          nullif(r.typ, ''), nullif(r.dir, '')),
            'municipalities', r.csds) ORDER BY r.csds DESC, r.civic_no::int, r.sfx, r.nm)
        FROM rep r JOIN sdisp d USING (nm)
        WHERE r.csds >= cut.csds),
    'ignoringDirection', (
        SELECT json_agg(json_build_object(
            'address', pg_temp.fmt_street(NULL, r.civic_no, nullif(r.sfx, ''), d.street,
                                          nullif(r.typ, ''), NULL),
            'municipalities', r.csds) ORDER BY r.civic_no::int, r.sfx, r.nm)
        FROM rep_nodir r JOIN sdisp d USING (nm)
        WHERE r.csds = (SELECT max(csds) FROM rep_nodir))
)
FROM cut;

CREATE TEMP TABLE fun_picks (ord int, nm text, typ text);
INSERT INTO fun_picks VALUES
    (1, 'memory', 'LANE'), (2, 'easy', 'ST'), (3, 'sesame', 'ST'), (4, 'sasquatch', 'TRAIL'),
    (5, 'no name', 'RD'), (6, 'hockey', 'ST'), (7, 'dead end', 'RD'), (8, 'wayne gretzky', 'PKY');
CREATE TEMP TABLE fun_sb AS SELECT * FROM sb WHERE nm IN (SELECT nm FROM fun_picks);

INSERT INTO facts (key, value)
SELECT 'funStreets', json_agg(json_build_object(
    'name', (SELECT mode() WITHIN GROUP (ORDER BY street) FROM fun_sb s WHERE s.nm = p.nm AND s.typ = p.typ),
    'street', (SELECT mode() WITHIN GROUP (ORDER BY street) FROM fun_sb s WHERE s.nm = p.nm AND s.typ = p.typ)
              || ' ' || p.typ,
    'municipalities', (SELECT count(DISTINCT csd_code) FROM fun_sb s WHERE s.nm = p.nm AND s.typ = p.typ),
    'addresses', (SELECT sum(addrs) FROM fun_sb s WHERE s.nm = p.nm AND s.typ = p.typ AND csd_code IS NOT NULL),
    'addressesInclNoMunicipality', (SELECT sum(addrs) FROM fun_sb s WHERE s.nm = p.nm AND s.typ = p.typ),
    -- same name with any street type: 1 means one of a kind
    'nameMunicipalitiesAnyType', (SELECT count(DISTINCT csd_code) FROM fun_sb s WHERE s.nm = p.nm),
    'where', (
        SELECT json_agg(json_build_object('municipality', c.name, 'province', c.abbr) ORDER BY c.name, c.csd_code)
        FROM csd_r c
        WHERE c.csd_code IN (SELECT csd_code FROM fun_sb s WHERE s.nm = p.nm AND s.typ = p.typ)
          AND (SELECT count(DISTINCT csd_code) FROM fun_sb s WHERE s.nm = p.nm AND s.typ = p.typ) <= 3)
) ORDER BY p.ord)
FROM fun_picks p;

INSERT INTO facts (key, value)
SELECT 'islands', json_build_object(
    'total', count(*),
    'island', count(*) FILTER (WHERE official_street_type = 'ISLAND'),
    'ile', count(*) FILTER (WHERE official_street_type = 'ÎLE'),
    'ileQuebec', count(*) FILTER (WHERE official_street_type = 'ÎLE' AND prov_code = '24'),
    'islandOntario', count(*) FILTER (WHERE official_street_type = 'ISLAND' AND prov_code = '35'),
    'topMunicipalities', (
        SELECT json_agg(json_build_object('municipality', m, 'province', p, 'addresses', k) ORDER BY k DESC, m)
        FROM (SELECT csd_eng_name AS m, prov.abbr AS p, count(*) AS k
              FROM nar_addresses JOIN prov ON prov.code = prov_code
              WHERE official_street_type IN ('ISLAND', 'ÎLE') AND csd_eng_name IS NOT NULL
              GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT 3) x),
    'ileTopMunicipalities', (
        SELECT json_agg(json_build_object('municipality', m, 'province', p, 'addresses', k) ORDER BY k DESC, m)
        FROM (SELECT csd_eng_name AS m, prov.abbr AS p, count(*) AS k
              FROM nar_addresses JOIN prov ON prov.code = prov_code
              WHERE official_street_type = 'ÎLE' AND csd_eng_name IS NOT NULL
              GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT 3) x),
    'example', (
        SELECT pg_temp.fmt_street(apt_no_label, civic_no, civic_no_suffix, official_street_name,
                                  official_street_type, official_street_dir)
        FROM nar_addresses
        WHERE official_street_type = 'ISLAND' AND csd_eng_name = 'The Archipelago' AND official_street_name = 'A11'
        ORDER BY civic_no::int, addr_guid LIMIT 1)
)
FROM nar_addresses
WHERE official_street_type IN ('ISLAND', 'ÎLE');

INSERT INTO facts (key, value)
WITH d AS (SELECT coalesce(official_street_dir, '') AS dir, count(*) AS k FROM nar_addresses GROUP BY 1),
t AS (SELECT sum(k) AS tot FROM d),
top AS (SELECT dir, k FROM d WHERE dir <> '' ORDER BY k DESC, dir LIMIT 1)
SELECT 'directions', json_build_object(
    'none', (SELECT k FROM d WHERE dir = ''),
    'nonePct', (SELECT round(100.0 * k / t.tot, 2) FROM d WHERE dir = ''),
    'top', json_build_object('dir', top.dir, 'addresses', top.k, 'pct', round(100.0 * top.k / t.tot, 2)),
    'next', (
        SELECT json_agg(json_build_object('dir', dir, 'addresses', k) ORDER BY k DESC, dir)
        FROM (SELECT * FROM d WHERE dir <> '' ORDER BY k DESC, dir OFFSET 1 LIMIT 2) x),
    'topByMunicipality', (
        SELECT json_agg(json_build_object('municipality', c.name, 'province', c.abbr, 'addresses', x.k,
                                          'pctOfDirection', round(100.0 * x.k / top.k, 1)) ORDER BY x.k DESC)
        FROM (SELECT csd_code, count(*) AS k FROM ac WHERE dir = top.dir AND csd_code IS NOT NULL
              GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 2) x
        JOIN csd_r c USING (csd_code)),
    'withoutMunicipality', (SELECT count(*) FROM ac WHERE dir = top.dir AND csd_code IS NULL)
)
FROM t, top;

-- ---------------------------------------------------------------------------
-- Civic numbers
-- ---------------------------------------------------------------------------

INSERT INTO facts (key, value)
WITH c AS (SELECT civic_no, count(*) AS k FROM nar_addresses WHERE civic_no IS NOT NULL GROUP BY 1),
r AS (SELECT *, rank() OVER (ORDER BY k DESC) AS rk FROM c)
SELECT 'commonCivic', json_build_object(
    'top', (
        SELECT json_agg(json_build_object('civic', civic_no, 'addresses', k, 'rank', rk) ORDER BY rk, civic_no::int)
        FROM r WHERE rk <= 10),
    'one', (SELECT json_build_object('addresses', k, 'rank', rk) FROM r WHERE civic_no = '1')
);

INSERT INTO facts (key, value)
WITH top AS (
    SELECT a.* FROM nar_addresses a
    WHERE a.civic_no IS NOT NULL
    ORDER BY a.civic_no::bigint DESC, a.addr_guid LIMIT 1
)
SELECT 'highestCivic', json_build_object(
    'civic', top.civic_no::bigint,
    'street', concat_ws(' ', top.official_street_name, top.official_street_type, top.official_street_dir),
    'address', pg_temp.fmt_address(top.apt_no_label, top.civic_no, top.civic_no_suffix, top.official_street_name,
                                   top.official_street_type, top.official_street_dir,
                                   top.mail_mun_name, top.mail_prov_abvn, top.mail_postal_code),
    'municipality', top.csd_eng_name,
    'province', (SELECT abbr FROM prov WHERE code = top.prov_code),
    'tiedAtMax', (SELECT count(*) FROM nar_addresses WHERE civic_no = top.civic_no),
    'sameStreetInMunicipality', (
        SELECT json_build_object('addresses', count(*), 'min', min(civic_no::bigint), 'max', max(civic_no::bigint))
        FROM nar_addresses a
        WHERE a.csd_eng_name = top.csd_eng_name AND a.prov_code = top.prov_code
          AND a.official_street_name = top.official_street_name
          AND a.official_street_type IS NOT DISTINCT FROM top.official_street_type),
    'sixDigit', (SELECT count(*) FROM nar_addresses WHERE length(civic_no) = 6),
    'sevenPlusDigit', (SELECT count(*) FROM nar_addresses WHERE length(civic_no) >= 7)
)
FROM top;

INSERT INTO facts (key, value)
SELECT 'civicSuffixes', json_build_object(
    'withSuffix', count(*) FILTER (WHERE civic_no_suffix IS NOT NULL),
    'kinds', count(DISTINCT civic_no_suffix),
    'letterKinds', count(DISTINCT civic_no_suffix) FILTER (WHERE civic_no_suffix ~ '^[A-Z]$'),
    'fractionKinds', count(DISTINCT civic_no_suffix) FILTER (WHERE civic_no_suffix LIKE '%/%'),
    'mostCommon', (
        SELECT json_build_object('suffix', civic_no_suffix, 'addresses', count(*))
        FROM nar_addresses WHERE civic_no_suffix IS NOT NULL
        GROUP BY civic_no_suffix ORDER BY count(*) DESC, civic_no_suffix LIMIT 1),
    'a', count(*) FILTER (WHERE civic_no_suffix = 'A'),
    'half', count(*) FILTER (WHERE civic_no_suffix = '1/2'),
    'quarter', count(*) FILTER (WHERE civic_no_suffix = '1/4'),
    'threeQuarters', count(*) FILTER (WHERE civic_no_suffix = '3/4'),
    'threeQuartersTopMunicipality', (
        SELECT json_build_object('municipality', m, 'province', p, 'addresses', k)
        FROM (SELECT csd_eng_name AS m, prov.abbr AS p, count(*) AS k
              FROM nar_addresses JOIN prov ON prov.code = prov_code
              WHERE civic_no_suffix = '3/4' GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT 1) x),
    'civicZero', count(*) FILTER (WHERE civic_no = '0')
)
FROM nar_addresses;

-- ---------------------------------------------------------------------------
-- Buildings and units
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bld AS SELECT loc_guid, count(*) AS n FROM ac GROUP BY 1;

INSERT INTO facts (key, value)
WITH top AS (
    SELECT loc_guid, n, rank() OVER (ORDER BY n DESC) AS rk FROM bld ORDER BY n DESC, loc_guid LIMIT 20
),
t5 AS (SELECT * FROM top WHERE rk <= 5),
r AS (SELECT a.* FROM nar_addresses a WHERE a.loc_guid IN (SELECT loc_guid FROM t5))
SELECT 'biggestBuildings', json_build_object(
    'top', (
        SELECT json_agg(json_build_object(
            'rank', t5.rk,
            'addresses', t5.n,
            'address', (SELECT mode() WITHIN GROUP (ORDER BY pg_temp.fmt_street(NULL, r.civic_no, r.civic_no_suffix,
                            r.official_street_name, r.official_street_type, r.official_street_dir))
                        FROM r WHERE r.loc_guid = t5.loc_guid),
            'municipality', (SELECT min(csd_eng_name) FROM r WHERE r.loc_guid = t5.loc_guid),
            'province', (SELECT min(p.abbr) FROM r JOIN prov p ON p.code = r.prov_code WHERE r.loc_guid = t5.loc_guid),
            'postalCodes', (SELECT json_agg(DISTINCT pg_temp.fmt_postal(r.mail_postal_code))
                            FROM r WHERE r.loc_guid = t5.loc_guid),
            'distinctUnitLabels', (SELECT count(DISTINCT apt_no_label) FROM r WHERE r.loc_guid = t5.loc_guid),
            'residential', (SELECT count(*) FROM r WHERE r.loc_guid = t5.loc_guid AND bu_use = '1'),
            'partialResidential', (SELECT count(*) FROM r WHERE r.loc_guid = t5.loc_guid AND bu_use = '2'))
            ORDER BY t5.rk, t5.loc_guid)
        FROM t5),
    'sixthAddresses', (SELECT n FROM top WHERE rk = 6 LIMIT 1),
    'buildings', (SELECT count(*) FROM bld),
    'singleAddressBuildings', (SELECT count(*) FROM bld WHERE n = 1),
    'pctSingleAddress', (SELECT round(100.0 * count(*) FILTER (WHERE n = 1) / count(*), 2) FROM bld),
    'addressesPerBuilding', (SELECT round(sum(n)::numeric / count(*), 2) FROM bld)
);

INSERT INTO facts (key, value)
WITH labels AS (
    SELECT apt_no_label AS l, count(*) AS k, rank() OVER (ORDER BY count(*) DESC) AS rk
    FROM ac WHERE apt_no_label ~ '\S' GROUP BY 1
),
b AS (
    SELECT csd_code, count(*) AS k FROM ac
    WHERE upper(apt_no_label) LIKE 'BSMT%' OR upper(apt_no_label) LIKE 'BASEMENT%'
    GROUP BY 1
)
SELECT 'basements', json_build_object(
    'exactBsmt', (SELECT k FROM labels WHERE l = 'BSMT'),
    'bsmtRank', (SELECT rk FROM labels WHERE l = 'BSMT'),
    'topLabels', (SELECT json_agg(json_build_object('label', l, 'addresses', k) ORDER BY k DESC, l) FROM labels WHERE rk <= 5),
    'anyBasementLabel', (SELECT sum(k) FROM b),
    'topMunicipalities', (
        SELECT json_agg(json_build_object('municipality', c.name, 'province', c.abbr, 'basement', x.k,
                                          'addresses', c.n, 'pct', round(100.0 * x.k / c.n, 2)) ORDER BY x.k DESC)
        FROM (SELECT * FROM b WHERE csd_code IS NOT NULL ORDER BY k DESC, csd_code LIMIT 3) x
        JOIN csd_r c USING (csd_code))
);

INSERT INTO facts (key, value)
WITH mx AS (SELECT max(char_length(apt_no_label)) AS l FROM nar_addresses)
SELECT 'houseDescriptions', json_build_object(
    'longest', (
        SELECT json_agg(json_build_object(
            'label', apt_no_label, 'length', mx.l,
            'address', pg_temp.fmt_street(NULL, civic_no, civic_no_suffix, official_street_name,
                                          official_street_type, official_street_dir),
            'municipality', csd_eng_name, 'province', p.abbr) ORDER BY apt_no_label, addr_guid)
        FROM nar_addresses a JOIN prov p ON p.code = a.prov_code
        WHERE char_length(apt_no_label) = mx.l),
    -- unit labels that describe the house: trim colour, floors, windows
    'descriptiveByProvince', (
        SELECT json_agg(json_build_object('province', p.abbr, 'labels', k) ORDER BY k DESC, p.abbr)
        FROM (SELECT prov_code, count(*) AS k FROM nar_addresses
              WHERE upper(apt_no_label) LIKE '%TRIM%' OR upper(apt_no_label) ~ 'FLOORS?\.'
                 OR upper(apt_no_label) ~ 'WINDOWS?\.'
              GROUP BY 1) x
        JOIN prov p ON p.code = x.prov_code)
)
FROM mx;

-- ---------------------------------------------------------------------------
-- Geography (coordinates come from Locations/*.csv)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE g AS
SELECT a.*, l.lat, l.lon, l.csd_code
FROM nar_addresses a
JOIN loc l USING (loc_guid)
WHERE l.lat IS NOT NULL;
ANALYZE g;

INSERT INTO facts (key, value)
WITH pick AS (
    SELECT 1 AS o, 'north' AS k, (SELECT max(lat) FROM g) AS v UNION ALL
    SELECT 2, 'south', (SELECT min(lat) FROM g) UNION ALL
    SELECT 3, 'east', (SELECT max(lon) FROM g) UNION ALL
    SELECT 4, 'west', (SELECT min(lon) FROM g)
)
SELECT 'extremes', json_build_object(
    'geocodedAddresses', (SELECT count(*) FROM g),
    'points', (
        SELECT json_agg((
            SELECT json_build_object(
                'direction', p.k,
                'lat', round(min(g.lat)::numeric, 6),
                'lon', round(min(g.lon)::numeric, 6),
                'addressesAtPoint', count(*),
                'address', min(pg_temp.fmt_street(g.apt_no_label, g.civic_no, g.civic_no_suffix, g.official_street_name,
                                                  g.official_street_type, g.official_street_dir)),
                'municipality', min(g.csd_eng_name),
                'province', min(pr.abbr),
                'postalCode', min(pg_temp.fmt_postal(g.mail_postal_code)))
            FROM g JOIN prov pr ON pr.code = g.prov_code
            WHERE CASE WHEN p.k IN ('north', 'south') THEN g.lat ELSE g.lon END = p.v) ORDER BY p.o)
        FROM pick p),
    'northWithStreet', (
        SELECT json_build_object(
            'lat', round(lat::numeric, 6), 'lon', round(lon::numeric, 6),
            'address', pg_temp.fmt_street(apt_no_label, civic_no, civic_no_suffix, official_street_name,
                                          official_street_type, official_street_dir),
            'municipality', csd_eng_name, 'province', pr.abbr)
        FROM g JOIN prov pr ON pr.code = g.prov_code
        WHERE civic_no IS NOT NULL AND official_street_name IS NOT NULL
        ORDER BY lat DESC, addr_guid LIMIT 1),
    'northMunicipality', (
        SELECT json_build_object(
            'name', c.name, 'addresses', c.n,
            'withCivicNumber', (SELECT count(*) FROM ac WHERE ac.csd_code = c.csd_code AND civic_no IS NOT NULL),
            'withStreet', (SELECT count(*) FROM ac WHERE ac.csd_code = c.csd_code AND street IS NOT NULL))
        FROM csd_r c
        WHERE c.csd_code = (SELECT csd_code FROM g ORDER BY lat DESC, addr_guid LIMIT 1)),
    'northernmostInQuebec', (
        SELECT json_build_object('municipality', csd_eng_name, 'lat', round(lat::numeric, 6))
        FROM g WHERE prov_code = '24' ORDER BY lat DESC, addr_guid LIMIT 1)
);

INSERT INTO facts (key, value)
SELECT 'latitude', json_build_object(
    'geocodedAddresses', count(*),
    'southOf49', count(*) FILTER (WHERE lat < 49),
    'pctSouthOf49', round(100.0 * count(*) FILTER (WHERE lat < 49) / count(*), 2),
    'northOf60', count(*) FILTER (WHERE lat >= 60),
    'pctNorthOf60', round(100.0 * count(*) FILTER (WHERE lat >= 60) / count(*), 3),
    'medianLat', round((percentile_disc(0.5) WITHIN GROUP (ORDER BY lat))::numeric, 4)
)
FROM g;

-- Loneliest building: the greatest great-circle distance to the nearest other
-- geocoded building.
CREATE TEMP TABLE gb AS SELECT loc_guid, lat, lon, point(lon, lat) AS p FROM loc WHERE lat IS NOT NULL;
CREATE INDEX ON gb USING gist (p);
ANALYZE gb;

-- Candidates: buildings alone in their 0.5 deg latitude by 1 deg longitude
-- cell. A building whose nearest neighbour is farther than the widest cell's
-- diagonal must be alone in its cell, so every such building is a candidate.
CREATE TEMP TABLE cand AS
SELECT g.*
FROM gb g
JOIN (SELECT floor(lat * 2) AS ci, floor(lon) AS cj FROM gb GROUP BY 1, 2 HAVING count(*) = 1) c
  ON floor(g.lat * 2) = c.ci AND floor(g.lon) = c.cj;

-- Exact nearest neighbour inside a box reaching at least 1.5 deg of latitude
-- (about 166 km) in every direction; checked below.
CREATE TEMP TABLE nn AS
SELECT c.loc_guid, c.lat, c.lon, x.nn_guid, x.km
FROM cand c
LEFT JOIN LATERAL (
    SELECT g.loc_guid AS nn_guid, pg_temp.km(c.lat, c.lon, g.lat, g.lon) AS km
    FROM gb g
    WHERE g.p <@ box(point(c.lon - 1.5 / cos(radians(least(abs(c.lat) + 1.5, 89))), c.lat - 1.5),
                     point(c.lon + 1.5 / cos(radians(least(abs(c.lat) + 1.5, 89))), c.lat + 1.5))
      AND g.loc_guid <> c.loc_guid
    ORDER BY km LIMIT 1
) x ON true;

INSERT INTO facts (key, value)
WITH top AS (
    SELECT *, row_number() OVER (ORDER BY km DESC, loc_guid) AS rk
    FROM nn WHERE km IS NOT NULL ORDER BY km DESC, loc_guid LIMIT 3
),
ids AS (SELECT loc_guid FROM top UNION SELECT nn_guid FROM top),
r AS (SELECT a.* FROM nar_addresses a WHERE a.loc_guid IN (SELECT loc_guid FROM ids)),
info AS (
    SELECT r.loc_guid, count(*) AS addresses,
           min(pg_temp.fmt_street(NULL, r.civic_no, r.civic_no_suffix, r.official_street_name,
                                  r.official_street_type, r.official_street_dir)) AS address,
           min(r.csd_eng_name) AS municipality, min(p.abbr) AS province
    FROM r JOIN prov p ON p.code = r.prov_code GROUP BY r.loc_guid
),
geo AS (
    SELECT l.csd_code, count(*) FILTER (WHERE l.lat IS NOT NULL) AS geocoded, count(*) AS total
    FROM ac JOIN loc l USING (loc_guid)
    WHERE ac.csd_code IN (SELECT l2.csd_code FROM loc l2 WHERE l2.loc_guid IN (SELECT loc_guid FROM top))
    GROUP BY 1
)
SELECT 'loneliest', json_build_object(
    'geocodedBuildings', (SELECT count(*) FROM gb),
    'candidates', (SELECT count(*) FROM cand),
    'unresolvedCandidates', (SELECT count(*) FROM nn WHERE km IS NULL OR km > 166),
    'widestCellKm', (SELECT round(pg_temp.km(floor(min(lat) * 2) / 2, 0, floor(min(lat) * 2) / 2 + 0.5, 1)::numeric, 1)
                     FROM gb),
    'top', (
        SELECT json_agg(json_build_object(
            'rank', t.rk, 'km', round(t.km::numeric, 1),
            'address', i.address, 'municipality', i.municipality, 'province', i.province,
            'municipalityAddresses', g.total, 'municipalityGeocoded', g.geocoded,
            'nearest', json_build_object('address', j.address, 'municipality', j.municipality, 'province', j.province))
            ORDER BY t.rk)
        FROM top t
        JOIN info i ON i.loc_guid = t.loc_guid
        JOIN info j ON j.loc_guid = t.nn_guid
        JOIN loc l ON l.loc_guid = t.loc_guid
        LEFT JOIN geo g ON g.csd_code = l.csd_code)
);

INSERT INTO facts (key, value)
WITH f AS (
    SELECT substr(mail_postal_code, 1, 3) AS fsa, count(*) AS k
    FROM nar_addresses WHERE mail_postal_code IS NOT NULL GROUP BY 1
)
SELECT 'singleAddressFsas', json_build_object(
    'fsas', (SELECT count(*) FROM f),
    'withTwoAddresses', (SELECT count(*) FROM f WHERE k = 2),
    'list', (
        SELECT json_agg(json_build_object(
            'fsa', f.fsa,
            'address', pg_temp.fmt_address(a.apt_no_label, a.civic_no, a.civic_no_suffix, a.official_street_name,
                                           a.official_street_type, a.official_street_dir,
                                           a.mail_mun_name, a.mail_prov_abvn, a.mail_postal_code),
            'municipality', a.csd_eng_name, 'province', p.abbr, 'buUse', a.bu_use) ORDER BY f.fsa)
        FROM f
        JOIN nar_addresses a ON substr(a.mail_postal_code, 1, 3) = f.fsa AND f.k = 1
        JOIN prov p ON p.code = a.prov_code)
);

-- ---------------------------------------------------------------------------
-- Claims the page copy states in words
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE claim AS SELECT key, value::jsonb AS v FROM facts;

DO $$
DECLARE
    failed text[] := '{}';
    missing text[];
    j jsonb;
BEGIN
    SELECT array_agg(k) INTO missing
    FROM unnest(ARRAY[
        'dataset', 'tinyMunicipalities', 'smallestMunicipalities', 'littleBayIslands', 'meanMedian',
        'sizeBands', 'halfOfAddresses', 'topMunicipalities', 'biggestCity', 'mostBuildings',
        'torontoVsRegions', 'nunavut', 'biggestTown', 'smallestCities', 'provinceExtremes',
        'sameNameSameProvince', 'sharedNames', 'nameLengths', 'quebecSaints', 'mainStreet',
        'principale', 'busiestStreets', 'repeatedAddresses', 'funStreets', 'islands', 'directions',
        'commonCivic', 'highestCivic', 'civicSuffixes', 'biggestBuildings', 'basements',
        'houseDescriptions', 'extremes', 'latitude', 'loneliest', 'singleAddressFsas']) AS k
    WHERE k NOT IN (SELECT key FROM claim);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'missing facts (an editorial pick may have disappeared): %', missing;
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'tinyMunicipalities';
    IF (j->>'under25RuralMunicipalitiesOutsideSk')::int <> 0 THEN
        failed := array_append(failed, 'RM-type municipalities under 25 are no longer all in Saskatchewan');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'smallestMunicipalities';
    IF (j->>'count')::int < 2 THEN
        failed := array_append(failed, 'the smallest municipality is no longer a tie');
    END IF;
    IF (j->>'addressesEach')::int <> 1 THEN
        failed := array_append(failed, 'the smallest municipalities no longer have exactly one address');
    END IF;
    IF NOT (j->'municipalities' @> '[{"name": "Ivujivik", "province": "QC"}]') THEN
        failed := array_append(failed, 'Ivujivik is no longer tied for smallest');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'littleBayIslands';
    IF (j->>'hasCoordinates')::boolean THEN
        failed := array_append(failed, 'Little Bay Islands now has coordinates');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'extremes';
    IF j->'northernmostInQuebec'->>'municipality' IS DISTINCT FROM 'Ivujivik' THEN
        failed := array_append(failed, 'Ivujivik is no longer the northernmost geocoded address in Quebec');
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(j->'points') p WHERE (p->>'addressesAtPoint')::int <> 1) THEN
        failed := array_append(failed, 'a geographic extreme is now shared by several addresses');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'biggestCity';
    IF (j->'largestCity'->>'rank')::int <> 1 OR NOT (j->>'top10AllCityOrVille')::boolean THEN
        failed := array_append(failed, 'the largest municipalities are no longer all cities and villes');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'mostBuildings';
    IF (j->'top'->0->>'addressRank')::int = 1 THEN
        failed := array_append(failed, 'the municipality with the most buildings now also has the most addresses');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'torontoVsRegions';
    IF (j->'municipality'->>'addresses')::bigint <= (j->'atlanticPlusTerritories'->>'addresses')::bigint
       OR (j->'municipality'->>'addresses')::bigint <= (j->'manitobaPlusSaskatchewan'->>'addresses')::bigint
       OR (j->'municipality'->>'buildings')::bigint >= (j->'atlanticPlusTerritories'->>'buildings')::bigint
       OR (j->'municipality'->>'buildings')::bigint >= (j->'manitobaPlusSaskatchewan'->>'buildings')::bigint THEN
        failed := array_append(failed, 'the largest municipality vs regions comparison changed direction');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'nunavut';
    IF (j->>'municipalitiesEqual')::int <> 0 THEN
        failed := array_append(failed, 'a municipality now has exactly as many addresses as Nunavut');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'principale';
    IF j->'byBuildings'->0->>'name' IS DISTINCT FROM 'Principale'
       OR j->'buildingsByProvince'->0->>'province' IS DISTINCT FROM 'QC'
       OR (j->'buildingsByProvince'->0->>'buildings')::bigint >= (j->'byBuildings'->1->>'buildings')::bigint
       OR j->'fullNames'->0->>'name' IS DISTINCT FROM 'Principale' THEN
        failed := array_append(failed, 'Principale vs Main by buildings changed');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'halfOfAddresses';
    IF (j->'bottomHalf'->>'largestIncluded')::int >= (j->'bottomHalf'->>'smallestExcluded')::int THEN
        failed := array_append(failed, 'a tie now straddles the bottom-half cut');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'biggestTown';
    IF 2 * (j->>'cityTypeSmaller')::int <= (j->>'cityTypeMunicipalities')::int THEN
        failed := array_append(failed, 'the biggest town no longer has more addresses than most cities');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'houseDescriptions';
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(j->'longest') e
               WHERE NOT (upper(e->>'label') LIKE '%TRIM%' OR upper(e->>'label') ~ 'FLOORS?\.'
                          OR upper(e->>'label') ~ 'WINDOWS?\.')) THEN
        failed := array_append(failed, 'the longest unit label no longer describes the house');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'repeatedAddresses';
    IF (j->'top'->0->>'municipalities')::int = (j->'top'->1->>'municipalities')::int THEN
        failed := array_append(failed, 'the most repeated street address is now a tie');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'loneliest';
    IF (j->>'unresolvedCandidates')::int <> 0
       OR (j->'top'->1->>'km')::numeric <= (j->>'widestCellKm')::numeric THEN
        failed := array_append(failed, 'the loneliest-building search needs a wider box or finer cells');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'funStreets';
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE (e->>'municipalities')::int = 0) THEN
        failed := array_append(failed, 'a picked street name no longer exists');
    END IF;

    SELECT v INTO j FROM claim WHERE key = 'islands';
    IF j->>'example' IS NULL THEN
        failed := array_append(failed, 'the island example address no longer exists');
    END IF;
    IF j->'topMunicipalities'->0->>'municipality' IS DISTINCT FROM 'The Archipelago' THEN
        failed := array_append(failed, 'the island example (The Archipelago) is no longer from the leading municipality');
    END IF;
    IF (j->>'ileQuebec')::int <> (j->>'ile')::int THEN
        failed := array_append(failed, 'ÎLE street types are no longer all in Quebec');
    END IF;

    IF cardinality(failed) > 0 THEN
        RAISE EXCEPTION 'page copy no longer matches the data: %', array_to_string(failed, '; ');
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Output
-- ---------------------------------------------------------------------------

\pset format unaligned
\pset tuples_only on
SELECT json_object_agg(key, value ORDER BY ord) FROM facts;
