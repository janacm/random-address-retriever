# Hosted sample database

The full NAR import is 8.1 GB locally. Free hosted Postgres tiers are about
500 MB (Neon: 0.5 GB per project; Supabase: 500 MB per project, checked
2026-09-22), so the hosted copy is a stratified sample in a slim schema.

## What the sample keeps

- Only the 11 columns the API reads (`server/src/db.ts`), with GUIDs as `uuid`.
- Only the indexes the API's two queries use: `(lower(csd_eng_name),
  mail_prov_abvn)` for the random pick, plus the `nar_cities` typeahead view and
  its indexes. No covering index, primary key, postal, street, or trigram index
  on the base table.
- Every city/province pair (4,612) keeps `min(count, 25)` addresses, and the
  remaining row budget is split in proportion to city size. Rows are ranked by
  `md5(addr_guid)`, so a rebuild with the same settings gives the same sample.
- Rows without a city (15,729 in the July 2025 release) are dropped, because
  the API can only reach rows by city.

Measured locally at the default 3,000,000 rows (about 17.5% of 17,169,294):
`nar_addresses` is 341 MB with its index, the whole database 350 MB. That
leaves roughly 150 MB for the provider's own system schemas and maintenance.
Size scales at about 114 bytes per row, so adjust `SAMPLE_TARGET_ROWS` for a
different tier.

## Build and push

```bash
export LC_ALL=en_US.UTF-8 PG_MOUNT=/System/Volumes/Data PGDATA="$PWD/.postgres/data"
./scripts/sample-build.sh
SAMPLE_DATABASE_URL='postgresql://USER:PASSWORD@HOST/DB?sslmode=require' ./scripts/sample-push.sh
```

`sample-build.sh` only reads the full database and rebuilds the local
`random_address_sample` database. `sample-push.sh` drops and recreates
`nar_addresses` and `nar_cities` on the target, copies the rows, builds the
indexes, and checks that the row counts match. Keep the connection URL in your
shell or `.env.local`; never commit it.

### Neon project

The repo is linked (`neon link`, context in the gitignored `.neon`) to Neon
project `random-address` (`falling-meadow-00098803`, `aws-us-east-2`,
Postgres 18), branch `production`. `neon link` and `neon deploy` write
`DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) into the
gitignored `.env.local`. Push over the direct connection:

```bash
set -a; source .env.local; set +a
SAMPLE_DATABASE_URL="$DATABASE_URL_UNPOOLED" ./scripts/sample-push.sh
```

`neon.ts` declares the branch policy (`auth: true`; Neon Auth was already
enabled on `production`). Preview changes with `neon config plan`, apply with
`neon deploy`.

## Pointing the API at the hosted database

The API reads standard libpq variables, and `pg` honours `PGSSLMODE`:

```text
PGHOST=<host from the provider dashboard>
PGPORT=5432
PGDATABASE=<database name>
PGUSER=<user>
PGPASSWORD=<password>
PGSSLMODE=require
```

Neon's certificates chain to Let's Encrypt (ISRG Root X1), so `PGSSLMODE=require`
verifies with Node's built-in CA list. Supabase signs with its own CA: download
it from Database Settings > SSL Configuration and start the API with
`NODE_EXTRA_CA_CERTS=/path/to/supabase-ca.crt`, or the TLS handshake fails.

## Provider notes

- Neon: compute suspends after 5 minutes idle and wakes on the next connection,
  so the first request after a quiet period is slower. 100 CU-hours per month.
- Supabase: free projects pause after 1 week of inactivity and stay paused until
  restored from the dashboard.
