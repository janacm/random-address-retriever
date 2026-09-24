import { describe, expect, it } from "vitest";
import {
  MAX_CITY_RESULTS,
  parseAddressQuery,
  parseCitiesQuery,
  toAddressPayload,
} from "../src/query";
import { ValidationError } from "../src/errors";
import type { AddressRecord } from "../src/db";

describe("parseAddressQuery", () => {
  it("defaults the city to Burlington", () => {
    expect(parseAddressQuery({})).toEqual({
      city: "Burlington",
      province: null,
      verbose: false,
    });
  });

  it("trims and upper-cases the province", () => {
    expect(parseAddressQuery({ city: "Toronto", province: " on " }).province).toBe("ON");
  });

  it("treats 1/true/yes/on as verbose", () => {
    for (const value of ["1", "true", "yes", "on", "TRUE"]) {
      expect(parseAddressQuery({ verbose: value }).verbose).toBe(true);
    }
    for (const value of ["0", "false", "off", ""]) {
      expect(parseAddressQuery({ verbose: value }).verbose).toBe(false);
    }
  });

  it("rejects a blank city", () => {
    expect(() => parseAddressQuery({ city: "   " })).toThrow(ValidationError);
  });

  it("rejects an over-long city", () => {
    expect(() => parseAddressQuery({ city: "x".repeat(101) })).toThrow(ValidationError);
  });

  it("rejects an unknown province with allowedValues in details", () => {
    try {
      parseAddressQuery({ province: "ZZ" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const details = (error as ValidationError).details;
      expect(details.field).toBe("province");
      expect(Array.isArray(details.allowedValues)).toBe(true);
    }
  });
});

describe("toAddressPayload", () => {
  const record: AddressRecord = {
    address: "1 Main ST",
    city: "Burlington",
    province: "ON",
    postal_code: "L7L6H7",
    loc_guid: "loc-1",
    addr_guid: "addr-1",
  };

  it("maps to camelCase without source by default", () => {
    expect(toAddressPayload(record, false)).toEqual({
      address: "1 Main ST",
      city: "Burlington",
      province: "ON",
      postalCode: "L7L6H7",
    });
  });

  it("nests source when verbose", () => {
    expect(toAddressPayload(record, true).source).toEqual({
      locGuid: "loc-1",
      addrGuid: "addr-1",
    });
  });
});

describe("parseCitiesQuery", () => {
  it("trims the term, upper-cases the province, and parses the limit", () => {
    expect(parseCitiesQuery({ q: "  burl ", province: " on ", limit: "5" })).toEqual({
      q: "burl",
      province: "ON",
      limit: 5,
    });
  });

  it("defaults the province to null and the limit to the maximum", () => {
    expect(parseCitiesQuery({ q: "to" })).toEqual({
      q: "to",
      province: null,
      limit: MAX_CITY_RESULTS,
    });
  });

  it("caps the limit at the maximum", () => {
    expect(parseCitiesQuery({ q: "to", limit: "500" }).limit).toBe(MAX_CITY_RESULTS);
  });

  it.each(["0", "-3", "abc", ""])("falls back to the maximum for limit=%j", (limit) => {
    expect(parseCitiesQuery({ q: "to", limit }).limit).toBe(MAX_CITY_RESULTS);
  });

  it("rejects a missing or one-character term", () => {
    expect(() => parseCitiesQuery({})).toThrow(ValidationError);
    expect(() => parseCitiesQuery({ q: " b " })).toThrow("at least 2 characters");
  });

  it("rejects an over-long term", () => {
    expect(() => parseCitiesQuery({ q: "x".repeat(101) })).toThrow("100 characters or fewer");
  });

  it("rejects an unknown province with allowedValues in details", () => {
    try {
      parseCitiesQuery({ q: "to", province: "XX" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toMatchObject({ field: "province" });
      expect((error as ValidationError).details.allowedValues).toContain("ON");
    }
  });
});
