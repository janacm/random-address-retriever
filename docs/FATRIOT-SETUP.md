# Postgres setup on the external SSD (FATRIOT)

Postgres is hosted directly on the external APFS volume (`/Volumes/FATRIOT` by
default) and loaded from the staged NAR source CSVs. Point `DB_VOLUME` at a
different mount if you rename or swap the drive.

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
| `scripts/pg-env.sh` | Shared env (`DB_VOLUME`, paths, port, `LC_ALL=C`). Sourced by the others. |
| `scripts/pg-setup.sh` | initdb → start → schema → bulk `\copy` → indexes → ANALYZE. |
| `scripts/pg.sh {start\|stop\|restart\|status}` | Day-to-day cluster control. |
| `scripts/pg-bench.sh [RUNS]` | Postgres query latency on a representative workload. |
| `scripts/disk-bench.sh` | Raw disk throughput vs the internal SSD. |

## Indexes

Postgres: PK on `addr_guid`; btree on `lower(csd_eng_name)`,
`(lower(csd_eng_name), mail_prov_abvn)`, `mail_postal_code`,
`lower(official_street_name)`; GIN trigram on `csd_eng_name`.

## Start / stop Postgres

Day-to-day, use the control script (`stop` | `restart` | `status` too):

```bash
scripts/pg.sh start
```

Or drive `pg_ctl` directly:

```bash
source scripts/pg-env.sh
pg_ctl -D "$PGDATA" -l "$PG_LOGDIR/postgres.log" -o "-p $PGPORT -k /tmp" start
pg_ctl -D "$PGDATA" stop
psql -h 127.0.0.1 -p 55432 -d random_address_retriever   # connect
```

## Notes

- The cluster is `UNLOGGED` + tuned for a single-user benchmark box
  (`shared_buffers=2GB`, `work_mem=256MB`, `maintenance_work_mem=1GB`,
  `max_wal_size=8GB`), not a production config. These are persisted via
  `ALTER SYSTEM` (in `postgresql.auto.conf`), so the bare `pg_ctl ... start`
  above keeps them. **Do not** rely on passing them as one-off `-c` runtime
  flags — restarting without them silently reverts to defaults
  (`shared_buffers=128MB`, `work_mem=4MB`), which detunes every scan (e.g.
  `work_mem=4MB` makes the `city_fuzzy` bitmap go lossy: ~64 s vs ~0.23 s).
- `LC_ALL=C` is required on this macOS build or Postgres 16 dies at startup with
  "postmaster became multithreaded during startup".
