import { attachDatabasePool } from "@neon/functions";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createPgDatabase, createPgPool } from "./db";
import { toFetchHandler } from "./fetch-adapter";

/**
 * Neon Function entry point (declared in the repo-root `neon.ts`). Neon injects
 * `DATABASE_URL` for the branch; `ADDRESS_API_TOKEN` is set on the deployment.
 *
 * The invocation URL is public, so production mode is forced here: a missing
 * token fails the isolate at startup instead of falling back to the well-known
 * dev token.
 */
const config = loadConfig({
  ...process.env,
  NODE_ENV: "production",
  // One pool per isolate, and the platform runs several isolates under load.
  PG_POOL_MAX: process.env.PG_POOL_MAX ?? "5",
});
if (!config.pg.connectionString) {
  throw new Error("DATABASE_URL is required (Neon injects it on a branch with Postgres)");
}

const pool = createPgPool(config);
// Without an `error` listener, Neon's pooler closing an idle client raises an
// uncaughtException and takes the isolate down.
attachDatabasePool(pool);

const app = buildApp({ db: createPgDatabase(config, pool), config });

export default { fetch: toFetchHandler(app) };
