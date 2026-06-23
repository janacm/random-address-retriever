import type { AddressRecord } from "./db";
import { ValidationError } from "./errors";
import { PROVINCE_CODES } from "./provinces";

export const DEFAULT_CITY = "Burlington";

export interface ParsedAddressQuery {
  city: string;
  province: string | null;
  verbose: boolean;
}

export interface RawAddressQuery {
  city?: string | undefined;
  province?: string | undefined;
  verbose?: string | undefined;
}

function parseBoolean(value: string | undefined): boolean {
  if (value === undefined || value === "") {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

/** Validate and normalize the random-address query string. */
export function parseAddressQuery(params: RawAddressQuery): ParsedAddressQuery {
  const city = (params.city ?? DEFAULT_CITY).trim();
  const province = (params.province ?? "").trim().toUpperCase();

  if (!city) {
    throw new ValidationError("City is required.", { field: "city" });
  }
  if (city.length > 100) {
    throw new ValidationError("City must be 100 characters or fewer.", {
      field: "city",
    });
  }
  if (province && !PROVINCE_CODES.has(province)) {
    throw new ValidationError(
      "Province must be a Canadian postal abbreviation.",
      { field: "province", allowedValues: [...PROVINCE_CODES] },
    );
  }

  return {
    city,
    province: province || null,
    verbose: parseBoolean(params.verbose),
  };
}

export const MAX_CITY_RESULTS = 20;

export interface ParsedCitiesQuery {
  q: string;
  province: string | null;
  limit: number;
}

export interface RawCitiesQuery {
  q?: string | undefined;
  province?: string | undefined;
  limit?: string | undefined;
}

/** Validate and normalize the city typeahead query string. */
export function parseCitiesQuery(params: RawCitiesQuery): ParsedCitiesQuery {
  const q = (params.q ?? "").trim();

  if (q.length < 2) {
    throw new ValidationError("Search term must be at least 2 characters.", {
      field: "q",
    });
  }
  if (q.length > 100) {
    throw new ValidationError("Search term must be 100 characters or fewer.", {
      field: "q",
    });
  }

  const province = (params.province ?? "").trim().toUpperCase();
  if (province && !PROVINCE_CODES.has(province)) {
    throw new ValidationError(
      "Province must be a Canadian postal abbreviation.",
      { field: "province", allowedValues: [...PROVINCE_CODES] },
    );
  }

  const parsedLimit = Number.parseInt(params.limit ?? "", 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_CITY_RESULTS)
      : MAX_CITY_RESULTS;

  return { q, province: province || null, limit };
}

export interface AddressPayload {
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  source?: { locGuid: string; addrGuid: string };
}

/** Map a database row to the camelCase shape the web client expects. */
export function toAddressPayload(
  record: AddressRecord,
  verbose: boolean,
): AddressPayload {
  const payload: AddressPayload = {
    address: record.address,
    city: record.city,
    province: record.province,
    postalCode: record.postal_code,
  };
  if (verbose) {
    payload.source = { locGuid: record.loc_guid, addrGuid: record.addr_guid };
  }
  return payload;
}
