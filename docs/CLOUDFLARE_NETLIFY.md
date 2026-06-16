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

Start the local API:

```bash
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
