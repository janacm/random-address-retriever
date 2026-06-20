# Random Address API

A small, strongly-typed HTTP API that returns a random Canadian address from
the local NAR Postgres database. It is the only process that talks to Postgres;
everything else (Cloudflare Tunnel, Cloudflare Access, the Netlify route) sits
in front of it. See [docs/CLOUDFLARE_NETLIFY.md](../docs/CLOUDFLARE_NETLIFY.md)
for the full edge architecture.

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
`X-Api-Token: <token>`.

| Method & path | Description |
|---|---|
| `GET /healthz` | Liveness + connected database name. |
| `GET /random-address?city=&province=&verbose=` | Random address. `city` defaults to `Burlington`; `province` is an optional 2-letter code; `verbose=true` adds `loc_guid`/`addr_guid`. |

```bash
curl -H "Authorization: Bearer $ADDRESS_API_TOKEN" \
  "http://127.0.0.1:8787/random-address?city=Burlington&province=ON"
# {"address":"586 Phoebe CRES","city":"Burlington","province":"ON","postal_code":"L7L6H7"}
```

Responses: `200` with the address, `400` invalid input, `401` missing/bad
token, `404` no match, `500` internal error (never leaks details).

## Configuration

Loaded and validated at startup (`src/config.ts`); the process exits if
`ADDRESS_API_TOKEN` is missing or any value is invalid.

| Variable | Default | Notes |
|---|---|---|
| `ADDRESS_API_TOKEN` | — | **Required.** Bearer token for every request. |
| `ADDRESS_API_HOST` | `127.0.0.1` | Bind address. Keep on localhost. |
| `ADDRESS_API_PORT` | `8787` | |
| `ADDRESS_API_LOG` | `true` | Set `false` to silence request logs. |
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
