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

Postgres data lives on the Samsung T5 inside this repo at `.postgres/random-address-postgres.sparseimage`.
The scripts mount that APFS sparseimage at `/Volumes/random-address-postgres` before starting Postgres.

```bash
./scripts/db-init.sh
./scripts/import-addresses.sh
./scripts/random-address.sh Burlington
./scripts/random-address.sh Burlington ON
./scripts/random-address.sh --city Burlington --province ON
./scripts/random-address.sh --city Burlington --province ON --verbose
```

By default, `random-address.sh` prints the formatted address, city, province, and
postal code. Use `--verbose` when you also need the source `loc_guid` and
`addr_guid`.

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
- [TODO](TODO.md)
