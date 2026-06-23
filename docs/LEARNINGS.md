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
- The working solution at the time was a single APFS sparseimage stored on the Samsung T5:

```text
.postgres/random-address-postgres.sparseimage
```

- The sparseimage mounted at:

```text
/Volumes/random-address-postgres
```

- **Update:** the project later moved to the external APFS SSD `FATRIOT`, which
  stores the Postgres cluster directly at `/Volumes/FATRIOT/postgres/data`. Since
  that drive is APFS (not ExFAT), the sparseimage workaround is no longer needed,
  and `scripts/db-env.sh` points `PGDATA` there.

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

## Read-Latency Findings (cold cache)

- A truly cold `Burlington, ON` random pick measured **~16.8 s**, not ~158 ms.
- Cause: `ORDER BY random() LIMIT 1` filtered by city did a **Bitmap Heap Scan**
  fetching every matching row (`~79,160` rows ≈ `62,732` heap blocks ≈ 490 MB of
  scattered random reads) just to choose one. On the external USB SSD, cold
  random reads are slow, so the heap fetch dominated.
- The table had **never been `VACUUM`ed**, so the visibility map was unset and
  index-only scans were impossible — every plan fell through to the heap.
- Fix, in two parts (`scripts/db-optimize.sh`):
  1. `VACUUM (ANALYZE)` to set the visibility map.
  2. A **covering index** `nar_addresses_random_pick_idx` on
     `(lower(csd_eng_name), mail_prov_abvn)` that `INCLUDE`s every returned
     column.
- Result: the pick becomes an **Index Only Scan** (`Heap Fetches: 0`) reading
  only the city's `~1,620` *contiguous* index pages. Warm dropped to **~20 ms**;
  cold drops from ~16.8 s to a few hundred ms at worst.
- The covering index is `~2.7 GB` for the full dataset. Acceptable: read latency
  is the only performance target, and write/build cost is out of scope.
- The API also replaced a per-request `psql` subprocess with a pooled `pg`
  client, removing process-spawn overhead from every request.

## Current Gaps

- The local API now runs and is paired with a live Cloudflare tunnel, installed as the `com.cloudflare.cloudflared` LaunchDaemon (see `docs/CLOUDFLARE_NETLIFY.md`).
- The API is now a typed Fastify service with unit + integration tests and CI.
- Random selection is currently row-based, not location-based.
- City matching is exact against `csd_eng_name`.
- No geospatial queries are implemented yet.

## Hosting Decision

- The selected live path is MacBook-hosted Postgres plus a local HTTP API exposed through Cloudflare Tunnel.
- The DS220j should be used for backups and source-data storage, not as the live database host.
- Netlify should call the Cloudflare-protected API from a server-side Next.js route so Cloudflare Access credentials and API tokens never reach browser code.

## Cloudflare Tunnel Learnings

- `cloudflared` runs as a system LaunchDaemon
  (`/Library/LaunchDaemons/com.cloudflare.cloudflared.plist`, `root`,
  `RunAtLoad` + `KeepAlive`), so the tunnel starts on boot and self-restarts.
- **macOS TCC blocks background daemons from `~/Documents`.** The daemon
  originally pointed `--config` at the repo copy under
  `~/Documents/.../cloudflare/tunnel/config.yml` and failed every start with
  `open ...: operation not permitted` — even as `root` — crash-looping every
  ~5s. Publicly this showed up as Cloudflare `error code: 1033` (no connected
  origin) and a failing `/healthz`.
- Fix: install the live config outside the protected folder at
  `/usr/local/etc/cloudflared/config.yml` and point the plist there. The
  `credentials-file` under `~/.cloudflared/` was already fine — that path is not
  TCC-protected. After the move, all four edge connections registered and
  `/healthz` returned `200`.
- Unrelated host gotcha hit during setup: `sudo` warned
  `/var/db/sudo/ts is world writable` (which also forces a password prompt on
  every command). Fixed with `chown root:wheel` + `chmod 0700` on
  `/var/db/sudo/ts`.
