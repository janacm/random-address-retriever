import os from "node:os";

/**
 * Fully-resolved runtime configuration. Built once at startup from the
 * environment so the rest of the app depends on a typed object, never on
 * `process.env` directly (which keeps it testable).
 */
export interface Config {
  host: string;
  port: number;
  apiToken: string;
  logger: boolean;
  pg: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string | undefined;
    max: number;
    statementTimeoutMs: number;
  };
}

function parseIntInRange(
  value: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/**
 * Load and validate configuration. Throws if a required value is missing or
 * any provided value is invalid, so misconfiguration fails fast at boot.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiToken = env.ADDRESS_API_TOKEN;
  if (!apiToken || apiToken.trim() === "") {
    throw new Error("ADDRESS_API_TOKEN is required.");
  }

  return {
    host: env.ADDRESS_API_HOST?.trim() || "127.0.0.1",
    port: parseIntInRange(env.ADDRESS_API_PORT, 8787, "ADDRESS_API_PORT", 1, 65535),
    apiToken,
    logger: parseBool(env.ADDRESS_API_LOG, true),
    pg: {
      host: env.PGHOST?.trim() || "127.0.0.1",
      port: parseIntInRange(env.PGPORT, 55432, "PGPORT", 1, 65535),
      database: env.PGDATABASE?.trim() || "random_address_retriever",
      user: env.PGUSER?.trim() || os.userInfo().username,
      password: env.PGPASSWORD,
      max: parseIntInRange(env.PG_POOL_MAX, 10, "PG_POOL_MAX", 1, 100),
      statementTimeoutMs: parseIntInRange(
        env.PG_STATEMENT_TIMEOUT_MS,
        30_000,
        "PG_STATEMENT_TIMEOUT_MS",
        0,
        600_000,
      ),
    },
  };
}
