import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("throws when ADDRESS_API_TOKEN is missing", () => {
    expect(() => loadConfig({})).toThrow(/ADDRESS_API_TOKEN/);
  });

  it("throws when ADDRESS_API_TOKEN is blank", () => {
    expect(() => loadConfig({ ADDRESS_API_TOKEN: "   " })).toThrow(/ADDRESS_API_TOKEN/);
  });

  it("applies sensible defaults", () => {
    const config = loadConfig({ ADDRESS_API_TOKEN: "secret" });
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.logger).toBe(true);
    expect(config.pg.host).toBe("127.0.0.1");
    expect(config.pg.port).toBe(55432);
    expect(config.pg.database).toBe("random_address_retriever");
    expect(config.pg.max).toBe(10);
  });

  it("parses overrides", () => {
    const config = loadConfig({
      ADDRESS_API_TOKEN: "secret",
      ADDRESS_API_PORT: "9000",
      ADDRESS_API_LOG: "false",
      PGPORT: "5432",
      PGDATABASE: "test_db",
      PG_POOL_MAX: "4",
    });
    expect(config.port).toBe(9000);
    expect(config.logger).toBe(false);
    expect(config.pg.port).toBe(5432);
    expect(config.pg.database).toBe("test_db");
    expect(config.pg.max).toBe(4);
  });

  it("rejects an out-of-range port", () => {
    expect(() =>
      loadConfig({ ADDRESS_API_TOKEN: "secret", ADDRESS_API_PORT: "70000" }),
    ).toThrow(/ADDRESS_API_PORT/);
  });

  it("rejects a non-numeric port", () => {
    expect(() =>
      loadConfig({ ADDRESS_API_TOKEN: "secret", PGPORT: "abc" }),
    ).toThrow(/PGPORT/);
  });

  it("parses PG_STATEMENT_TIMEOUT_MS and allows 0 to disable", () => {
    expect(
      loadConfig({ ADDRESS_API_TOKEN: "s", PG_STATEMENT_TIMEOUT_MS: "0" }).pg
        .statementTimeoutMs,
    ).toBe(0);
    expect(
      loadConfig({ ADDRESS_API_TOKEN: "s", PG_STATEMENT_TIMEOUT_MS: "5000" }).pg
        .statementTimeoutMs,
    ).toBe(5000);
  });

  it("rejects an out-of-range PG_POOL_MAX", () => {
    expect(() =>
      loadConfig({ ADDRESS_API_TOKEN: "s", PG_POOL_MAX: "0" }),
    ).toThrow(/PG_POOL_MAX/);
    expect(() =>
      loadConfig({ ADDRESS_API_TOKEN: "s", PG_POOL_MAX: "1000" }),
    ).toThrow(/PG_POOL_MAX/);
  });
});
