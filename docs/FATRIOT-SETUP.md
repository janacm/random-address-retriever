# Postgres setup on the external SSD (FATRIOT)

Postgres is hosted directly on the external APFS volume (`/Volumes/FATRIOT` by
default) and loaded from the staged NAR source CSVs. Override `PG_MOUNT`/`PGDATA`
if you rename or swap the drive.

## Layout on /Volumes/FATRIOT

```
/Volumes/FATRIOT/
  Addresses/                 # 27 NAR source CSVs (~3.2 GB), staged from the repo
  postgres/data/             # Postgres 16 cluster (PGDATA)
  logs/postgres.log          # Postgres server log
```

## Data

- Source: Canadian National Address Register (NAR) export, 29 columns.
- Table `nar_addresses`, one row per address.
- Types: all text except `bg_x` / `bg_y` (numeric).
- Empty CSV fields import as NULL.

## Engine

- PostgreSQL 16.14 (Homebrew `postgresql@16`), port **55432**, socket `/tmp`.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/db-env.sh` | Shared env (`PG_MOUNT`, `PGDATA`, port). Sourced by the others. |
| `scripts/db-init.sh` | initdb + database + schema (`sql/schema.sql`). |
| `scripts/import-addresses.sh` | Bulk `\copy` the NAR CSVs, then rebuild indexes + ANALYZE. |
| `scripts/db-start.sh` / `scripts/db-stop.sh` | Start / stop the cluster (verifies the drive is mounted). |
| `scripts/db-optimize.sh` | Build the covering index + VACUUM ANALYZE for fast lookups. |
| `scripts/db-bench.sh [RUNS]` | Postgres query latency on a representative workload. |
| `scripts/disk-bench.sh` | Raw disk throughput vs the internal SSD. |

## Indexes

Postgres: PK on `addr_guid`; btree on `lower(csd_eng_name)`,
`(lower(csd_eng_name), mail_prov_abvn)`, `mail_postal_code`,
`lower(official_street_name)`; GIN trigram on `csd_eng_name`.

## Start / stop Postgres

Day-to-day, use the lifecycle scripts:

```bash
scripts/db-start.sh    # start (initializes the cluster on first run)
scripts/db-stop.sh     # stop
```

Or drive `pg_ctl` directly:

```bash
source scripts/db-env.sh
pg_ctl -D "$PGDATA" -l logs/postgres.log -o "-p $PGPORT -k /tmp" start
pg_ctl -D "$PGDATA" stop
psql -h 127.0.0.1 -p 55432 -d random_address_retriever   # connect
```

## Notes

- `nar_addresses` is `UNLOGGED` (see `sql/schema.sql`) — fast bulk loads, but the
  table is truncated on crash recovery; fine for this local, reload-from-CSV setup.
- The cluster is initialized with `--locale=C` (`scripts/db-init.sh`). Any
  single-user tuning applied via `ALTER SYSTEM` persists in `postgresql.auto.conf`
  inside `PGDATA`, so a plain `db-start.sh` keeps it across restarts.
