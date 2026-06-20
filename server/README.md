# Random Address API

A small, strongly-typed HTTP API that returns a random Canadian address from
the local NAR Postgres database. It is the only process that talks to Postgres;
the web frontend in [`apps/web`](../apps/web) and the edge path (Cloudflare
Tunnel, Cloudflare Access, the Netlify route) sit in front of it. See
[docs/CLOUDFLARE_NETLIFY.md](../docs/CLOUDFLARE_NETLIFY.md) for the full edge
architecture.

## Stack

- **[Fastify 5](https://fastify.dev)** — fast HTTP server with first-class
  schema validation.
- **[TypeBox type provider](https://github.com/fastify/fastify-type-provider-typebox)**
  — one schema yields both runtime validation and static types.
- **[node-postgres (`pg`)](https://node-postgres.com)** — pooled connections
  (the old server spawned a `psql` subprocess per request).
- **[Vitest](https://vitest.dev)** for tests, **tsup** for the build, **tsc**
  for typechecking.

## Endpoints

All requests require the API token via `Authorization: Bearer <token>` or
`X-Api-Token: <token>`. Responses use a `{ data, meta }` / `{ error }` envelope
(the shape [`apps/web`](../apps/web) consumes).

| Method & path | Description |
|---|---|
| `GET /healthz` | `{ data: { ok, database, durationMs } }`. |
| `GET /api/provinces` | `{ data: [{ code, name }, …] }`. |
| `GET /api/random-address?city=&province=&verbose=` | Random address. `city` defaults to `Burlington`; `province` is an optional Canadian code; `verbose=true` nests `source: { locGuid, addrGuid }`. |

```bash
curl -H "Authorization: Bearer local-dev-token" \
  "http://127.0.0.1:8787/api/random-address?city=Burlington&province=ON"
# {"data":{"address":"586 Phoebe CRES","city":"Burlington","province":"ON","postalCode":"L7L6H7"},
#  "meta":{"city":"Burlington","province":"ON","verbose":false,"durationMs":20}}
```

Responses: `200` `{ data, meta }`; errors are `{ error: { code, message } }` —
`400` invalid input (with `details`), `401` missing/bad token, `404` no match,
`429` rate limited, `500` internal error (never leaks details). CORS reflects
allow-listed origins and answers preflight `OPTIONS`.

## Configuration

Loaded and validated at startup (`src/config.ts`); the process exits if any
value is invalid.

| Variable | Default | Notes |
|---|---|---|
| `ADDRESS_API_TOKEN` | `local-dev-token` | Bearer token for every request. **Required when `NODE_ENV=production`.** |
| `ADDRESS_API_HOST` | `127.0.0.1` | Bind address. Keep on localhost. |
| `ADDRESS_API_PORT` | `8787` | |
| `ADDRESS_API_LOG` | `true` | Set `false` to silence request logs. |
| `ADDRESS_API_CORS_ORIGIN` | `http://127.0.0.1:5173,http://localhost:5173` | Comma-separated allow-list (`*` allows all). |
| `ADDRESS_API_RATE_LIMIT_WINDOW_MS` | `60000` | Fixed window per client. |
| `ADDRESS_API_RATE_LIMIT_MAX` | `120` | Max requests per window. |
| `PGHOST` / `PGPORT` | `127.0.0.1` / `55432` | |
| `PGDATABASE` | `random_address_retriever` | |
| `PGUSER` / `PGPASSWORD` | current user / — | |
| `PG_POOL_MAX` | `10` | Max pooled connections. |
| `PG_STATEMENT_TIMEOUT_MS` | `30000` | `0` disables. |

## Develop

```bash
npm install
npm run dev        # tsx watch, hot reload
npm run typecheck  # tsc --noEmit
npm test           # unit tests (no database needed)
npm run build      # bundle to dist/ with tsup
npm start          # node dist/index.js
```

From the repo root, `./scripts/api-start.sh` mounts/starts Postgres, installs
and builds the API if needed, and runs it.

## Tests

- **Unit** (`test/*.test.ts`) — config parsing, constant-time auth, and the
  HTTP layer via `app.inject()` with an injected fake database. No network, no
  Postgres.
- **Integration** (`test/integration/live-db.test.ts`) — runs only when
  `RUN_DB_TESTS=1`, exercising `createPgDatabase` against a real Postgres.

```bash
# Against the local NAR database:
RUN_DB_TESTS=1 ADDRESS_API_TOKEN=x npm test
```

CI seeds a tiny `nar_addresses` into a `postgres:16` service and runs both
suites — see [.github/workflows/ci.yml](../.github/workflows/ci.yml).

## Performance

A random pick uses an **index-only scan** over `nar_addresses_random_pick_idx`,
a covering index whose `INCLUDE` columns cover every returned field. With the
visibility map set (`scripts/db-optimize.sh`), Postgres satisfies the lookup
from the city's contiguous index pages (`Heap Fetches: 0`) instead of reading
every matching heap row — ~20 ms warm, and the cold first request drops from
~16.8 s to a few hundred ms. See [docs/LEARNINGS.md](../docs/LEARNINGS.md).

Run `scripts/db-optimize.sh` once after a bulk import to build the index and
populate the visibility map.

## Security notes

- Postgres and the API both bind to `127.0.0.1`; the API is reached only
  through Cloudflare Tunnel + Access.
- Token comparison is constant-time (`src/auth.ts`).
- Queries are parameterized; province is matched exactly so the comparison
  stays index-friendly and injection-safe.
