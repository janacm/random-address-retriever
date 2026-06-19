# Random Address Retriever

Local National Address Register search/retrieval workspace.

## Current State

- Git is initialized for project scripts and docs.
- Large source datasets, GeoJSON files, and local database storage are ignored by Git.
- Postgres 16 is running locally on port `55432`.
- The full NAR CSV dataset has been imported into `nar_addresses`.
- A local HTTP API is available from `apps/api`.
- A React frontend is available from `apps/web`.
- Verified row count: `17,169,294`.
- Verified Burlington rows:
  - `Burlington, ON`: `79,160`
  - `Burlington, NL`: `101`

## Repo Layout

```text
apps/
  api/        Local bearer-token HTTP API backed by Postgres
  web/        Vite React frontend for random address retrieval
docs/
  reference/  NAR PDF/image reference files
scripts/      Local database lifecycle and CLI lookup scripts
sql/          Postgres schema for imported NAR CSV chunks
```

## Frontend and API

Install dependencies once:

```bash
npm install
```

Start Postgres, then start the app:

```bash
./scripts/db-start.sh
npm run dev
```

Open the frontend at:

```text
http://127.0.0.1:5173
```

The API listens at `http://127.0.0.1:8787`. In dev mode, the API and frontend
default to the bearer token `local-dev-token`. Set `ADDRESS_API_TOKEN` and
`VITE_ADDRESS_API_TOKEN` to the same value if you override it.

For interactive latency, the API checks that a city/province match exists, then
tries a small Postgres `TABLESAMPLE` lookup before falling back to the exact
indexed `ORDER BY random()` query. The shell CLI keeps the exact query path.

Example API call:

```bash
curl \
  -H "Authorization: Bearer local-dev-token" \
  "http://127.0.0.1:8787/api/random-address?city=Burlington&province=ON&verbose=true"
```

Production API start requires an explicit token:

```bash
ADDRESS_API_TOKEN="replace-me" npm run start -w @random-address/api
```

## Database

Postgres data lives on the Samsung T5 inside this repo at `.postgres/random-address-postgres.sparseimage`.
The scripts mount that APFS sparseimage at `/Volumes/random-address-postgres` before starting Postgres.

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

The local API listens on `127.0.0.1:8787` and requires `ADDRESS_API_TOKEN`.
Expose that API through Cloudflare Tunnel and Cloudflare Access; do not expose
Postgres directly.

Connection:

```text
postgresql://janac@127.0.0.1:55432/random_address_retriever
```

Storage after import:

- Postgres logical database size: about `5.3 GB`
- Mounted data directory: about `6.3 GB`
- Sparseimage file on the Samsung T5: about `8.6 GB`

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
- [NAR reference files](docs/reference/)
- [TODO](TODO.md)
