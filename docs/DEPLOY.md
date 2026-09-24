# Deployment

Everything the public site needs runs on hosted services. No local machine is
in the request path.

```text
Browser
  -> Netlify static site (apps/web/dist)
    -> Netlify Edge Function api-proxy (/api/*)     [injects bearer token, sets x-forwarded-for]
      -> Neon Function addressapi (aws-us-east-2)   [bearer token check, rate limit]
        -> Neon Postgres, branch production         [3M-row sample, see HOSTED-SAMPLE.md]
```

Until 2026-09-24 the API ran on a MacBook behind a Cloudflare Tunnel
([CLOUDFLARE_NETLIFY.md](CLOUDFLARE_NETLIFY.md), now retired). When that Mac
was off, every API call from the site failed with Cloudflare error 1033.

## The API as a Neon Function

`neon.ts` declares one function, slug `addressapi`, with its entry at
`server/src/function.ts`. That entry builds the same Fastify app `pnpm dev`
runs and hands each request to it through `server/src/fetch-adapter.ts`, which
calls `app.inject()` (the approach `@fastify/aws-lambda` uses for Lambda). The
hooks, validation, and error envelopes are the same code in both places.

What differs on the Function:

- Neon injects `DATABASE_URL` (pooled) for the branch. `config.ts` prefers it
  over the `PG*` variables.
- The pool is capped at 5 connections (`PG_POOL_MAX` overrides it). Each
  isolate keeps its own pool and Neon starts more isolates under load, so the
  connection count is 5 times the number of live isolates.
- Production mode is forced, so a missing `ADDRESS_API_TOKEN` fails the isolate
  at startup instead of falling back to `local-dev-token`.
- The platform answers an exact `/healthz` itself with a plain-text `ok`, and
  the request never reaches the app. The app's DB-backed check is therefore
  also served at `/api/healthz`, and the web app calls that path.

Invocation URL (also the value of Netlify's `ADDRESS_API_URL`):

```text
https://br-green-lab-b5ebnz4t-addressapi.compute.c-7.us-east-2.aws.neon.tech/
```

`neon functions get addressapi` prints it. The URL is public, so the bearer
token is the only gate in front of the database.

## Deploy the API

From the repo root (the repo is linked to the Neon project, see
[HOSTED-SAMPLE.md](HOSTED-SAMPLE.md#neon-project)):

```bash
neon config plan
```

```bash
neon deploy --no-env-pull
```

`neon deploy` bundles `server/src/function.ts` with esbuild and uploads it.
`--no-env-pull` stops it from rewriting `.env.local`. Check a deploy with the
token:

```bash
curl -H "Authorization: Bearer $(security find-generic-password -s random-address-api-token -w)" \
  https://br-green-lab-b5ebnz4t-addressapi.compute.c-7.us-east-2.aws.neon.tech/api/healthz
```

## The API token

`ADDRESS_API_TOKEN` is set in two places, and they must match:

- on the Function deployment, and
- on the Netlify site, in the `production`, `deploy-preview`, and
  `branch-deploy` contexts (a secret variable).

It is not declared in `neon.ts`, so evaluating that file never needs the
secret. Neon keeps Function variables across deploys unless a deploy names
them; on 2026-09-24, deployments 2 and 3 came from a plain `neon deploy` and
both still accepted the token. The value was generated into the login Keychain
of the Mac that set this up, under the service name `random-address-api-token`.
Netlify returns only a masked placeholder for secret variables, so the Keychain
entry is the only readable copy.

To rotate, set the Function first, then Netlify, then redeploy the site. The
site returns 401s between the Function update and the Netlify redeploy.

```bash
security add-generic-password -U -a "$USER" -s random-address-api-token -w "$(openssl rand -hex 32)"
```

```bash
neon functions deploy addressapi --src server/src/function.ts \
  --env "ADDRESS_API_TOKEN=$(security find-generic-password -s random-address-api-token -w)"
```

Then update `ADDRESS_API_TOKEN` in the Netlify UI (Site configuration >
Environment variables) for all three contexts and trigger a deploy. Netlify
only applies changed variables to a new deploy.

## Rate limiting

The API's limiter (`server/src/hooks.ts`) keys on the first `x-forwarded-for`
hop and keeps its counters in memory, so each isolate counts separately. The
edge proxy builds a fresh header set and sets `x-forwarded-for` to Netlify's
`context.ip`, so the key is the visitor's IP. Neon passes that first hop
through: on 2026-09-24, 125 unauthenticated requests carrying one spoofed
`x-forwarded-for` got 120 `401`s then `429`s, while a request with a different
value still got `401`. A caller that skips the proxy can pick its own key the
same way, but it has no token, and the auth hook rejects it before any query.

Neon also caps an account at 100 concurrent Function invocations by default,
answering `429` with the body `per-account concurrency limit reached`.

## Logs

```bash
neon logs query --branch production --source function --since 1h
```

## Limits and cost

Neon Free includes, per month, 10 active and 400 waiting Function
capacity-hours and 1M invocations (checked 2026-09-24,
<https://neon.com/docs/introduction/plans#functions>). Each Function request
also wakes the Postgres compute, which suspends after 5 minutes idle and
counts against the 100 CU-hours of Postgres compute on Free, so the first
request after a quiet period is slower.

## Local development

Unchanged: `pnpm dev` runs the Fastify server and the web app against the local
Postgres (see the README). To run the Function entry locally against the
`production` branch's database, as the deployed runtime sees it:

```bash
ADDRESS_API_TOKEN=local-test neon dev --source server/src/function.ts --port 8799
```

## Rolling back to the tunnel

Set Netlify's `ADDRESS_API_URL` back to `https://address-api.janac.me`, set
`ADDRESS_API_TOKEN` to the local API's token, and redeploy the site. That only
works while the Mac, its API, and `cloudflared` are running.
