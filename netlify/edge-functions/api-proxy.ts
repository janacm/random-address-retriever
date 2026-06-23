import type { Context } from "@netlify/edge-functions";

/**
 * Server-side proxy for the Random Address API.
 *
 * The browser calls same-origin relative paths (`/api/*`, `/healthz`). This
 * Edge Function forwards them to the Cloudflare Tunnel hostname, injecting the
 * bearer token (and optional Cloudflare Access service-token headers) so the
 * secrets never reach the client and there is no CORS. Any auth headers sent by
 * the browser are ignored — a fresh header set is built here.
 *
 * Configure on the Netlify site (runtime env vars):
 *   ADDRESS_API_URL          required, e.g. https://address-api.janac.me
 *   ADDRESS_API_TOKEN        required, matches the local API's token
 *   CF_ACCESS_CLIENT_ID      optional, only if Cloudflare Access is enabled
 *   CF_ACCESS_CLIENT_SECRET  optional, only if Cloudflare Access is enabled
 */

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async (request: Request, _context: Context): Promise<Response> => {
  const apiUrl = Netlify.env.get("ADDRESS_API_URL");
  const apiToken = Netlify.env.get("ADDRESS_API_TOKEN");

  if (!apiUrl || !apiToken) {
    return jsonError(
      500,
      "proxy_misconfigured",
      "ADDRESS_API_URL and ADDRESS_API_TOKEN must be set on the Netlify site.",
    );
  }

  // Preserve the incoming path and query; only swap the origin to the API host.
  const incoming = new URL(request.url);
  const upstream = new URL(apiUrl);
  upstream.pathname = incoming.pathname; // /api/random-address, /healthz, ...
  upstream.search = incoming.search;

  const headers = new Headers();
  headers.set("authorization", `Bearer ${apiToken}`);
  headers.set("accept", "application/json");

  const cfAccessId = Netlify.env.get("CF_ACCESS_CLIENT_ID");
  const cfAccessSecret = Netlify.env.get("CF_ACCESS_CLIENT_SECRET");
  if (cfAccessId && cfAccessSecret) {
    headers.set("cf-access-client-id", cfAccessId);
    headers.set("cf-access-client-secret", cfAccessSecret);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  if (hasBody) {
    const contentType = request.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
    });
  } catch {
    return jsonError(502, "upstream_unreachable", "The address API is unavailable.");
  }

  // Pass the upstream JSON straight through; keep responses uncached.
  const body = await upstreamResponse.text();
  return new Response(body, {
    status: upstreamResponse.status,
    headers: {
      "content-type": upstreamResponse.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
};
