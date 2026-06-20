import { describe, expect, it } from "vitest";
import { parseAddressQuery, toAddressPayload } from "../src/query";
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
