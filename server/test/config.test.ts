import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("defaults to the dev token outside production", () => {
    const config = loadConfig({});
    expect(config.apiToken).toBe("local-dev-token");
    expect(config.isProduction).toBe(false);
  });

  it("requires an explicit token in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/ADDRESS_API_TOKEN/);
    expect(loadConfig({ NODE_ENV: "production", ADDRESS_API_TOKEN: "secret" }).apiToken).toBe(
      "secret",
    );
  });

  it("applies sensible defaults", () => {
    const config = loadConfig({ ADDRESS_API_TOKEN: "secret" });
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.logger).toBe(true);
    expect(config.corsOrigins).toEqual([
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ]);
    expect(config.rateLimit).toEqual({ windowMs: 60_000, max: 120 });
    expect(config.pg.port).toBe(55432);
    expect(config.pg.database).toBe("random_address_retriever");
  });

  it("parses CORS origins from a comma list", () => {
    const config = loadConfig({
      ADDRESS_API_TOKEN: "s",
      ADDRESS_API_CORS_ORIGIN: "https://a.example, https://b.example",
    });
    expect(config.corsOrigins).toEqual(["https://a.example", "https://b.example"]);
  });

  it("parses overrides", () => {
    const config = loadConfig({
      ADDRESS_API_TOKEN: "secret",
      ADDRESS_API_PORT: "9000",
      ADDRESS_API_LOG: "false",
      ADDRESS_API_RATE_LIMIT_MAX: "5",
      PGPORT: "5432",
    });
    expect(config.port).toBe(9000);
    expect(config.logger).toBe(false);
    expect(config.rateLimit.max).toBe(5);
    expect(config.pg.port).toBe(5432);
  });

  it("rejects an out-of-range port", () => {
    expect(() =>
      loadConfig({ ADDRESS_API_TOKEN: "secret", ADDRESS_API_PORT: "70000" }),
    ).toThrow(/ADDRESS_API_PORT/);
  });

  it("rejects an out-of-range PG_POOL_MAX", () => {
    expect(() => loadConfig({ ADDRESS_API_TOKEN: "s", PG_POOL_MAX: "0" })).toThrow(
      /PG_POOL_MAX/,
    );
  });

  it("parses PG_STATEMENT_TIMEOUT_MS and allows 0 to disable", () => {
    expect(
      loadConfig({ ADDRESS_API_TOKEN: "s", PG_STATEMENT_TIMEOUT_MS: "0" }).pg
        .statementTimeoutMs,
    ).toBe(0);
  });
});
