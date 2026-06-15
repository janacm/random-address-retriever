# Requirements

## Objective

Build a local random Canadian address retriever backed by Statistics Canada's National Address Register data.

The first useful workflow is:

```text
give me a random address for Burlington
```

The local implementation should return a real NAR address quickly, with enough metadata to inspect or trace the source row.

## Current Requirements

1. Store and query the NAR CSV data locally.
2. Use the `Addresses/Address_*.csv` files as the canonical import source.
3. Run Postgres locally without requiring Docker.
4. Keep Postgres storage on the Samsung T5 external SSD.
5. Avoid storing Postgres directly on the ExFAT filesystem.
6. Keep large datasets and database files out of Git.
7. Import all available NAR CSV chunks into one queryable table.
8. Support random address lookup by exact city name.
9. Support optional province filtering because city names can appear in multiple provinces.
10. Return at least:
    - formatted address
    - city
    - province abbreviation
    - postal code
    - `loc_guid`
    - `addr_guid`
11. Provide simple local scripts for database start, stop, import, and random lookup.

## Data Requirements

The active table is `nar_addresses`.

Required imported fields include:

- `loc_guid`
- `addr_guid`
- `apt_no_label`
- `civic_no`
- `civic_no_suffix`
- `official_street_name`
- `official_street_type`
- `official_street_dir`
- `mail_mun_name`
- `mail_prov_abvn`
- `mail_postal_code`
- `csd_eng_name`
- `prov_code`
- `bg_x`
- `bg_y`
- `bu_use`

The current import contains `17,169,294` rows.

## Query Requirements

The baseline city lookup is exact and case-insensitive:

```sql
WHERE lower(csd_eng_name) = lower('Burlington')
```

Province filtering should use postal province abbreviation:

```sql
AND mail_prov_abvn = 'ON'
```

Current verified counts:

- `Burlington, ON`: `79,160`
- `Burlington, NL`: `101`

## Operational Requirements

Postgres connection:

```text
postgresql://janac@127.0.0.1:55432/random_address_retriever
```

Required scripts:

- `scripts/db-init.sh`
- `scripts/db-start.sh`
- `scripts/db-stop.sh`
- `scripts/import-addresses.sh`
- `scripts/random-address.sh`

The local Postgres cluster must live inside:

```text
.postgres/random-address-postgres.sparseimage
```

The image mounts at:

```text
/Volumes/random-address-postgres
```

## Performance Requirements

The database is read-heavy after import.

Current acceptable baseline:

- Full import completes locally from the 27 CSV files.
- Exact city count and random lookup use the city index.
- `Burlington` random lookup was observed around `158 ms` on a cold-ish cache.

## Constraints

- The Samsung T5 is currently formatted as ExFAT.
- Direct Postgres initialization on ExFAT failed because macOS created `._*` AppleDouble files inside Postgres internals.
- Postgres storage must therefore use the APFS sparseimage workaround unless the drive is reformatted.
- Source datasets and generated database storage must not be committed to Git.
- Current coordinates are `BG_X` and `BG_Y`; latitude/longitude are not part of the active CSV table.

## Out Of Scope For Now

- Web frontend.
- REST or GraphQL API.
- Fuzzy city search.
- Postal-code radius search.
- PostGIS geospatial search.
- Normalized location/address tables.
- Packaging for another machine.
- Automated tests.

## Open Questions

- Should random selection be uniform across address rows, locations, or buildings?
- Should city matching use `csd_eng_name`, `mail_mun_name`, or both?
- Should future queries prefer mailing address fields or official civic address fields?
- Should duplicate or multi-unit addresses be collapsed for some use cases?
