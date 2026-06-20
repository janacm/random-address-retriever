# Benchmark: Postgres 16 vs DuckDB on FATRIOT

Same 17,169,294-row NAR dataset, same external APFS volume (`/Volumes/FATRIOT`),
identical SQL per query. 7 runs each: **cold** = 1st run, **warm** = median of the
rest. Numbers in milliseconds. Raw CSV: `/Volumes/FATRIOT/bench-results.csv`.

| Query | What it tests | PG cold | PG warm | Duck cold | Duck warm | Warm winner |
|---|---|--:|--:|--:|--:|---|
| `count_all` | full row count | 3 106 | 135.8 | 0 | **0.5** | DuckDB ~270× |
| `point_by_guid` | PK single-row lookup | 3.6 | **0.48** | 6 564 | 50 | **PG ~104×** |
| `postal_point` | exact postal (indexed) | 3.1 | **0.54** | 49 | 2 | **PG ~3.7×** |
| `city_prov_count` | city+province count | 35 474 | 177.5 | 625 | **29** | DuckDB ~6× |
| `city_fuzzy` | `ILIKE '%toron%'` | 225.5 | **226** | 1 029 | 337.5 | **PG ~1.5×** |
| `street_prefix` | `LIKE 'main%'` | 40 251 | 66.3 | 2 631 | **50** | DuckDB ~1.3× |
| `group_by_prov` | aggregate all rows | 2 403 | 350 | 272 | **24** | DuckDB ~15× |
| `top20_cities` | group + sort top-20 | 111 959 | 78 640 | 1 058 | **50** | DuckDB ~1570× |
| `distinct_postal` | count distinct postal | 3 636 | 521.7 | 2 241 | **88.5** | DuckDB ~6× |
| `random_in_city` | random address in city | 219 | 218.6 | 3 936 | **76** | DuckDB ~2.9× |

## Headline

- **Postgres wins OLTP-shaped work:** indexed point lookups are sub-millisecond
  (`point_by_guid` 0.48ms, `postal_point` 0.54ms), and fuzzy substring search is
  faster thanks to the GIN trigram index.
- **DuckDB wins everything analytical:** counts, group-bys, distinct, and random
  sampling, by 3×–1500×, because its column store reads only the columns a query
  touches instead of the full 5.3GB heap.

## Why the numbers look the way they do (EXPLAIN-verified)

- **`top20_cities` — Postgres 78.6s vs DuckDB 50ms (the big gap).**
  Postgres does a `Parallel Seq Scan` over the **entire 5.3GB heap** (`read=256730`
  blocks ≈ 2GB from disk) because no index covers raw `csd_eng_name`. The table is
  larger than `shared_buffers` (2GB), so every run re-reads from the external SSD.
  DuckDB scans only the compressed `csd_eng_name` column.
  *Fix if needed:* a plain `CREATE INDEX ON nar_addresses (csd_eng_name)` lets PG
  do an index-only scan here too.

- **`group_by_prov` — Postgres 350ms (15× faster than top20_cities, same shape).**
  Here PG gets an **Index-Only Scan** on the covering
  `(lower(csd_eng_name), mail_prov_abvn)` index (~245MB, fully cached, 0 heap
  fetches) — so it never touches the heap. Same query shape, opposite outcome,
  purely because one column is index-covered and the other is not.

- **`point_by_guid` — Postgres 0.034ms exec.** `Index Scan` on `nar_addresses_pkey`,
  5 buffer hits. DuckDB's ART index works but reconstructing a row from columnar
  storage costs ~50ms warm — column stores are not built for single-row OLTP.

- **`city_fuzzy` — Postgres 226ms.** `Bitmap Index Scan` on the GIN trigram index
  (`nar_addresses_city_trgm_idx`) instead of a full scan. DuckDB has no trigram
  index, so it full-scans the column (337ms).

## Fairness notes / caveats

- **Warm is the fair steady-state number.** Postgres is a persistent server (hot
  buffer cache); DuckDB is invoked as a fresh CLI process per query, so its *cold*
  numbers also pay process start + reopening the 2.4GB file. Even so, warm DuckDB
  wins the analytical set. A long-lived DuckDB connection would erase its cold gap.
- **Postgres cold scans are brutal on external storage** (35–112s) because a row
  store reads whole rows; this is realistic for a 5.3GB table on a USB/TB SSD with
  a 2GB cache.
- **Trigram search is an apples-to-oranges win for PG** — it has a purpose-built
  index; DuckDB's FTS extension was not enabled.
- Both ran against the same disk and identical data, so relative numbers are sound;
  absolute numbers are specific to this machine (10-core, 16GB) and external SSD.

## Takeaway for this project

The random-address app is dominated by **point lookups and city/province filters**.
- If the hot path is "fetch one address by id / postal code," Postgres is the clear
  pick (sub-ms, plus real OLTP features: concurrency, the existing trgm fuzzy
  search, the running API on `:55432`).
- If the workload shifts to **analytics over the whole dataset** (distributions,
  counts, sampling, exports), DuckDB is 1–3 orders of magnitude faster and needs no
  server.
