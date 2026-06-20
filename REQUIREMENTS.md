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
4. Keep Postgres storage on the external SSD (`FATRIOT`, APFS).
5. Store the Postgres cluster directly on the APFS SSD (no sparseimage needed).
6. Keep large datasets and database files out of Git.
7. Import all available NAR CSV chunks into one queryable table.
8. Support random address lookup by exact city name.
9. Support optional province filtering because city names can appear in multiple provinces.
10. Return at least:
    - formatted address
    - city
    - province abbreviation
    - postal code
11. Support `--verbose` output with source identifiers:
    - `loc_guid`
    - `addr_guid`
12. Provide simple local scripts for database start, stop, import, random lookup, and API startup.
13. Expose the MacBook-hosted backend through Cloudflare Tunnel rather than NAS hosting.
14. Keep the DS220j as backup/support storage only.

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
- `scripts/api-start.sh`

The local Postgres cluster lives on the external APFS SSD at:

```text
/Volumes/FATRIOT/postgres/data
```

Override `PG_MOUNT`/`PGDATA` (for example in `.env.local`) to relocate it.

## API Requirements

The local API must:

- Bind to `127.0.0.1` by default.
- Listen on port `8787` by default.
- Require `ADDRESS_API_TOKEN` for every request (constant-time comparison).
- Support `GET /healthz`.
- Support `GET /random-address?city=Burlington&province=ON`.
- Support optional `verbose=true` output with source identifiers.
- Use parameterized SQL (`$1`, `$2`); never interpolate caller values.
- Never expose raw SQL or direct Postgres credentials.
- Return JSON only.

The API is implemented in `server/` as a TypeScript [Fastify](https://fastify.dev)
service using a pooled `pg` connection. See [server/README.md](server/README.md).

The Cloudflare/Netlify path must:

- Expose only the local API through Cloudflare Tunnel.
- Protect the tunnel hostname with Cloudflare Access Service Auth.
- Store Cloudflare Access service-token credentials only in Netlify server-side environment variables.
- Call the tunnel hostname only from a Netlify/Next server route, not browser code.

## Performance Requirements

Only read performance matters for this project.

The database is read-heavy after import. Lookups (exact city count and random
address retrieval) are the only operations whose latency we care about and the
only target for any future profiling or optimization.

Write performance is explicitly out of scope:

- Import/`COPY` throughput, `fsync` latency, checkpoints, and WAL behavior are
  not optimization targets.
- This is acceptable because `nar_addresses` is `UNLOGGED`, the table is loaded
  once and then queried, and the source CSVs are retained so it can be rebuilt.
- The earlier ExFAT/sparseimage storage stack had a large `fsync`/write penalty
  (~33x slower than the internal SSD in local benchmarks), but this does not
  affect the read-only workload we care about.

Current acceptable baseline:

- Full import completes locally from the 27 CSV files.
- Exact city count and random lookup use the city index.
- `Burlington` random lookup was observed around `158 ms` on a cold-ish cache.
- Profiling should focus on read latency: random-read I/O, warm vs cold cache,
  and end-to-end query timing (`EXPLAIN (ANALYZE, BUFFERS)`, `pgbench`).

## Constraints

- Postgres storage uses the external APFS SSD `FATRIOT`, so the cluster is stored directly with no sparseimage workaround.
- Historical: an earlier ExFAT drive (Samsung T5) required an APFS sparseimage because macOS created `._*` AppleDouble files inside the Postgres data directory (see docs/LEARNINGS.md).
- Source datasets and generated database storage must not be committed to Git.
- Current coordinates are `BG_X` and `BG_Y`; latitude/longitude are not part of the active CSV table.
- The DS220j is not the selected live-hosting target for this database.

## Tooling And Quality Requirements

- The API is written in TypeScript with strict typing.
- Inputs are validated at the edge (TypeBox schema → runtime + static types).
- The HTTP layer is testable without a database (dependency-injected `Database`).
- Unit tests run with no external services; integration tests run against a real
  Postgres when `RUN_DB_TESTS=1`.
- CI (GitHub Actions) runs typecheck, build, unit tests, and integration tests
  against a seeded `postgres:16` service.

## Out Of Scope For Now

- Web frontend.
- Public direct REST or GraphQL API.
- Fuzzy city search.
- Postal-code radius search.
- PostGIS geospatial search.
- Normalized location/address tables.
- Packaging for another machine.

## Open Questions

- Should random selection be uniform across address rows, locations, or buildings?
- Should city matching use `csd_eng_name`, `mail_mun_name`, or both?
- Should future queries prefer mailing address fields or official civic address fields?
- Should duplicate or multi-unit addresses be collapsed for some use cases?
