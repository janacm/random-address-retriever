import { createServer } from "node:http";
import { Pool } from "pg";
import { getRandomAddress, parseAddressQuery, PROVINCES, QueryValidationError } from "./address-query.mjs";
import { readConfig } from "./config.mjs";
import { applyCors, createRateLimiter, isAuthorized, sendJson, sendNoContent } from "./http-utils.mjs";

const config = readConfig();
const pool = new Pool(config.postgres);
const rateLimiter = createRateLimiter({
  windowMs: config.api.rateLimitWindowMs,
  maxRequests: config.api.rateLimitMax,
});

function withError(handler) {
  return async function handle(req, res, url) {
    try {
      await handler(req, res, url);
    } catch (error) {
      if (error instanceof QueryValidationError) {
        sendJson(res, 400, {
          error: {
            code: "bad_request",
            message: error.message,
            details: error.details,
          },
        });
        return;
      }

      console.error(error);
      sendJson(res, 500, {
        error: {
          code: "internal_error",
          message: "Address lookup failed.",
        },
      });
    }
  };
}

async function handleHealth(_req, res) {
  const startedAt = performance.now();
  await pool.query("SELECT 1");
  sendJson(res, 200, {
    data: {
      ok: true,
      database: config.postgres.database,
      durationMs: Math.round(performance.now() - startedAt),
    },
  });
}

async function handleProvinces(_req, res) {
  sendJson(res, 200, { data: PROVINCES });
}

async function handleRandomAddress(_req, res, url) {
  const query = parseAddressQuery(url.searchParams);
  const startedAt = performance.now();
  const address = await getRandomAddress(pool, query);

  if (!address) {
    sendJson(res, 404, {
      error: {
        code: "not_found",
        message: "No address matched that city and province.",
      },
      meta: {
        city: query.city,
        province: query.province,
      },
    });
    return;
  }

  sendJson(res, 200, {
    data: address,
    meta: {
      city: query.city,
      province: query.province,
      verbose: query.verbose,
      durationMs: Math.round(performance.now() - startedAt),
    },
  });
}

const routes = new Map([
  ["GET /healthz", withError(handleHealth)],
  ["GET /api/provinces", withError(handleProvinces)],
  ["GET /api/random-address", withError(handleRandomAddress)],
]);

const server = createServer((req, res) => {
  applyCors(req, res, config.api.corsOrigins);

  if (req.method === "OPTIONS") {
    sendNoContent(res);
    return;
  }

  if (!isAuthorized(req, config.api.token)) {
    sendJson(res, 401, {
      error: {
        code: "unauthorized",
        message: "A valid bearer token is required.",
      },
    });
    return;
  }

  const rateLimit = rateLimiter(req);

  if (!rateLimit.allowed) {
    res.setHeader("retry-after", String(rateLimit.retryAfterSeconds));
    sendJson(res, 429, {
      error: {
        code: "rate_limited",
        message: "Too many requests.",
      },
    });
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const handler = routes.get(`${req.method} ${url.pathname}`);

  if (!handler) {
    sendJson(res, 404, {
      error: {
        code: "not_found",
        message: "Route not found.",
      },
    });
    return;
  }

  handler(req, res, url);
});

server.listen(config.api.port, config.api.host, () => {
  console.log(
    `Address API listening at http://${config.api.host}:${config.api.port}`
  );
});

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
