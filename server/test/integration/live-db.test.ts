import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config";
import { createPgDatabase } from "../../src/db";

/**
 * Integration tests against a real Postgres. Skipped unless RUN_DB_TESTS=1 so
 * the default `vitest run` stays hermetic. CI seeds a tiny `nar_addresses`
 * (see test/fixtures/seed.sql) and sets RUN_DB_TESTS=1; locally these run
 * against the full NAR database via the PG* environment.
 */
const enabled = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!enabled)("createPgDatabase (live Postgres)", () => {
  const config = loadConfig({
    ...process.env,
    ADDRESS_API_TOKEN: process.env.ADDRESS_API_TOKEN ?? "integration",
  });
  const db = createPgDatabase(config);
  const city = process.env.TEST_CITY ?? "Burlington";
  const province = process.env.TEST_PROVINCE ?? "ON";

  afterAll(async () => {
    await db.close();
  });

  it("pings the database", async () => {
    const result = await db.ping();
    expect(result.database).toBeTruthy();
  });

  it("returns a random address for the seeded city/province", async () => {
    const record = await db.randomAddress({ city, province });
    expect(record).not.toBeNull();
    expect(record?.city?.toLowerCase()).toBe(city.toLowerCase());
    expect(record?.province).toBe(province);
    expect(record?.loc_guid).toBeTruthy();
    expect(record?.addr_guid).toBeTruthy();
  });

  it("returns a random address for the city without a province filter", async () => {
    const record = await db.randomAddress({ city });
    expect(record).not.toBeNull();
    expect(record?.city?.toLowerCase()).toBe(city.toLowerCase());
  });

  it("returns null for an unknown city", async () => {
    const record = await db.randomAddress({ city: "ZzzNoSuchCityName", province });
    expect(record).toBeNull();
  });
});
