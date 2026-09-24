import type { FastifyInstance, InjectOptions } from "fastify";

/**
 * Response headers that describe the Fastify-side connection rather than the
 * response itself. The host runtime frames the body and sets its own.
 */
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "content-length"]);

/** Statuses whose responses must not carry a body (Fetch spec "null body status"). */
const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

/**
 * Adapt a Fastify app to a web-standard `fetch(request) => Response` handler,
 * the shape Neon Functions (and other WinterTC runtimes) call. Each request is
 * dispatched with `app.inject()`, which runs the full Fastify lifecycle (hooks,
 * validation, error handler) without a listening socket. `@fastify/aws-lambda`
 * bridges Lambda events the same way.
 */
export function toFetchHandler(
  app: FastifyInstance,
): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const injected = await app.inject({
      method: request.method as InjectOptions["method"],
      url: `${url.pathname}${url.search}`,
      headers,
      payload: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined,
    });

    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(injected.headers)) {
      if (value === undefined || HOP_BY_HOP.has(key.toLowerCase())) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          responseHeaders.append(key, String(item));
        }
      } else {
        responseHeaders.set(key, String(value));
      }
    }

    const noBody =
      NULL_BODY_STATUS.has(injected.statusCode) || request.method === "HEAD";
    return new Response(noBody ? null : new Uint8Array(injected.rawPayload), {
      status: injected.statusCode,
      headers: responseHeaders,
    });
  };
}
