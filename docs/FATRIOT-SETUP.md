# FATRIOT benchmark setup — Postgres vs DuckDB

Both databases are hosted directly on the external APFS volume `/Volumes/FATRIOT`
and loaded from the same source CSVs, so a DuckDB-vs-Postgres comparison runs
against the same physical disk and the same data.

## Layout on /Volumes/FATRIOT

```
/Volumes/FATRIOT/
  Addresses/                 # 27 NAR source CSVs (~3.2 GB), staged from the repo
  postgres/data/             # Postgres 16 cluster (PGDATA)
  duckdb/addresses.duckdb    # DuckDB database file
  logs/postgres.log          # Postgres server log
```

## Data

- Source: Canadian National Address Register (NAR) export, 29 columns.
- Table `nar_addresses`, identical column order in both engines.
- Types: all text except `bg_x` / `bg_y` (numeric in Postgres, DOUBLE in DuckDB).
- Empty CSV fields import as NULL in both engines (consistent).

## Engines

- PostgreSQL 16.14 (Homebrew `postgresql@16`), port **55432**, socket `/tmp`.
- DuckDB 1.5.4 (Homebrew `duckdb`).

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/fatriot-env.sh` | Shared env (paths, port, `LC_ALL=C`). Sourced by the others. |
| `scripts/fatriot-pg-setup.sh` | initdb → start → schema → bulk `\copy` → indexes → ANALYZE. |
| `scripts/fatriot-duckdb-setup.sh` | (Re)build the DuckDB file: schema → `COPY` glob → indexes → ANALYZE. |
| `scripts/fatriot-verify.sh` | Parity check — same aggregates from both engines. |
| `scripts/fatriot-bench.sh [RUNS]` | Head-to-head latency on a representative workload. |

## Indexes

Postgres: PK on `addr_guid`; btree on `lower(csd_eng_name)`,
`(lower(csd_eng_name), mail_prov_abvn)`, `mail_postal_code`,
`lower(official_street_name)`; GIN trigram on `csd_eng_name`.

DuckDB: ART indexes on `csd_eng_name`, `mail_postal_code`,
`official_street_name`. DuckDB has no trigram/GIN equivalent — its fuzzy city
search relies on columnar scans + zonemaps, a known asymmetry to keep in mind
when reading the fuzzy-search benchmark numbers.

## Start / stop Postgres

```bash
source scripts/fatriot-env.sh
pg_ctl -D "$PGDATA" -l "$PG_LOGDIR/postgres.log" -o "-p $PGPORT -k /tmp" start
pg_ctl -D "$PGDATA" stop
psql -h 127.0.0.1 -p 55432 -d random_address_retriever   # connect
```

DuckDB is file-based — no server to run:

```bash
/opt/homebrew/bin/duckdb /Volumes/FATRIOT/duckdb/addresses.duckdb
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
