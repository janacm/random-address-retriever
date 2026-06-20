export const DEFAULT_CITY = "Burlington";

export const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

const PROVINCE_CODES = new Set(PROVINCES.map((province) => province.code));
const SAMPLE_RATES = [0.5, 2, 10];

const SELECT_RANDOM_ADDRESS_COLUMNS = `
SELECT
  concat_ws(
    ' ',
    nullif(apt_no_label, ''),
    nullif(civic_no, ''),
    nullif(civic_no_suffix, ''),
    nullif(official_street_name, ''),
    nullif(official_street_type, ''),
    nullif(official_street_dir, '')
  ) AS address,
  csd_eng_name AS city,
  mail_prov_abvn AS province,
  mail_postal_code AS postal_code,
  loc_guid,
  addr_guid
`;

const RANDOM_ADDRESS_BY_CITY_SQL = `${SELECT_RANDOM_ADDRESS_COLUMNS}
FROM nar_addresses
WHERE lower(csd_eng_name) = lower($1)
ORDER BY random()
LIMIT 1;
`;

const RANDOM_ADDRESS_BY_CITY_PROVINCE_SQL = `${SELECT_RANDOM_ADDRESS_COLUMNS}
FROM nar_addresses
WHERE lower(csd_eng_name) = lower($1)
  AND mail_prov_abvn = $2
ORDER BY random()
LIMIT 1;
`;

const ADDRESS_EXISTS_BY_CITY_SQL = `
SELECT 1
FROM nar_addresses
WHERE lower(csd_eng_name) = lower($1)
LIMIT 1;
`;

const ADDRESS_EXISTS_BY_CITY_PROVINCE_SQL = `
SELECT 1
FROM nar_addresses
WHERE lower(csd_eng_name) = lower($1)
  AND mail_prov_abvn = $2
LIMIT 1;
`;

export class QueryValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "QueryValidationError";
    this.details = details;
  }
}

function readBoolean(value) {
  if (value == null || value === "") {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function parseAddressQuery(searchParams) {
  const city = (searchParams.get("city") ?? DEFAULT_CITY).trim();
  const province = (searchParams.get("province") ?? "").trim().toUpperCase();

  if (!city) {
    throw new QueryValidationError("City is required.", { field: "city" });
  }

  if (city.length > 100) {
    throw new QueryValidationError("City must be 100 characters or fewer.", {
      field: "city",
    });
  }

  if (province && !PROVINCE_CODES.has(province)) {
    throw new QueryValidationError("Province must be a Canadian postal abbreviation.", {
      field: "province",
      allowedValues: [...PROVINCE_CODES],
    });
  }

  return {
    city,
    province: province || null,
    verbose: readBoolean(searchParams.get("verbose")),
  };
}

export function rowToAddress(row, verbose = false) {
  const address = {
    address: row.address,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
  };

  if (verbose) {
    address.source = {
      locGuid: row.loc_guid,
      addrGuid: row.addr_guid,
    };
  }

  return address;
}

function buildSampleStatement(query, sampleRate) {
  const provinceFilter = query.province ? "\n  AND mail_prov_abvn = $2" : "";

  return {
    text: `${SELECT_RANDOM_ADDRESS_COLUMNS}
FROM nar_addresses TABLESAMPLE SYSTEM (${sampleRate})
WHERE lower(csd_eng_name) = lower($1)${provinceFilter}
ORDER BY random()
LIMIT 1;
`,
    values: query.province ? [query.city, query.province] : [query.city],
  };
}

function buildExactStatement(query) {
  return query.province
    ? {
        text: RANDOM_ADDRESS_BY_CITY_PROVINCE_SQL,
        values: [query.city, query.province],
      }
    : {
        text: RANDOM_ADDRESS_BY_CITY_SQL,
        values: [query.city],
      };
}

function buildExistsStatement(query) {
  return query.province
    ? {
        text: ADDRESS_EXISTS_BY_CITY_PROVINCE_SQL,
        values: [query.city, query.province],
      }
    : {
        text: ADDRESS_EXISTS_BY_CITY_SQL,
        values: [query.city],
      };
}

export async function getRandomAddress(pool, query) {
  const exists = await pool.query(buildExistsStatement(query));

  if (exists.rowCount === 0) {
    return null;
  }

  for (const sampleRate of SAMPLE_RATES) {
    const statement = buildSampleStatement(query, sampleRate);
    const result = await pool.query(statement);

    if (result.rowCount > 0) {
      return rowToAddress(result.rows[0], query.verbose);
    }
  }

  const result = await pool.query(buildExactStatement(query));

  if (result.rowCount === 0) {
    return null;
  }

  return rowToAddress(result.rows[0], query.verbose);
}
