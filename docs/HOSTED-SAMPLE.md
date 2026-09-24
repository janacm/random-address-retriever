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

Measured at the default 3,000,000 rows (about 17.5% of 17,169,294):
`nar_addresses` is 341 MiB with its index and the whole database 349 MiB, about
119 bytes per row. On Neon the cap (`neon.max_cluster_size`, 512 MiB) counts
every database in the cluster, and `postgres`, `template0`, and `template1`
take about 22 MiB, so with the sample live the cluster is 372 MiB and has about
140 MiB of headroom (measured 2026-09-24). Adjust `SAMPLE_TARGET_ROWS` for a
different tier at roughly 119 bytes per row.

## Build and push

```bash
export LC_ALL=en_US.UTF-8 PG_MOUNT=/System/Volumes/Data PGDATA="$PWD/.postgres/data"
./scripts/sample-build.sh
SAMPLE_DATABASE_URL='postgresql://USER:PASSWORD@HOST/DB?sslmode=require' ./scripts/sample-push.sh
```

`sample-build.sh` only reads the full database and rebuilds the local
`random_address_sample` database. By default `sample-push.sh` loads the rows
into a `nar_staging` schema, builds the indexes and city view there, checks the
row and city counts, then swaps `nar_addresses` and `nar_cities` into `public` in one
transaction. The API keeps serving the old data until the swap, and a failed or
interrupted run drops the staging copy and leaves the live tables as they were.
Keep the connection URL in your shell or `.env.local`; never commit it.

Both modes start with a read-only pre-flight and refuse, changing nothing on
the target, when:

- the local sample has no rows, or its `nar_addresses` columns differ from what
  `sql/sample-schema.sql` creates (COPY maps columns by position);
- the sample covers fewer city/province pairs than the target serves, counted
  from the address rows on both sides (set `SAMPLE_PUSH_ALLOW_SHRINK=1` if that
  is intended);
- the result would not fit the storage cap. The cap is Neon's
  `neon.max_cluster_size` when the target reports it, else 500 MiB.
  `SAMPLE_STORAGE_LIMIT_MB` (whole MiB) can lower it but not raise it above a
  cap the target reports. Usage is measured across every database in the
  cluster.

Only after that does it install `pg_trgm` if missing and clear any leftover
`nar_staging` from an earlier failed run.

Staging holds both copies at once. With the 3M-row sample already live, a
staged push needs about 713 MiB (372 MiB cluster plus the 341 MiB sample) of
the 512 MiB cap, so on the free tier replace the tables in place instead (about
372 MiB):

```bash
SAMPLE_PUSH_IN_PLACE=1 SAMPLE_DATABASE_URL='...' ./scripts/sample-push.sh
```

In-place mode drops and recreates `nar_addresses` in one transaction, then
loads it: random-address lookups find nothing until the COPY commits, and
`/api/cities` errors until the city view is rebuilt at the end. On the prod Neon
project on 2026-09-24, with the previous revision of this script (separate
DROP statements, same load), the push took 44 s; random-address lookups
returned nothing for about 35 s and `/api/cities` errored for about 40 s. A
failed or interrupted run leaves the tables empty or partial until the push is
re-run, and the script says so when it exits.

Each full reload writes roughly 300 MB of WAL (an estimate: lifetime WAL divided
by the two loads so far). Neon Free keeps 6 hours of history for instant
restore; its plan pages give the cap as 1 GB in some places and 1 GB-month in
others. At ~300 MB per reload, a fourth push within 6 hours would pass 1 GB,
and the pages checked on 2026-09-24 don't say what happens then. If restoring
to a pre-push point matters, space pushes out.

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

- Collation: the Neon database uses the builtin provider with locale
  `C.UTF-8`, so `lower('MONTRÉAL')` is `montréal`. The local cluster is plain
  `C`, where `lower()` leaves non-ASCII letters alone. Any input whose accented
  letters differ in case from the stored name (`MONTRÉAL` for Montréal, or
  `sept-îles` for Sept-Îles) matches on Neon but not locally, in both the random
  pick and `/api/cities`. City names in the data have no case variants, so the
  sample itself is the same on both.
- Neon: compute suspends after 5 minutes idle and wakes on the next connection,
  so the first request after a quiet period is slower. 100 CU-hours per month.
- Supabase: free projects pause after 1 week of inactivity and stay paused until
  restored from the dashboard.
