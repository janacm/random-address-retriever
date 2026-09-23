-- Streams a stratified, deterministic sample of nar_addresses as COPY text.
-- Run against the full local database by scripts/sample-build.sh with psql
-- variables:
--   :target  approximate total rows to keep
--   :floor   rows every city/province pair keeps (or all of them, if fewer)
--
-- Allocation: each (city, province) pair first gets min(count, floor) rows so
-- every city in the typeahead still returns an address. The remaining budget
-- is split in proportion to each pair's leftover rows, so big cities stay big.
-- Rows are ranked by md5(addr_guid), so the same inputs give the same sample.
-- Rows with no city are dropped: the API can only reach rows by city.

COPY (
    WITH groups AS (
        SELECT lower(csd_eng_name) AS city_key,
               mail_prov_abvn AS prov_key,
               count(*) AS total,
               least(count(*), :floor) AS base
        FROM nar_addresses
        WHERE csd_eng_name <> ''
        GROUP BY 1, 2
    ),
    share AS (
        SELECT least(
                   greatest(:target - sum(base), 0)::numeric
                       / nullif(sum(total - base), 0),
                   1
               ) AS fraction
        FROM groups
    ),
    quotas AS (
        SELECT g.city_key,
               g.prov_key,
               g.base + round((g.total - g.base) * coalesce(s.fraction, 0))::bigint AS quota
        FROM groups g CROSS JOIN share s
    ),
    ranked AS (
        SELECT a.*,
               row_number() OVER (
                   PARTITION BY lower(a.csd_eng_name), a.mail_prov_abvn
                   ORDER BY md5(a.addr_guid)
               ) AS rn
        FROM nar_addresses a
        WHERE a.csd_eng_name <> ''
    )
    SELECT r.loc_guid::uuid,
           r.addr_guid::uuid,
           r.apt_no_label,
           r.civic_no,
           r.civic_no_suffix,
           r.official_street_name,
           r.official_street_type,
           r.official_street_dir,
           r.csd_eng_name,
           r.mail_prov_abvn,
           r.mail_postal_code
    FROM ranked r
    JOIN quotas q
      ON q.city_key = lower(r.csd_eng_name)
     AND q.prov_key IS NOT DISTINCT FROM r.mail_prov_abvn
    WHERE r.rn <= q.quota
) TO STDOUT;
