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

Postgres data lives directly on the external **FATRIOT** APFS SSD at
`/Volumes/FATRIOT/postgres/data`. Connect the drive, then manage the cluster with
`scripts/fatriot-pg.sh` (see [FATRIOT setup](docs/FATRIOT-SETUP.md) and
[link & cabling](docs/FATRIOT-LINK-AND-CABLING.md)).

```bash
./scripts/fatriot-pg-setup.sh                 # one-time: initdb, schema, bulk load, indexes
./scripts/fatriot-pg.sh start                 # start cluster (also: stop | restart | status)
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
- Data directory on the FATRIOT SSD (`/Volumes/FATRIOT/postgres/data`): about `6.3 GB`

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
- [TODO](TODO.md)
