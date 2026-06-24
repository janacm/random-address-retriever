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

/** A distinct city as offered by the typeahead. */
export interface CityRecord {
  city: string;
  /** Two-letter province code, or null when results are aggregated nationally. */
  province: string | null;
  /** How many addresses the index holds for this city. */
  addressCount: number;
}

export interface ListCitiesQuery {
  /** Free-text fragment to match against city names (already trimmed). */
  q: string;
  /** Optional province filter, already upper-cased. */
  province?: string | undefined;
  /** Maximum number of suggestions to return. */
  limit: number;
}

/**
 * Data-access seam. The HTTP layer depends only on this interface, so tests
 * can inject a fake without a live Postgres.
 */
export interface Database {
  randomAddress(query: RandomAddressQuery): Promise<AddressRecord | null>;
  listCities(query: ListCitiesQuery): Promise<CityRecord[]>;
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

  /**
   * Fuzzy city typeahead backed by the `nar_cities` materialized view (distinct
   * CSD/province pairs with address counts). The view is tiny relative to the
   * 17M-row base table, and its trigram index makes the `ILIKE` fast. Prefix
   * matches are ranked above interior matches, then by how many addresses the
   * city has so the biggest, most-likely cities surface first.
   */
  async function listCities(query: ListCitiesQuery): Promise<CityRecord[]> {
    if (query.province) {
      const sql = `
        SELECT city, province, address_count AS count
        FROM nar_cities
        WHERE province = $2 AND city ILIKE '%' || $1 || '%'
        ORDER BY (lower(city) LIKE lower($1) || '%') DESC, address_count DESC, city
        LIMIT $3
      `;
      const result = await pool.query<{ city: string; province: string; count: string }>(
        sql,
        [query.q, query.province, query.limit],
      );
      return result.rows.map((row) => ({
        city: row.city,
        province: row.province,
        addressCount: Number(row.count),
      }));
    }

    // No province filter: collapse the same city name across provinces into one
    // national suggestion so the list is not cluttered with duplicates.
    const sql = `
      SELECT city, sum(address_count) AS count
      FROM nar_cities
      WHERE city ILIKE '%' || $1 || '%'
      GROUP BY city
      ORDER BY (lower(city) LIKE lower($1) || '%') DESC, sum(address_count) DESC, city
      LIMIT $2
    `;
    const result = await pool.query<{ city: string; count: string }>(sql, [
      query.q,
      query.limit,
    ]);
    return result.rows.map((row) => ({
      city: row.city,
      province: null,
      addressCount: Number(row.count),
    }));
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

  return { randomAddress, listCities, ping, close };
}
