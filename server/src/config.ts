import os from "node:os";

const DEFAULT_DEV_TOKEN = "local-dev-token";
const DEFAULT_CORS_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"];

/**
 * Fully-resolved runtime configuration. Built once at startup from the
 * environment so the rest of the app depends on a typed object, never on
 * `process.env` directly (which keeps it testable).
 */
export interface Config {
  host: string;
  port: number;
  apiToken: string;
  isProduction: boolean;
  logger: boolean;
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
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

function parseOrigins(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "") {
    return [...DEFAULT_CORS_ORIGINS];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Load and validate configuration. The API token defaults to a well-known dev
 * token in non-production so the local app/web stack runs out of the box, but
 * `NODE_ENV=production` requires an explicit `ADDRESS_API_TOKEN`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = (env.NODE_ENV ?? "development") === "production";
  const apiToken =
    env.ADDRESS_API_TOKEN?.trim() || (isProduction ? "" : DEFAULT_DEV_TOKEN);
  if (!apiToken) {
    throw new Error("ADDRESS_API_TOKEN is required when NODE_ENV=production");
  }

  return {
    host: env.ADDRESS_API_HOST?.trim() || "127.0.0.1",
    port: parseIntInRange(env.ADDRESS_API_PORT, 8787, "ADDRESS_API_PORT", 1, 65535),
    apiToken,
    isProduction,
    logger: parseBool(env.ADDRESS_API_LOG, true),
    corsOrigins: parseOrigins(env.ADDRESS_API_CORS_ORIGIN),
    rateLimit: {
      windowMs: parseIntInRange(
        env.ADDRESS_API_RATE_LIMIT_WINDOW_MS,
        60_000,
        "ADDRESS_API_RATE_LIMIT_WINDOW_MS",
        1_000,
        3_600_000,
      ),
      max: parseIntInRange(
        env.ADDRESS_API_RATE_LIMIT_MAX,
        120,
        "ADDRESS_API_RATE_LIMIT_MAX",
        1,
        1_000_000,
      ),
    },
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
