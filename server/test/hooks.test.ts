import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { makeCorsHook, makeRateLimitHook } from "../src/hooks";

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

describe("makeRateLimitHook", () => {
  it("limits after max requests within the window", async () => {
    const now = 1000;
    app = Fastify();
    app.addHook("onRequest", makeRateLimitHook({ windowMs: 60_000, max: 2, now: () => now }));
    app.get("/x", async () => ({ ok: true }));

    expect((await app.inject({ method: "GET", url: "/x" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/x" })).statusCode).toBe(200);
    const limited = await app.inject({ method: "GET", url: "/x" });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({
      error: { code: "rate_limited", message: "Too many requests." },
    });
    expect(limited.headers["retry-after"]).toBeDefined();
  });

  it("resets after the window elapses", async () => {
    let now = 1000;
    app = Fastify();
    app.addHook("onRequest", makeRateLimitHook({ windowMs: 1_000, max: 1, now: () => now }));
    app.get("/x", async () => ({ ok: true }));

    expect((await app.inject({ method: "GET", url: "/x" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/x" })).statusCode).toBe(429);
    now += 2_000;
    expect((await app.inject({ method: "GET", url: "/x" })).statusCode).toBe(200);
  });
});

describe("makeCorsHook", () => {
  it("reflects an allow-listed origin and continues to the route", async () => {
    app = Fastify();
    app.addHook("onRequest", makeCorsHook(["http://localhost:5173"]));
    app.get("/x", async () => ({ ok: true }));
    const res = await app.inject({
      method: "GET",
      url: "/x",
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("answers preflight OPTIONS with 204 even on an unmatched method", async () => {
    app = Fastify();
    app.addHook("onRequest", makeCorsHook(["*"]));
    app.get("/x", async () => ({ ok: true }));
    const res = await app.inject({
      method: "OPTIONS",
      url: "/x",
      headers: { origin: "http://anything.example" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://anything.example");
  });
});
