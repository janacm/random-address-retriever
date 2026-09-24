# TODO

## Hosting

- [x] Use the MacBook plus Cloudflare Tunnel path instead of NAS hosting.
- [x] Keep the DS220j as support storage, not the primary live database host:
  - nightly `pg_dump` backups
  - raw NAR source file backup
  - exported artifacts and logs
- [x] Avoid hosting live Postgres on the DS220j:
  - DS220j is memory constrained for this dataset
  - Postgres should not use an SMB/NFS-mounted data directory
  - Synology internal DSM PostgreSQL should not be used for app data
- [x] ~~Run the live backend from the MacBook behind a Cloudflare Tunnel.~~
  Retired 2026-09-24; the site was down whenever the Mac was off.
- [x] Move the live backend to managed hosting (2026-09-24, see
  [docs/DEPLOY.md](docs/DEPLOY.md)):
  - 3M-row sample on Neon Postgres
  - the same Fastify API as a Neon Function next to it
  - Netlify Edge Function proxy injects the bearer token
- [ ] Delete the `random-address-api` Cloudflare Tunnel and its
  `address-api.janac.me` DNS record once the Neon path has run for a while.

## Backend API

- [x] Build a narrow local HTTP API for random address lookup.
- [x] Require an API token for every request.
- [x] Validate city and province inputs.
- [x] Use parameterized SQL only.
- [x] Do not expose arbitrary SQL or direct database credentials.
- [x] Add Cloudflare Tunnel config template.
- [x] Add Netlify/Next proxy route example.
- [x] Add basic rate limiting.

## Frontend

- [x] Build a local browser interface for city/province random address lookup.
- [x] Keep source GUIDs hidden unless the source identifiers toggle is enabled.
- [ ] Add end-to-end browser coverage once the API and database are stable.

## Backend Quality

- [x] Rewrite the API in TypeScript (Fastify + pooled `pg`) with strong typing.
- [x] Add unit tests (config, auth, HTTP layer via `app.inject`).
- [x] Add integration tests against a real Postgres (gated by `RUN_DB_TESTS`).
- [x] Add GitHub Actions CI (typecheck, build, unit + integration tests).
- [x] Optimize cold read latency (covering index + VACUUM; `db-optimize.sh`).
- [x] Consolidate to a single API in `server/` (Fastify TS); `apps/web` calls it.

## Database Operations

- [ ] Add a backup script using `pg_dump`.
- [ ] Add a restore script or documented restore command.
- [x] Add a health-check script for Postgres and the local API.
- [x] ~~Document how to restart the tunnel and API after reboot.~~ No longer
  needed: nothing in production runs on a local machine.

## Product Questions

- [ ] Decide whether random selection should be address-row based, location based, or building based.
- [ ] Decide whether city matching should use `csd_eng_name`, `mail_mun_name`, or both.
- [ ] Decide whether the public API should return source GUIDs by default or only in an admin/debug mode.
