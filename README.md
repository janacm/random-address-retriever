# Random Address Retriever

Local National Address Register search/retrieval workspace.

## Current State

- Git is initialized for project scripts and docs.
- Large source datasets, GeoJSON files, and local database storage are ignored by Git.
- Postgres 16 is running locally on port `55432`.
- The full NAR CSV dataset has been imported into `nar_addresses`.
- A local HTTP API is available from `server/` (Fastify + TypeScript).
- A React frontend is available from `apps/web`.
- Verified row count: `17,169,294`.
- Verified Burlington rows:
  - `Burlington, ON`: `79,160`
  - `Burlington, NL`: `101`

## Repo Layout

```text
server/       Fastify + TypeScript bearer-token HTTP API (see server/README.md)
apps/
  web/        Vite React frontend for random address retrieval
docs/
  reference/  NAR PDF/image reference files
scripts/      Local database lifecycle and CLI lookup scripts
sql/          Postgres schema for imported NAR CSV chunks
```

## Frontend and API

Install dependencies once:

```bash
pnpm install
```

Start Postgres, then start the app:

```bash
./scripts/db-start.sh
pnpm dev
```

Open the frontend at:

```text
http://127.0.0.1:5173
```

`pnpm install` installs all workspace packages (the API in `server/` and the web
app in `apps/web/`), and `pnpm dev` starts both the API and the frontend.

The API (`server/`) listens at `http://127.0.0.1:8787`. In dev mode, the API and
frontend default to the bearer token `local-dev-token`. Set `ADDRESS_API_TOKEN`
and `VITE_ADDRESS_API_TOKEN` to the same value if you override it.

The random pick uses an index-only scan over a covering index (`Heap Fetches:
0`), which keeps it fast and uniform without sampling (~20 ms warm). The shell
CLI uses the same exact-query path. See [server/README.md](server/README.md).

Example API call:

```bash
curl \
  -H "Authorization: Bearer local-dev-token" \
  "http://127.0.0.1:8787/api/random-address?city=Burlington&province=ON&verbose=true"
```

Production API start requires an explicit token:

```bash
ADDRESS_API_TOKEN="replace-me" NODE_ENV=production pnpm --filter random-address-api start
```

## Database

Postgres data lives directly on the external **FATRIOT** APFS SSD at
`/Volumes/FATRIOT/postgres/data`. Because that drive is APFS (not ExFAT), the old
sparseimage workaround is gone; the scripts just verify the drive is mounted
before starting Postgres. Override `PG_MOUNT`/`PGDATA` (e.g. in `.env.local`) if
your data lives elsewhere. See [FATRIOT setup](docs/FATRIOT-SETUP.md) and
[link & cabling](docs/FATRIOT-LINK-AND-CABLING.md).

```bash
./scripts/db-init.sh                          # one-time: initdb + schema (creates the cluster)
./scripts/import-addresses.sh                 # bulk-load the NAR CSVs and rebuild indexes
./scripts/db-optimize.sh                      # one-time: covering index + VACUUM ANALYZE
./scripts/db-start.sh                         # start Postgres (./scripts/db-stop.sh to stop)
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
- Data directory on the FATRIOT SSD (`/Volumes/FATRIOT/postgres/data`): about `6.3 GB`
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
- [FATRIOT link speed & cabling](docs/FATRIOT-LINK-AND-CABLING.md)
- [Cloudflare Tunnel and Netlify setup](docs/CLOUDFLARE_NETLIFY.md)
- [NAR reference files](docs/reference/)
- [TODO](TODO.md)
