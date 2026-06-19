import os from "node:os";

const DEFAULT_DEV_TOKEN = "local-dev-token";

function readNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readOrigins(value) {
  if (!value) {
    return ["http://127.0.0.1:5173", "http://localhost:5173"];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function readConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";
  const token = env.ADDRESS_API_TOKEN ?? (isProduction ? "" : DEFAULT_DEV_TOKEN);

  if (!token) {
    throw new Error("ADDRESS_API_TOKEN is required when NODE_ENV=production");
  }

  return {
    api: {
      host: env.ADDRESS_API_HOST ?? "127.0.0.1",
      port: readNumber(env.ADDRESS_API_PORT, 8787),
      token,
      corsOrigins: readOrigins(env.ADDRESS_API_CORS_ORIGIN),
      rateLimitWindowMs: readNumber(env.ADDRESS_API_RATE_LIMIT_WINDOW_MS, 60_000),
      rateLimitMax: readNumber(env.ADDRESS_API_RATE_LIMIT_MAX, 120),
    },
    postgres: {
      host: env.PGHOST ?? "127.0.0.1",
      port: readNumber(env.PGPORT, 55432),
      database: env.PGDATABASE ?? "random_address_retriever",
      user: env.PGUSER ?? os.userInfo().username,
      password: env.PGPASSWORD,
      max: readNumber(env.PGPOOL_MAX, 4),
    },
  };
}
