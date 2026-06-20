# Random Address Retriever

Local National Address Register search/retrieval workspace.

## Current State

- Git is initialized for project scripts and docs.
- Large source datasets, GeoJSON files, and local database storage are ignored by Git.
- Postgres 16 is running locally on port `55432`.
- The full NAR CSV dataset has been imported into `nar_addresses`.
- Verified row count: `17,169,294`.
- Verified Burlington rows:
  - `Burlington, ON`: `79,160`
  - `Burlington, NL`: `101`

## Database

Postgres data lives on the external APFS SSD `FATRIOT` at
`/Volumes/FATRIOT/postgres/data`. Because that drive is APFS (not ExFAT), the
old sparseimage workaround is no longer needed; the scripts just verify the
drive is mounted before starting Postgres. Override `PG_MOUNT`/`PGDATA` (e.g. in
`.env.local`) if your data lives elsewhere.

```bash
./scripts/db-init.sh
./scripts/import-addresses.sh
./scripts/random-address.sh Burlington
./scripts/random-address.sh Burlington ON
./scripts/random-address.sh --city Burlington --province ON
./scripts/random-address.sh --city Burlington --province ON --verbose
cp .env.example .env.local
./scripts/api-start.sh
```

By default, `random-address.sh` prints the formatted address, city, province, and
postal code. Use `--verbose` when you also need the source `loc_guid` and
`addr_guid`.

## Local API

The API is a strongly-typed [Fastify](https://fastify.dev) + TypeScript service
in [`server/`](server/) that uses a pooled `pg` connection (see
[server/README.md](server/README.md)). It listens on `127.0.0.1:8787` and
requires `ADDRESS_API_TOKEN` on every request. Expose it through Cloudflare
Tunnel and Cloudflare Access; never expose Postgres directly.

```bash
./scripts/db-optimize.sh   # one-time: build covering index + VACUUM ANALYZE
./scripts/api-start.sh     # start Postgres + build & run the API
./scripts/healthcheck.sh   # verify Postgres + API are up
```

A random pick is served by an index-only scan over a covering index (~20 ms
warm; cold first request drops from ~16.8 s to a few hundred ms). Run
`./scripts/db-optimize.sh` once after a bulk import.

Connection:

```text
postgresql://janac@127.0.0.1:55432/random_address_retriever
```

Storage after import (on the FATRIOT APFS SSD):

- Postgres logical database size: about `5.3 GB`
- Data directory (`/Volumes/FATRIOT/postgres/data`): about `6.3 GB`
- Covering index for fast lookups (`scripts/db-optimize.sh`): about `2.7 GB`

Useful query:

```sql
SELECT civic_no, official_street_name, official_street_type, mail_postal_code
FROM nar_addresses
WHERE lower(csd_eng_name) = lower('Burlington')
  AND mail_prov_abvn = 'ON'
ORDER BY random()
LIMIT 1;
```

## Project Docs

- [Data source decision](DATA_SOURCE_DECISION.md)
- [Requirements](REQUIREMENTS.md)
- [Findings and learnings](docs/LEARNINGS.md)
- [Cloudflare Tunnel and Netlify setup](docs/CLOUDFLARE_NETLIFY.md)
- [TODO](TODO.md)
