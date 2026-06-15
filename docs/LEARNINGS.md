# Findings And Learnings

## Repository State

- The folder was not originally a Git repository.
- Git is now initialized.
- The repo is primarily a local data and database workspace, not yet an application.
- Large data artifacts are intentionally ignored:
  - `Addresses/`
  - `ca/`
  - `Random Address Generator/`
  - `.postgres/`

## Dataset Findings

- `Addresses/` contains `27` CSV files.
- The raw CSV files total about `3.1 GB`.
- The imported table contains `17,169,294` address rows.
- The `ca/` GeoJSON tree contains `610` GeoJSON files and `610` metadata files, totaling about `12 GB`.
- `Random Address Generator/canada-nar-combined.csv.gz` exists and is about `1.3 GB` compressed / `3.65 GB` uncompressed.

## Storage Findings

- The Samsung T5 is mounted as ExFAT.
- Direct Postgres initialization on the ExFAT volume failed.
- Failure mode: macOS created AppleDouble `._*` files inside the Postgres data directory, and Postgres rejected the unexpected files during initialization.
- A sparsebundle also worked poorly for this workload because it creates many band files on the ExFAT host filesystem.
- The working solution is a single APFS sparseimage stored on the Samsung T5:

```text
.postgres/random-address-postgres.sparseimage
```

- The sparseimage mounts at:

```text
/Volumes/random-address-postgres
```

## Postgres Findings

- Native Homebrew Postgres 16 is installed and works.
- Docker is available but was not needed.
- The local database uses port `55432` to avoid colliding with an existing Postgres service on `5432`.
- Connection:

```text
postgresql://janac@127.0.0.1:55432/random_address_retriever
```

## Import Learnings

- Maintaining indexes during the 17M-row import was too slow.
- The successful import flow is:
  1. Ensure Postgres is initialized and running.
  2. Drop secondary indexes.
  3. Drop the primary key constraint.
  4. Mark the table `UNLOGGED`.
  5. `COPY` each CSV chunk.
  6. Recreate the primary key.
  7. Recreate search indexes.
  8. Run `ANALYZE`.

- Rebuilding indexes after the bulk load is much faster than maintaining them row by row during `COPY`.
- `UNLOGGED` is acceptable for this local database because the source CSV files are retained and the table can be rebuilt.

## Query Findings

- Burlington appears in more than one province:
  - `Burlington, ON`: `79,160`
  - `Burlington, NL`: `101`

- City-only lookup is useful, but province should be supported to avoid ambiguity:

```bash
./scripts/random-address.sh Burlington ON
```

- A verified sample result:

```text
586 Phoebe CRES | Burlington | ON | L7L6H7
```

- The city index is used for exact city lookups.
- A Burlington random lookup was observed around `158 ms` on a cold-ish cache.

## Current Gaps

- There is no web app or API yet.
- There are no automated tests yet.
- Random selection is currently row-based, not location-based.
- City matching is exact against `csd_eng_name`.
- No geospatial queries are implemented yet.
