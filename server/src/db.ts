import pg from "pg";
import type { Config } from "./config";

/** A single address row as returned to API callers. */
export interface AddressRecord {
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  loc_guid: string;
  addr_guid: string;
}

export interface RandomAddressQuery {
  /** Exact, case-insensitive CSD/city name. */
  city: string;
  /** Optional two-letter postal province abbreviation, already upper-cased. */
  province?: string | undefined;
}

/**
 * Data-access seam. The HTTP layer depends only on this interface, so tests
 * can inject a fake without a live Postgres.
 */
export interface Database {
  randomAddress(query: RandomAddressQuery): Promise<AddressRecord | null>;
  ping(): Promise<{ database: string }>;
  close(): Promise<void>;
}

/**
 * Selects the fields a caller sees from the row chosen by the random pick.
 *
 * The `WHERE` clause is built so that `lower(csd_eng_name)` and
 * `mail_prov_abvn` both match `nar_addresses_random_pick_idx`, whose INCLUDE
 * columns cover every field selected here. With the visibility map set
 * (see scripts/db-optimize.sh) Postgres can satisfy the whole query with an
 * index-only scan over the city's contiguous index pages instead of fetching
 * every matching heap row, which is the difference between ~tens of ms and
 * multiple seconds on a cold cache.
 */
const SELECT_FIELDS = `
  concat_ws(' ',
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

export function createPgDatabase(config: Config): Database {
  const pool = new pg.Pool({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
    max: config.pg.max,
    statement_timeout: config.pg.statementTimeoutMs || undefined,
    application_name: "random-address-api",
  });

  async function randomAddress(
    query: RandomAddressQuery,
  ): Promise<AddressRecord | null> {
    const conditions = ["lower(csd_eng_name) = lower($1)"];
    const params: unknown[] = [query.city];

    if (query.province) {
      params.push(query.province);
      // Province codes are stored upper-cased; an exact match keeps this
      // sargable against the composite index (vs. upper(col) = upper($n)).
      conditions.push(`mail_prov_abvn = $${params.length}`);
    }

    const sql = `
      SELECT ${SELECT_FIELDS}
      FROM nar_addresses
      WHERE ${conditions.join(" AND ")}
      ORDER BY random()
      LIMIT 1
    `;

    const result = await pool.query<AddressRecord>(sql, params);
    return result.rows[0] ?? null;
  }

  async function ping(): Promise<{ database: string }> {
    const result = await pool.query<{ database: string }>(
      "SELECT current_database() AS database",
    );
    return { database: result.rows[0]?.database ?? "" };
  }

  async function close(): Promise<void> {
    await pool.end();
  }

  return { randomAddress, ping, close };
}
