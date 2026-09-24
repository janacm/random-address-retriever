import { describe, expect, it } from "vitest";
import {
  countOf,
  csdTypeLabel,
  csdTypeName,
  csdTypeWord,
  describeSmallest,
  formatNumber,
  formatPct,
  formatShare,
  googleMapsPointUrl,
  googleMapsSearchUrl,
  isCityOrVille,
  joinList,
  ordinal,
} from "./factsFormat";

describe("number formatting", () => {
  it("groups thousands and fixes the decimals shown", () => {
    expect(formatNumber(17169294)).toBe("17,169,294");
    expect(formatNumber(4120.5, 1)).toBe("4,120.5");
    expect(formatNumber(2.7, 2)).toBe("2.70");
    expect(formatNumber(0.215, 3)).toBe("0.215");
  });

  it("formats percentages", () => {
    expect(formatPct(41.8)).toBe("41.8%");
    expect(formatPct(7.67, 2)).toBe("7.67%");
    expect(formatPct(70.29, 0)).toBe("70%");
  });

  it("shows a non-empty group that rounds to zero as below the smallest step", () => {
    expect(formatShare(0, 1, 1)).toBe("<0.1%");
    expect(formatShare(0, 94, 2)).toBe("<0.01%");
    expect(formatShare(0, 0, 1)).toBe("0.0%");
    expect(formatShare(2.3, 94, 1)).toBe("2.3%");
  });

  it("counts with the right noun", () => {
    expect(countOf(1, "address", "addresses")).toBe("1 address");
    expect(countOf(3, "address", "addresses")).toBe("3 addresses");
    expect(countOf(2, "building")).toBe("2 buildings");
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [10, "10th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [27, "27th"],
    [101, "101st"],
    [111, "111th"],
  ])("%i -> %s", (value, expected) => {
    expect(ordinal(value)).toBe(expected);
  });
});

describe("joinList", () => {
  it("joins zero, one, two and more items", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["Emo"])).toBe("Emo");
    expect(joinList(["Emo", "Low"])).toBe("Emo and Low");
    expect(joinList(["Emo", "Low", "Oka"])).toBe("Emo, Low and Oka");
  });

  it("uses a custom separator for items that contain commas", () => {
    expect(joinList(["Emo, ON", "Low, QC", "Tay, ON"], "; ")).toBe("Emo, ON; Low, QC and Tay, ON");
  });
});

describe("census subdivision types", () => {
  it("names known codes and falls back for unknown ones", () => {
    expect(csdTypeName("IRI")).toBe("Indian reserve");
    expect(csdTypeName("FD")).toBe("fire district");
    expect(csdTypeName("XX")).toBeUndefined();
    expect(csdTypeLabel("RGM")).toBe("regional municipality (RGM)");
    expect(csdTypeLabel("XX")).toBe("type XX");
    expect(csdTypeWord("RMU")).toBe("resort municipality");
    expect(csdTypeWord("XX")).toBe("type XX");
  });

  it("treats city and ville codes as cities", () => {
    expect(["C", "CY", "CV", "V"].every(isCityOrVille)).toBe(true);
    expect(isCityOrVille("T")).toBe(false);
    expect(isCityOrVille("RGM")).toBe(false);
  });
});

describe("describeSmallest", () => {
  it("names a single smallest municipality", () => {
    expect(
      describeSmallest({ smallestAddresses: 10, smallestTied: 1, smallest: [{ name: "Morell 2" }] })
    ).toBe("Morell 2 (10 addresses)");
    expect(
      describeSmallest({ smallestAddresses: 1, smallestTied: 1, smallest: [{ name: "Solo" }] })
    ).toBe("Solo (1 address)");
  });

  it("names every member of a listed tie", () => {
    expect(
      describeSmallest({
        smallestAddresses: 1,
        smallestTied: 3,
        smallest: [{ name: "A" }, { name: "Cochrane, Unorganized" }, { name: "C" }],
      })
    ).toBe("3 tied at 1 address: A; Cochrane, Unorganized and C");
  });

  it("points to the full table for large ties at one address", () => {
    expect(describeSmallest({ smallestAddresses: 1, smallestTied: 31, smallest: null })).toBe(
      "31 tied at 1 address, all in the table above"
    );
  });
});

describe("googleMapsSearchUrl", () => {
  it("joins the parts, appends Canada and encodes the query", () => {
    expect(googleMapsSearchUrl("Toronto", "ON")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Toronto%2C%20ON%2C%20Canada"
    );
    expect(googleMapsSearchUrl("14 Main ST, BIRCHY HEAD NL A0K 1K0")).toBe(
      "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent("14 Main ST, BIRCHY HEAD NL A0K 1K0, Canada")
    );
  });

  it("drops empty parts", () => {
    expect(googleMapsSearchUrl("", "Ivujivik", null, undefined, "  ", "QC")).toBe(
      "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Ivujivik, QC, Canada")
    );
  });
});

describe("googleMapsPointUrl", () => {
  it("drops a pin at the coordinates", () => {
    expect(googleMapsPointUrl(73.035343, -85.158072)).toBe(
      "https://www.google.com/maps/search/?api=1&query=73.035343%2C-85.158072"
    );
  });
});
