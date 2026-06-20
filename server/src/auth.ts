import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest, onRequestHookHandler } from "fastify";

/**
 * Constant-time comparison of the API token. The token is a single
 * high-entropy secret of fixed length, so the early length check (the only
 * timing signal here) reveals nothing useful, and the byte comparison runs in
 * constant time via `timingSafeEqual`. We deliberately do not pre-hash the
 * token: a fast digest adds no security for an equality check and would be a
 * misuse of a hash function for secret comparison.
 */
export function tokensMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
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
