import { describe, expect, it } from "vitest";
import { FACTS } from "./facts";

// Internal consistency of facts.generated.json. These hold for any release,
// so they catch a broken generator without pinning this release's numbers.

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("facts.generated.json", () => {
  it("splits addresses into those with and without a municipality", () => {
    const d = FACTS.dataset;
    expect(d.addressesWithMunicipality + d.addressesWithoutMunicipality).toBe(d.addresses);
    expect(FACTS.meanMedian.addresses).toBe(d.addressesWithMunicipality);
    expect(FACTS.meanMedian.municipalities).toBe(d.municipalities);
    expect(FACTS.topMunicipalities.totalAddresses).toBe(d.addresses);
  });

  it("lists every municipality tied for smallest, once", () => {
    const s = FACTS.smallestMunicipalities;
    expect(s.municipalities).toHaveLength(s.count);
    expect(new Set(s.municipalities.map((m) => m.csdCode)).size).toBe(s.count);
    expect(sum(s.byType.map((t) => t.municipalities))).toBe(s.count);
    expect(sum(s.byProvince.map((p) => p.municipalities))).toBe(s.count);
    if (s.addressesEach === 1) {
      expect(s.count).toBe(FACTS.tinyMunicipalities.exactlyOne);
    }
  });

  it("gives size bands that cover every municipality and address", () => {
    const b = FACTS.sizeBands;
    expect(sum(b.bands.map((x) => x.municipalities))).toBe(b.municipalities);
    expect(sum(b.bands.map((x) => x.addresses))).toBe(FACTS.meanMedian.addresses);
    expect(b.bands[0]).toMatchObject({ band: "exactly 1", municipalities: FACTS.tinyMunicipalities.exactlyOne });
  });

  it("ranks the top 10 in order with consistent cumulative shares", () => {
    const top = FACTS.topMunicipalities;
    expect(top.top.map((m) => m.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    top.top.slice(1).forEach((m, i) => expect(m.addresses).toBeLessThanOrEqual(top.top[i].addresses));
    expect(top.top[4].cumulativePct).toBe(top.top5Pct);
    expect(top.top[9].cumulativePct).toBe(top.top10Pct);
    expect(sum(top.top.slice(0, 5).map((m) => m.addresses))).toBe(top.top5Addresses);
    expect(top.rank11.addresses).toBeLessThanOrEqual(top.top[9].addresses);
  });

  it("names every tied smallest municipality per province, here or in the one-address list", () => {
    const rows = FACTS.provinceExtremes;
    const smallest = FACTS.smallestMunicipalities;
    expect(rows).toHaveLength(13);
    expect(sum(rows.map((r) => r.municipalities))).toBe(FACTS.dataset.municipalities);
    for (const r of rows) {
      if (r.smallest) {
        expect(r.smallest).toHaveLength(r.smallestTied);
      } else {
        expect(r.smallestAddresses).toBe(smallest.addressesEach);
        expect(smallest.municipalities.filter((m) => m.province === r.province)).toHaveLength(r.smallestTied);
      }
    }
  });

  it("keeps rankings sorted", () => {
    const counts = FACTS.repeatedAddresses.top.map((r) => r.municipalities);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    const km = FACTS.loneliest.top.map((t) => t.km);
    expect([...km].sort((a, b) => b - a)).toEqual(km);
    const [north, south, east, west] = FACTS.extremes.points;
    expect(north.lat).toBeGreaterThan(south.lat);
    expect(east.lon).toBeGreaterThan(west.lon);
  });
});
