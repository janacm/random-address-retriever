// Formatting helpers for the Facts page. Kept apart from the view so the
// branches the current data never takes (zero shares, other tie shapes) are
// still unit tested.

const formatters = new Map<number, Intl.NumberFormat>();

/** 1316783 -> "1,316,783"; digits fixes the decimals shown (4120.5, 2.70). */
export function formatNumber(value: number, digits = 0): string {
  let formatter = formatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-CA", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(digits, formatter);
  }
  return formatter.format(value);
}

export function formatPct(value: number, digits = 1): string {
  return `${formatNumber(value, digits)}%`;
}

/**
 * A share rounded for display. A non-empty group that rounds to zero reads
 * "<0.1%" rather than a misleading "0.0%".
 */
export function formatShare(value: number, count: number, digits = 1): string {
  if (value === 0 && count > 0) {
    return `<${formatNumber(10 ** -digits, digits)}%`;
  }
  return formatPct(value, digits);
}

export function ordinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/**
 * ["a"] -> "a"; ["a", "b"] -> "a and b"; ["a", "b", "c"] -> "a, b and c".
 * Pass "; " as the separator when the items contain commas themselves.
 */
export function joinList(items: string[], separator = ", "): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(separator)} and ${items[items.length - 1]}`;
}

// Statistics Canada census subdivision type abbreviations that appear on the
// page. The register stores only the code; these names come from the census
// dictionary. Codes not listed here are shown as the bare code.
const CSD_TYPES: Record<string, string> = {
  C: "city",
  CY: "city",
  CV: "city",
  V: "ville",
  T: "town",
  TV: "town",
  TP: "township",
  VL: "village",
  VN: "northern village",
  HAM: "hamlet",
  IRI: "Indian reserve",
  "S-É": "Indian settlement",
  "SÉ": "settlement",
  RM: "rural municipality",
  RGM: "regional municipality",
  DM: "district municipality",
  MD: "municipal district",
  MÉ: "municipality",
  CT: "canton",
  PE: "parish",
  NO: "unorganized",
  SNO: "subdivision of unorganized",
  RDA: "regional district electoral area",
  LGD: "local government district",
  CC: "chartered community",
  FD: "fire district",
  RMU: "resort municipality",
  NH: "northern hamlet",
  RV: "resort village",
  SG: "self-government",
};

export function csdTypeName(code: string): string | undefined {
  return CSD_TYPES[code];
}

/** "district municipality (DM)", or "type XX" when the code is not listed. */
export function csdTypeLabel(code: string): string {
  const name = CSD_TYPES[code];
  return name ? `${name} (${code})` : `type ${code}`;
}

/** "district municipality", or "type XX" when the code is not listed. */
export function csdTypeWord(code: string): string {
  return CSD_TYPES[code] ?? `type ${code}`;
}

/** "1 address" / "2 addresses" */
export function countOf(value: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

const CITY_TYPES = new Set(["C", "CY", "CV", "V"]);

export function isCityOrVille(code: string): boolean {
  return CITY_TYPES.has(code);
}

type ProvinceSmallest = {
  smallestAddresses: number;
  smallestTied: number;
  smallest: Array<{ name: string }> | null;
};

/**
 * Text for a province's smallest municipality. Every tied member is named,
 * except large ties at the national minimum, which the one-address table
 * already lists in full.
 */
export function describeSmallest(row: ProvinceSmallest): string {
  const each = countOf(row.smallestAddresses, "address", "addresses");
  if (row.smallestTied === 1 && row.smallest) {
    return `${row.smallest[0].name} (${each})`;
  }
  if (!row.smallest) {
    return `${formatNumber(row.smallestTied)} tied at ${each}, all in the table above`;
  }
  return `${formatNumber(row.smallestTied)} tied at ${each}: ${joinList(
    row.smallest.map((s) => s.name),
    "; "
  )}`;
}
