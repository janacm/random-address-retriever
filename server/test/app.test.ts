import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import type { Config } from "../src/config";
import type { AddressRecord, Database, RandomAddressQuery } from "../src/db";

const config: Config = {
  host: "127.0.0.1",
  port: 8787,
  apiToken: "test-token",
  logger: false,
  pg: {
    host: "127.0.0.1",
    port: 55432,
    database: "test_db",
    user: "tester",
    max: 10,
    statementTimeoutMs: 0,
  },
};

const sample: AddressRecord = {
  address: "586 Phoebe CRES",
  city: "Burlington",
  province: "ON",
  postal_code: "L7L6H7",
  loc_guid: "loc-1",
  addr_guid: "addr-1",
};

function fakeDb(overrides: Partial<Database> = {}): Database {
  return {
    randomAddress: async () => sample,
    ping: async () => ({ database: "test_db" }),
    close: async () => {},
    ...overrides,
  };
}

const authHeader = { authorization: "Bearer test-token" };

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

describe("GET /random-address", () => {
  it("returns 401 without a token", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({ method: "GET", url: "/random-address?city=Burlington" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 with a wrong token", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/random-address?city=Burlington",
      headers: { authorization: "Bearer nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns the base shape (no guids) by default", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/random-address?city=Burlington",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      address: "586 Phoebe CRES",
      city: "Burlington",
      province: "ON",
      postal_code: "L7L6H7",
    });
  });

  it("authenticates via the X-Api-Token header", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/random-address?city=Burlington",
      headers: { "x-api-token": "test-token" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("treats 1/yes/on/true (any case) as verbose", async () => {
    app = buildApp({ db: fakeDb(), config });
    for (const value of ["1", "yes", "on", "TRUE"]) {
      const res = await app.inject({
        method: "GET",
        url: `/random-address?city=Burlington&verbose=${value}`,
        headers: authHeader,
      });
      expect(res.json()).toHaveProperty("loc_guid", "loc-1");
    }
  });

  it("treats 0/off/false/other as non-verbose", async () => {
    app = buildApp({ db: fakeDb(), config });
    for (const value of ["0", "off", "false", "maybe"]) {
      const res = await app.inject({
        method: "GET",
        url: `/random-address?city=Burlington&verbose=${value}`,
        headers: authHeader,
      });
      expect(res.json()).not.toHaveProperty("loc_guid");
    }
  });

  it("includes guids when verbose=true", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/random-address?city=Burlington&verbose=true",
      headers: authHeader,
    });
    expect(res.json()).toEqual({
      address: "586 Phoebe CRES",
      city: "Burlington",
      province: "ON",
      postal_code: "L7L6H7",
      loc_guid: "loc-1",
      addr_guid: "addr-1",
    });
  });

  it("defaults the city to Burlington and upper-cases the province", async () => {
    let received: RandomAddressQuery | undefined;
    app = buildApp({
      db: fakeDb({
        randomAddress: async (query) => {
          received = query;
          return sample;
        },
      }),
      config,
    });
    await app.inject({
      method: "GET",
      url: "/random-address?province=on",
      headers: authHeader,
    });
    expect(received).toEqual({ city: "Burlington", province: "ON" });
  });

  it("returns 400 for an invalid province", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/random-address?province=XYZ",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("returns 404 when no address is found", async () => {
    app = buildApp({ db: fakeDb({ randomAddress: async () => null }), config });
    const res = await app.inject({
      method: "GET",
      url: "/random-address?city=Nowhere",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("returns 500 as internal_server_error when the db throws", async () => {
    app = buildApp({
      db: fakeDb({
        randomAddress: async () => {
          throw new Error("boom with secret connection string");
        },
      }),
      config,
    });
    const res = await app.inject({
      method: "GET",
      url: "/random-address?city=Burlington",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(500);
    // The internal message must not leak.
    expect(res.json()).toEqual({ error: "internal_server_error" });
  });

  it("serializes null postal_code rather than dropping it", async () => {
    app = buildApp({
      db: fakeDb({
        randomAddress: async () => ({ ...sample, postal_code: null }),
      }),
      config,
    });
    const res = await app.inject({
      method: "GET",
      url: "/random-address?city=Burlington",
      headers: authHeader,
    });
    expect(res.json()).toHaveProperty("postal_code", null);
  });
});

describe("GET /healthz", () => {
  it("returns ok with the database name", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, database: "test_db" });
  });

  it("requires the token", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(401);
  });
});

describe("unknown routes", () => {
  it("returns 404 json", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/does-not-exist",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });
});
