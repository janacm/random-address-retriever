import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import type { Config } from "../src/config";
import type { Database } from "../src/db";
import { toFetchHandler } from "../src/fetch-adapter";

const config: Config = {
  host: "127.0.0.1",
  port: 8787,
  apiToken: "test-token",
  isProduction: true,
  logger: false,
  corsOrigins: ["http://localhost:5173"],
  rateLimit: { windowMs: 60_000, max: 1_000_000 },
  pg: {
    host: "127.0.0.1",
    port: 55432,
    database: "test_db",
    user: "tester",
    max: 5,
    statementTimeoutMs: 0,
  },
};

const db: Database = {
  randomAddress: async ({ city }) => ({
    address: "1 MAIN ST",
    city,
    province: "ON",
    postal_code: "M1M1A1",
    loc_guid: "loc-1",
    addr_guid: "addr-1",
  }),
  listCities: async () => [],
  ping: async () => ({ database: "test_db" }),
  close: async () => {},
};

const auth = { authorization: "Bearer test-token" };

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

function handler(extend?: (instance: FastifyInstance) => void) {
  app = buildApp({ db, config });
  extend?.(app);
  return toFetchHandler(app);
}

describe("toFetchHandler", () => {
  it("passes path, query and headers through to the Fastify routes", async () => {
    const fetch = handler();
    const res = await fetch(
      new Request("https://fn.example/api/random-address?city=Burlington&province=on", {
        headers: auth,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = (await res.json()) as {
      data: { city: string };
      meta: { province: string };
    };
    expect(body.data.city).toBe("Burlington");
    expect(body.meta.province).toBe("ON");
  });

  it("returns the app's own error envelope and status", async () => {
    const fetch = handler();
    const res = await fetch(new Request("https://fn.example/api/provinces"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: "A valid bearer token is required." },
    });
  });

  it("answers a CORS preflight with an empty 204", async () => {
    const fetch = handler();
    const res = await fetch(
      new Request("https://fn.example/api/provinces", {
        method: "OPTIONS",
        headers: { origin: "http://localhost:5173" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(res.body).toBeNull();
  });

  it("forwards a request body and drops connection-level response headers", async () => {
    const fetch = handler((instance) => {
      instance.post("/echo", async (request) => ({ received: request.body }));
    });
    const res = await fetch(
      new Request("https://fn.example/echo", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ hello: "world" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: { hello: "world" } });
    expect(res.headers.has("connection")).toBe(false);
    expect(res.headers.has("content-length")).toBe(false);
  });

  it("keeps every value of a repeated response header", async () => {
    const fetch = handler((instance) => {
      instance.get("/multi", async (_request, reply) => {
        void reply.header("set-cookie", ["a=1", "b=2"]);
        return "ok";
      });
    });
    const res = await fetch(new Request("https://fn.example/multi", { headers: auth }));
    expect(res.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    expect(await res.text()).toBe("ok");
  });

  it("sends no body for HEAD", async () => {
    const fetch = handler();
    const res = await fetch(
      new Request("https://fn.example/api/provinces", { method: "HEAD", headers: auth }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});
