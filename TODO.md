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
- [ ] Run the live backend from the MacBook:
  - local Postgres on `127.0.0.1:55432`
  - small local HTTP API, not direct Postgres exposure
  - Cloudflare Tunnel in front of the API
  - Netlify Next.js server route calls the tunneled API with private credentials
- [ ] Revisit a dedicated always-on host if this needs production-like reliability:
  - Mac mini
  - small Linux mini PC
  - newer Synology `+` model
  - managed Postgres provider

## Backend API

- [x] Build a narrow local HTTP API for random address lookup.
- [x] Require an API token for every request.
- [x] Validate city and province inputs.
- [x] Use fixed SQL and safely quoted caller values.
- [x] Do not expose arbitrary SQL or direct database credentials.
- [x] Add Cloudflare Tunnel config template.
- [x] Add Netlify/Next proxy route example.
- [ ] Add basic rate limiting.

## Database Operations

- [ ] Add a backup script using `pg_dump`.
- [ ] Add a restore script or documented restore command.
- [ ] Add a health-check script for Postgres and the local API.
- [ ] Document how to restart the tunnel and API after reboot.

## Product Questions

- [ ] Decide whether random selection should be address-row based, location based, or building based.
- [ ] Decide whether city matching should use `csd_eng_name`, `mail_mun_name`, or both.
- [ ] Decide whether the public API should return source GUIDs by default or only in an admin/debug mode.
