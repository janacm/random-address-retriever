import { timingSafeEqual } from "node:crypto";

export function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

export function applyCors(req, res, corsOrigins) {
  const origin = req.headers.origin;

  if (!origin) {
    return;
  }

  if (corsOrigins.includes("*") || corsOrigins.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-methods", "GET, OPTIONS");
    res.setHeader("access-control-allow-headers", "authorization, content-type");
  }
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAuthorized(req, expectedToken) {
  const rawHeader = req.headers.authorization ?? "";
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return false;
  }

  return safeEqual(match[1], expectedToken);
}

export function createRateLimiter({ windowMs, maxRequests }) {
  const buckets = new Map();

  return function checkRateLimit(req) {
    const now = Date.now();
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const key =
      forwardedIp?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true };
    }

    bucket.count += 1;

    if (bucket.count > maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      };
    }

    return { allowed: true };
  };
}
