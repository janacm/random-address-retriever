import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest, onRequestHookHandler } from "fastify";

/**
 * Hash both sides before comparing so `timingSafeEqual` always receives
 * equal-length buffers (it throws otherwise) and the comparison time does not
 * leak the token's length.
 */
function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time token comparison. */
export function tokensMatch(actual: string, expected: string): boolean {
  return timingSafeEqual(sha256(actual), sha256(expected));
}

/** Extract the caller's token from `Authorization: Bearer` or `X-Api-Token`. */
export function extractToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  const headerToken = request.headers["x-api-token"];
  if (Array.isArray(headerToken)) {
    return headerToken[0] ?? "";
  }
  return headerToken ?? "";
}

/** Build an `onRequest` hook that rejects any request lacking the API token. */
export function makeAuthHook(expectedToken: string): onRequestHookHandler {
  return async function authHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!tokensMatch(extractToken(request), expectedToken)) {
      await reply.code(401).send({
        error: {
          code: "unauthorized",
          message: "A valid bearer token is required.",
        },
      });
    }
  };
}
