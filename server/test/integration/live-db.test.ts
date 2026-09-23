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

  it("lists cities within a province with per-province counts", async () => {
    const cities = await db.listCities({ q: city.slice(0, 4), province, limit: 20 });
    const match = cities.find((c) => c.city.toLowerCase() === city.toLowerCase());
    expect(match).toBeDefined();
    expect(match?.province).toBe(province);
    expect(match?.addressCount).toBeGreaterThan(0);
    expect(cities.every((c) => c.province === province)).toBe(true);
  });

  it("aggregates a city across provinces when no province is given", async () => {
    const q = city.slice(0, 4);
    const national = await db.listCities({ q, limit: 20 });
    const match = national.find((c) => c.city.toLowerCase() === city.toLowerCase());
    expect(match).toBeDefined();
    expect(match?.province).toBeNull();
    // One national row per name, so no duplicates across provinces.
    expect(new Set(national.map((c) => c.city)).size).toBe(national.length);

    const inProvince = await db.listCities({ q, province, limit: 20 });
    const provinceMatch = inProvince.find((c) => c.city === match?.city);
    expect(match?.addressCount).toBeGreaterThanOrEqual(provinceMatch?.addressCount ?? 0);
  });

  it("matches interior fragments, honours the limit, and returns [] on no match", async () => {
    const interior = city.slice(1, 5);
    const all = await db.listCities({ q: interior, limit: 20 });
    expect(all.some((c) => c.city.toLowerCase() === city.toLowerCase())).toBe(true);
    const limited = await db.listCities({ q: interior, limit: 1 });
    expect(limited).toHaveLength(1);
    const none = await db.listCities({ q: "zzqqnomatch", limit: 20 });
    expect(none).toEqual([]);
  });
});
