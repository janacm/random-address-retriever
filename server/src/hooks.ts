import type { FastifyReply, FastifyRequest, onRequestHookHandler } from "fastify";

/**
 * Reflect the request origin when it is allow-listed and answer CORS
 * preflight (`OPTIONS`) requests directly. Runs before auth so the browser's
 * unauthenticated preflight is not rejected.
 */
export function makeCorsHook(allowedOrigins: string[]): onRequestHookHandler {
  const allowAll = allowedOrigins.includes("*");
  return async function corsHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const origin = request.headers.origin;
    if (origin && (allowAll || allowedOrigins.includes(origin))) {
      reply
        .header("access-control-allow-origin", origin)
        .header("vary", "origin")
        .header("access-control-allow-methods", "GET, OPTIONS")
        .header("access-control-allow-headers", "authorization, content-type, x-api-token");
    }
    if (request.method === "OPTIONS") {
      await reply.code(204).send();
    }
  };
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window per-client rate limiter. Keyed by the first `x-forwarded-for`
 * hop, falling back to the socket address. In production the Netlify edge
 * proxy sets that header to the visitor's IP on a header set it builds itself,
 * so a browser cannot choose its own key. A caller that skips the proxy can
 * spoof the header, but it has no bearer token, so the auth hook rejects it
 * before any database work. Buckets are in memory, so each process (or Neon
 * Function isolate) counts separately. `now` is injectable so tests need not
 * depend on the clock.
 */
export function makeRateLimitHook(
  options: { windowMs: number; max: number; now?: () => number },
): onRequestHookHandler {
  const { windowMs, max } = options;
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  return async function rateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const forwarded = request.headers["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const key =
      forwardedValue?.split(",")[0]?.trim() || request.ip || "unknown";

    const current = now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= current) {
      buckets.set(key, { count: 1, resetAt: current + windowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - current) / 1000);
      await reply
        .header("retry-after", String(retryAfterSeconds))
        .code(429)
        .send({ error: { code: "rate_limited", message: "Too many requests." } });
    }
  };
}
