# Production Deployment Checklist

Reference checklist for serving the Random Address Retriever in production:
a local Postgres + Fastify API on owned hardware, exposed through Cloudflare
Tunnel, with the Vite frontend on Netlify.

This supersedes the Next.js assumptions in
[CLOUDFLARE_NETLIFY.md](CLOUDFLARE_NETLIFY.md) for the actual `apps/web` Vite SPA.

## Architecture

```text
Browser
  -> Netlify static site (apps/web/dist)
    -> Netlify Edge Function  (/api/*, /healthz)   [injects auth headers]
      -> Cloudflare edge (HTTPS, WAF, DDoS)         [optional: Access service token]
        -> cloudflared named tunnel (run as service)
          -> local Fastify API   127.0.0.1:8787     [bearer token + rate limit]
            -> local Postgres 16  127.0.0.1:55432    [data on FATRIOT APFS SSD]
```

Rules that do not change:
- Postgres and the API both bind to `127.0.0.1`. Only the HTTP API port is ever
  routed through the tunnel. **Never** add an ingress route for `55432`.
- No database backups: the dataset is the public NAR CSV import and is rebuilt
  with `scripts/import-addresses.sh`. Durability = a reproducible re-import, not
  backups (see Phase 6).

## Status (last verified 2026-06-23)

Live and verified end-to-end from the public hostname (on the daily-driver Mac):
- Tunnel `random-address-api` (`e5c369d7-b161-4db1-80a4-ee5e26b34049`) →
  `https://address-api.janac.me` → `http://*********:8787` → Postgres.
- `200` with token, `401` without; `/healthz` confirms the DB hop.
- Done: Phases 2, 3, 4 (configured), 7 (tunnel path). Phase 6 files created.
- Remaining: Phase 4 launchd service install, Phase 6 Netlify site + env vars,
  Phase 8 persistence/monitoring. Phase 5 (Access) intentionally skipped.

## Decisions

- [ ] **Host:** currently the daily-driver Mac (verification only). Move to a
      dedicated always-on machine before relying on it (Phase 1).
- [x] **API hostname:** `address-api.janac.me`.
- [x] **Cloudflare Access:** skipped — bearer token + Cloudflare WAF + API rate
      limiting are the active protections; can add later (Phase 5).

## Phase 1 — Dedicated host

- [ ] Provision the always-on machine (mini PC / NUC / spare Mac) on your LAN.
- [ ] Attach the **FATRIOT** APFS SSD (Postgres data dir lives at
      `/Volumes/FATRIOT/postgres/data`).
- [ ] Install Homebrew, `postgresql@16`, Node, `pnpm@9`, and `cloudflared`.
- [ ] Disable sleep: `sudo pmset -a sleep 0 disksleep 0` (and `caffeinate -s`
      as a fallback for interactive sessions).
- [ ] Put the machine on a UPS if available.

## Phase 2 — Postgres (local, private) ✅

- [ ] Confirm the SSD is mounted: `ls /Volumes/FATRIOT`.
- [ ] First-time only: `./scripts/db-init.sh` then `./scripts/import-addresses.sh`.
- [ ] One-time after import: `./scripts/db-optimize.sh` (covering index + VACUUM
      ANALYZE; keeps cold reads fast).
- [ ] Start Postgres: `./scripts/db-start.sh`.
- [ ] Verify it is bound to localhost only (`PGHOST=127.0.0.1`, port `55432`):
      `pg_isready -h 127.0.0.1 -p 55432`.
- [ ] Confirm the data row count looks right (~`17,169,294`).

## Phase 3 — Local API (Fastify) ✅

- [ ] `cp .env.example .env.local`.
- [ ] Generate a strong token: `openssl rand -base64 48`.
- [ ] In `.env.local` set:
  - [ ] `ADDRESS_API_TOKEN=<random token>`
  - [ ] `ADDRESS_API_HOST=127.0.0.1`
  - [ ] `ADDRESS_API_PORT=8787`
  - [ ] `ADDRESS_API_RATE_LIMIT_MAX` / `..._WINDOW_MS` tuned for expected traffic.
  - [ ] `ADDRESS_API_CORS_ORIGIN` can stay dev-only — production traffic is
        same-origin via the Netlify Edge Function, so CORS is not relied on.
- [ ] Start it in production mode: `ADDRESS_API_TOKEN` set + `NODE_ENV=production`
      (or run `./scripts/api-start.sh` with the token in `.env.local`).
- [ ] Smoke test locally:
  ```bash
  curl -H "Authorization: Bearer $ADDRESS_API_TOKEN" \
    "http://127.0.0.1:8787/api/random-address?city=Burlington&province=ON"
  ```

## Phase 4 — Cloudflare Tunnel ✅ (configured & verified; launchd service install still pending)

- [ ] `cloudflared tunnel login` (authorize the `janac.me` zone).
- [ ] `cloudflared tunnel create random-address-api`.
- [ ] `cp cloudflare/tunnel/config.example.yml cloudflare/tunnel/config.yml` and edit:
  - [ ] Set the real hostname and the credentials-file path printed by `create`.
  - [ ] Ingress routes **only** `http://127.0.0.1:8787`, then `http_status:404`:
    ```yaml
    tunnel: random-address-api
    credentials-file: /Users/<user>/.cloudflared/<tunnel-id>.json
    ingress:
      - hostname: address-api.janac.me
        service: http://127.0.0.1:8787
      - service: http_status:404
    ```
- [ ] Create DNS: `cloudflared tunnel route dns random-address-api address-api.janac.me`.
- [ ] Validate: `cloudflared tunnel ingress validate`.
- [ ] Test in foreground: `cloudflared tunnel --config cloudflare/tunnel/config.yml run`.
- [ ] Install as a launchd service so it survives reboot
      (`com.cloudflare.cloudflared`): `sudo cloudflared --config <abs-path>/config.yml service install`.
- [ ] Verify from anywhere (should require auth — a bare request is rejected):
  ```bash
  curl -H "Authorization: Bearer $ADDRESS_API_TOKEN" \
    "https://address-api.janac.me/api/random-address?city=Burlington&province=ON"
  ```

## Phase 5 — Cloudflare Access — SKIPPED (optional service-token layer)

Skip this phase to keep things simple. Include it for a second auth layer.

- [ ] Create a self-hosted Access application for `address-api.janac.me`.
- [ ] Create a **Service Token**; note the Client ID and Secret.
- [ ] Add an Access policy that allows only that service token (non-interactive).
- [ ] These values go into the Netlify Edge Function runtime env in Phase 6
      (`CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`). The Edge Function sends
      them as `CF-Access-Client-Id` / `CF-Access-Client-Secret`.

## Phase 6 — Netlify (Vite SPA + Edge Function proxy) — files ready; site + env vars pending

Goal: serve `apps/web/dist` statically and proxy `/api/*` and `/healthz`
server-side so the token never reaches the browser and there is no CORS.

- [x] `netlify.toml` at the repo root (already created — shown for reference):
  ```toml
  [build]
    command = "pnpm install --frozen-lockfile && pnpm --filter @random-address/web build"
    publish = "apps/web/dist"

  [[edge_functions]]
    path = "/api/*"
    function = "api-proxy"

  [[edge_functions]]
    path = "/healthz"
    function = "api-proxy"

  # SPA fallback for client-side routing (after the API routes above).
  [[redirects]]
    from = "/*"
    to = "/index.html"
    status = 200
  ```
- [x] `netlify/edge-functions/api-proxy.ts` (already created — shown for reference):
  ```ts
  import type { Context } from "@netlify/edge-functions";

  const need = (name: string): string => {
    const v = Netlify.env.get(name);
    if (!v) throw new Error(`${name} is required`);
    return v;
  };

  export default async (request: Request, _context: Context) => {
    const url = new URL(request.url);
    const upstream = new URL(need("ADDRESS_API_URL"));
    upstream.pathname = url.pathname; // /api/random-address, /healthz, ...
    upstream.search = url.search;

    // Build fresh headers; ignore anything the browser sent.
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${need("ADDRESS_API_TOKEN")}`);

    const cfId = Netlify.env.get("CF_ACCESS_CLIENT_ID");
    const cfSecret = Netlify.env.get("CF_ACCESS_CLIENT_SECRET");
    if (cfId && cfSecret) {
      headers.set("CF-Access-Client-Id", cfId);
      headers.set("CF-Access-Client-Secret", cfSecret);
    }

    const resp = await fetch(upstream, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    });

    return new Response(await resp.text(), {
      status: resp.status,
      headers: {
        "content-type": resp.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  };
  ```
- [ ] In Netlify site settings, set **runtime** environment variables:
  - [ ] `ADDRESS_API_URL=https://address-api.janac.me`
  - [ ] `ADDRESS_API_TOKEN=<same token as .env.local>`
  - [ ] (optional) `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` from Phase 5.
- [ ] Do **not** set `VITE_ADDRESS_API_TOKEN` to the real token. Leave it unset
      (defaults to `local-dev-token`); the Edge Function overrides auth in prod,
      so the real token is never bundled into client JS.
- [ ] Connect the repo and deploy. Confirm the build publishes `apps/web/dist`.
- [x] Frontend already wired: `apps/web/src/api.ts` calls `/api/*` and `/healthz`
      as relative paths and only attaches the bearer token in dev (the Edge
      Function injects it in prod), so no token ships in the client bundle.

## Phase 7 — End-to-end verification ✅ (tunnel path verified; Netlify checks pending)

- [ ] Local: `./scripts/healthcheck.sh` passes (Postgres + API).
- [ ] Tunnel: `https://address-api.janac.me/api/random-address?...` works with the
      token (and is rejected without it / without the Access token if Phase 5).
- [ ] Netlify: open the deployed site; the app fetches a random address.
- [ ] Browser DevTools → Network: confirm calls go to your Netlify origin
      (`/api/...`), **not** to `address-api.janac.me`, and that no token appears
      in the request headers or JS bundle.
- [ ] Confirm `55432` is NOT reachable through the tunnel (only `/api/*` +
      `/healthz` respond; everything else is 404).

## Phase 8 — Operations — NEXT UP (persistence, monitoring)

- [ ] **Autostart order** on the host (data is on an external SSD, so order
      matters): wait for `/Volumes/FATRIOT` to mount → Postgres → API → tunnel.
      `cloudflared` is a launchd service (Phase 4); add a launchd job/wrapper for
      Postgres + API that checks the mount first (reuse `scripts/db-start.sh`,
      which already verifies the mount).
- [ ] **Recovery (instead of backups):** keep the source NAR CSVs and the
      `scripts/` import pipeline in version control / safe storage. To rebuild:
      `db-init.sh` → `import-addresses.sh` → `db-optimize.sh`.
- [ ] **Updates:** `cloudflared` auto-updates as a service; to update API code,
      rebuild (`pnpm --filter random-address-api run build`) and restart the API
      service.
- [ ] **Monitoring:** add an external uptime check hitting the Netlify site or
      `https://address-api.janac.me/healthz` (with auth) so you learn about
      downtime.
- [ ] **Rate limiting:** confirm `ADDRESS_API_RATE_LIMIT_MAX` is set; optionally
      add a Cloudflare rate-limiting rule on the hostname.

## Quick reference

| Item | Value |
|---|---|
| Postgres | `127.0.0.1:55432`, db `random_address_retriever`, data on FATRIOT SSD |
| API | Fastify, `127.0.0.1:8787`, bearer `ADDRESS_API_TOKEN` |
| API routes | `/healthz`, `/api/provinces`, `/api/random-address` |
| Tunnel | named `random-address-api` → `http://127.0.0.1:8787` |
| Public hostname | `address-api.janac.me` (replace as chosen) |
| Frontend | Vite SPA, `apps/web/dist`, calls `/api/*` + `/healthz` relative |
| Netlify proxy | Edge Function `api-proxy` injects auth, forwards to tunnel |
| Backups | none — rebuild via `scripts/import-addresses.sh` |
