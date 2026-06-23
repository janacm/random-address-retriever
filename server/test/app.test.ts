import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import type { Config } from "../src/config";
import type {
  AddressRecord,
  Database,
  ListCitiesQuery,
  RandomAddressQuery,
} from "../src/db";

const config: Config = {
  host: "127.0.0.1",
  port: 8787,
  apiToken: "test-token",
  isProduction: false,
  logger: false,
  corsOrigins: ["http://localhost:5173"],
  rateLimit: { windowMs: 60_000, max: 1_000_000 },
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
    listCities: async () => [],
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

describe("GET /api/random-address", () => {
  it("returns a 401 envelope without a token", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({ method: "GET", url: "/api/random-address?city=Burlington" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: "unauthorized", message: "A valid bearer token is required." },
    });
  });

  it("returns the data/meta envelope (no source) by default", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/api/random-address?city=Burlington&province=ON",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual({
      address: "586 Phoebe CRES",
      city: "Burlington",
      province: "ON",
      postalCode: "L7L6H7",
    });
    expect(body.data.source).toBeUndefined();
    expect(body.meta).toMatchObject({ city: "Burlington", province: "ON", verbose: false });
    expect(typeof body.meta.durationMs).toBe("number");
  });

  it("nests source under data when verbose=true", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/api/random-address?city=Burlington&verbose=true",
      headers: authHeader,
    });
    expect(res.json().data.source).toEqual({ locGuid: "loc-1", addrGuid: "addr-1" });
  });

  it("authenticates via the X-Api-Token header", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/api/random-address?city=Burlington",
      headers: { "x-api-token": "test-token" },
    });
    expect(res.statusCode).toBe(200);
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
      url: "/api/random-address?province=on",
      headers: authHeader,
    });
    expect(received).toEqual({ city: "Burlington", province: "ON" });
  });

  it("returns a 400 envelope for an unknown province", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/api/random-address?province=ZZ",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.details.field).toBe("province");
  });

  it("returns a 404 envelope with meta when no address is found", async () => {
    app = buildApp({ db: fakeDb({ randomAddress: async () => null }), config });
    const res = await app.inject({
      method: "GET",
      url: "/api/random-address?city=Nowhere&province=ON",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: "not_found", message: "No address matched that city and province." },
      meta: { city: "Nowhere", province: "ON" },
    });
  });

  it("returns a 500 envelope without leaking details when the db throws", async () => {
    app = buildApp({
      db: fakeDb({
        randomAddress: async () => {
          throw new Error("secret connection string");
        },
      }),
      config,
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/random-address?city=Burlington",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: "internal_error", message: "Address lookup failed." },
    });
  });

  it("serializes a null postalCode rather than dropping it", async () => {
    app = buildApp({
      db: fakeDb({ randomAddress: async () => ({ ...sample, postal_code: null }) }),
      config,
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/random-address?city=Burlington",
      headers: authHeader,
    });
    expect(res.json().data).toHaveProperty("postalCode", null);
  });
});

describe("GET /api/provinces", () => {
  it("returns the province list", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({ method: "GET", url: "/api/provinces", headers: authHeader });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toContainEqual({ code: "ON", name: "Ontario" });
    expect(body.data).toHaveLength(13);
  });
});

describe("GET /api/cities", () => {
  it("returns matching cities and passes the parsed query to the db", async () => {
    let received: ListCitiesQuery | undefined;
    app = buildApp({
      db: fakeDb({
        listCities: async (query) => {
          received = query;
          return [{ city: "Burlington", province: "ON", addressCount: 42 }];
        },
      }),
      config,
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/cities?q=bur&province=on",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(received).toEqual({ q: "bur", province: "ON", limit: 20 });
    const body = res.json();
    expect(body.data).toEqual([
      { city: "Burlington", province: "ON", addressCount: 42 },
    ]);
    expect(body.meta).toMatchObject({ q: "bur", province: "ON", count: 1 });
  });

  it("rejects a search term shorter than 2 characters", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/api/cities?q=b",
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details.field).toBe("q");
  });

  it("requires the token", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({ method: "GET", url: "/api/cities?q=burl" });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /healthz", () => {
  it("returns an ok envelope with the database name", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({ method: "GET", url: "/healthz", headers: authHeader });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({ ok: true, database: "test_db" });
    expect(typeof body.data.durationMs).toBe("number");
  });

  it("requires the token", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(401);
  });
});

describe("CORS", () => {
  it("answers preflight OPTIONS without auth and reflects an allowed origin", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/random-address",
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not reflect a disallowed origin", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { ...authHeader, origin: "https://evil.example" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("unknown routes", () => {
  it("returns a 404 envelope", async () => {
    app = buildApp({ db: fakeDb(), config });
    const res = await app.inject({ method: "GET", url: "/does-not-exist", headers: authHeader });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: "not_found", message: "Route not found." },
    });
  });
});
