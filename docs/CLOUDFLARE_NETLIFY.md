# Cloudflare Tunnel And Netlify

## Architecture

Expose only the local HTTP API, not Postgres:

```text
Browser
  -> Netlify Next.js route
    -> Cloudflare Access-protected hostname
      -> Cloudflare Tunnel on the MacBook
        -> local API on 127.0.0.1:8787
          -> local Postgres on 127.0.0.1:55432
```

Postgres stays bound to localhost. The Cloudflare tunnel creates outbound-only
connections from the MacBook, so router port forwarding is not needed.

## Local API

Create a local env file:

```bash
cp .env.example .env.local
```

Set a long random token:

```bash
openssl rand -base64 48
```

Then update `.env.local`:

```text
ADDRESS_API_TOKEN=<the random token>
ADDRESS_API_HOST=127.0.0.1
ADDRESS_API_PORT=8787
```

Build the covering index once (after a bulk import) so cold reads stay fast,
then start the local API (builds and runs the Fastify service in `server/`):

```bash
./scripts/db-optimize.sh
./scripts/api-start.sh
```

Verify locally:

```bash
curl \
  -H "Authorization: Bearer $ADDRESS_API_TOKEN" \
  "http://127.0.0.1:8787/random-address?city=Burlington&province=ON"
```

Verbose output includes source identifiers:

```bash
curl \
  -H "Authorization: Bearer $ADDRESS_API_TOKEN" \
  "http://127.0.0.1:8787/random-address?city=Burlington&province=ON&verbose=true"
```

## Cloudflare Tunnel

Install `cloudflared`:

```bash
brew install cloudflare/cloudflare/cloudflared
```

Authenticate and create a named tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create random-address-api
```

Copy the example config:

```bash
cp cloudflare/tunnel/config.example.yml cloudflare/tunnel/config.yml
```

Edit `cloudflare/tunnel/config.yml`:

- Replace `address-api.example.com` with the real API hostname.
- Replace `<tunnel-id>` with the tunnel credentials file created by `cloudflared`.

Create the DNS route:

```bash
cloudflared tunnel route dns random-address-api address-api.example.com
```

Run the tunnel:

```bash
cloudflared tunnel --config cloudflare/tunnel/config.yml run
```

## Run As A Background Service (launchd)

For an always-on tunnel, run `cloudflared` as a system LaunchDaemon instead of a
foreground process. The daemon is defined at:

```text
/Library/LaunchDaemons/com.cloudflare.cloudflared.plist
```

It runs as `root` with `RunAtLoad` and `KeepAlive`, so it starts on boot and
restarts if it exits.

**Critical: the config file must NOT live inside `~/Documents` (or `~/Desktop` /
`~/Downloads`).** macOS TCC privacy protection blocks background daemons from
reading those folders, even as `root`. A daemon pointed at a config under
`~/Documents` fails every start with:

```text
open .../cloudflare/tunnel/config.yml: operation not permitted
```

and crash-loops (every ~5s with the default `ThrottleInterval`), which surfaces
publicly as Cloudflare `error code: 1033` — the edge has no connected origin.

Keep the repo copy as `cloudflare/tunnel/config.example.yml`, but install the
live config the daemon reads to a non-protected location:

```bash
sudo mkdir -p /usr/local/etc/cloudflared
sudo cp cloudflare/tunnel/config.yml /usr/local/etc/cloudflared/config.yml
```

The daemon's `--config` argument must point at that path:

```text
/usr/local/etc/cloudflared/config.yml
```

The `credentials-file` (`~/.cloudflared/<tunnel-id>.json`) can stay in the home
directory — `~/.cloudflared` is not TCC-protected.

Load or reload the daemon after any config or plist change:

```bash
sudo launchctl bootout system /Library/LaunchDaemons/com.cloudflare.cloudflared.plist 2>/dev/null
sudo launchctl bootstrap system /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
```

Note: if you edit routing/ingress, update the `/usr/local/etc/cloudflared/` copy
(or re-copy from the repo) and reload — editing only the repo file has no effect.

## Verify The Tunnel

Confirm four edge connections registered:

```bash
tail -n 20 /Library/Logs/com.cloudflare.cloudflared.err.log   # expect "Registered tunnel connection" x4
```

Confirm the public health endpoint returns `200` end-to-end:

```bash
set -a; . ./.env.local; set +a
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ADDRESS_API_TOKEN" \
  https://address-api.janac.me/healthz
```

A healthy response body looks like:

```json
{"data":{"ok":true,"database":"random_address_retriever","durationMs":0}}
```

## Troubleshooting

- **`error code: 1033`** — the Cloudflare edge has no connected origin. Check the
  daemon log for `operation not permitted` (TCC: move the config out of
  `~/Documents`) or another crash loop, then reload the daemon.
- **`sudo: /var/db/sudo/ts is world writable`** — the sudo timestamp directory
  has unsafe permissions (it also forces a password prompt on every command).
  Fix:

```bash
sudo chown -R root:wheel /var/db/sudo/ts
sudo chmod 0700 /var/db/sudo/ts
```

## Cloudflare Access

Protect the tunnel hostname with Cloudflare Access:

1. Create a self-hosted Access application for the API hostname.
2. Create a Service Token.
3. Add an Access policy that allows only that Service Token.
4. Store the token values in Netlify as server-side environment variables:

```text
CF_ACCESS_CLIENT_ID=<service-token-client-id>
CF_ACCESS_CLIENT_SECRET=<service-token-client-secret>
```

Cloudflare Access expects these request headers:

```text
CF-Access-Client-Id: <service-token-client-id>
CF-Access-Client-Secret: <service-token-client-secret>
```

## Netlify Next.js Proxy

Do not call the Cloudflare tunnel hostname from browser code. Call it from a
server-side Next.js route/function so secrets stay on Netlify.

Set Netlify environment variables:

```text
ADDRESS_API_URL=https://address-api.example.com
ADDRESS_API_TOKEN=<same local API token from .env.local>
CF_ACCESS_CLIENT_ID=<service-token-client-id>
CF_ACCESS_CLIENT_SECRET=<service-token-client-secret>
```

Use the example route:

```text
examples/netlify-next-route/app/api/random-address/route.ts
```

In the app, the browser calls:

```text
/api/random-address?city=Burlington&province=ON
```

The Netlify route calls:

```text
https://address-api.example.com/random-address?city=Burlington&province=ON
```

with both Cloudflare Access service-token headers and the local API bearer token.

## Security Rules

- Do not expose Postgres directly.
- Keep Postgres bound to `127.0.0.1`.
- Keep the local API bound to `127.0.0.1`.
- Require `ADDRESS_API_TOKEN` on the local API.
- Require Cloudflare Access Service Auth on the tunnel hostname.
- Keep all secrets out of `NEXT_PUBLIC_*` variables.
- Validate API inputs and use fixed SQL with safely quoted caller values.
- Add rate limiting before sending meaningful traffic through the endpoint.
