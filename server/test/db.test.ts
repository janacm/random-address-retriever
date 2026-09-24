import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { createPgPool } from "../src/db";

describe("createPgPool", () => {
  it("uses DATABASE_URL alone when it is set", async () => {
    const url = "postgresql://u:p@ep-example.us-east-2.aws.neon.tech/neondb";
    const pool = createPgPool(
      loadConfig({ ADDRESS_API_TOKEN: "s", DATABASE_URL: url, PGHOST: "10.0.0.1" }),
    );
    expect(pool.options.connectionString).toBe(url);
    expect(pool.options.host).toBeUndefined();
    expect(pool.options.user).toBeUndefined();
    await pool.end();
  });

  it("falls back to the discrete PG* settings", async () => {
    const pool = createPgPool(
      loadConfig({ ADDRESS_API_TOKEN: "s", PGHOST: "10.0.0.1", PG_POOL_MAX: "3" }),
    );
    expect(pool.options.connectionString).toBeUndefined();
    expect(pool.options.host).toBe("10.0.0.1");
    expect(pool.options.port).toBe(55432);
    expect(pool.options.max).toBe(3);
    await pool.end();
  });
});
