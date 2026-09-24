import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Neon Function entry reads its configuration at import time, so each test
 * sets the environment and imports a fresh copy of the module. The database
 * URL points at a closed port: the pool connects lazily, and these routes never
 * query it.
 */
async function importFunction(): Promise<{
  default: { fetch: (request: Request) => Promise<Response> };
}> {
  vi.resetModules();
  return import("../src/function");
}

beforeEach(() => {
  vi.stubEnv("ADDRESS_API_LOG", "false");
  vi.stubEnv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:1/neondb");
  vi.stubEnv("ADDRESS_API_TOKEN", "fn-token");
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Neon Function entry", () => {
  it("serves the API through a fetch handler", async () => {
    const { default: fn } = await importFunction();
    const ok = await fn.fetch(
      new Request("https://fn.example/api/provinces", {
        headers: { authorization: "Bearer fn-token" },
      }),
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { data: unknown[] };
    expect(body.data).toContainEqual({ code: "ON", name: "Ontario" });

    const denied = await fn.fetch(new Request("https://fn.example/api/provinces"));
    expect(denied.status).toBe(401);
  });

  it("never falls back to the dev token, even outside NODE_ENV=production", async () => {
    vi.stubEnv("ADDRESS_API_TOKEN", "");
    await expect(importFunction()).rejects.toThrow(/ADDRESS_API_TOKEN/);
  });

  it("requires DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(importFunction()).rejects.toThrow(/DATABASE_URL/);
  });
});
