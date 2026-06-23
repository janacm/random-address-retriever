# Postgres 16 query benchmark on the external SSD

Same 17,169,294-row NAR dataset on the external APFS volume (`/Volumes/FATRIOT`),
hosted by Postgres 16. 7 runs per query: **cold** = 1st run, **warm** = median of
the rest. Numbers in milliseconds. Regenerate with `scripts/pg-bench.sh`
(CSV: `/Volumes/FATRIOT/bench-results.csv`).

| Query | What it tests | Cold | Warm |
|---|---|--:|--:|
| `count_all` | full row count | 3 106 | 135.8 |
| `point_by_guid` | PK single-row lookup | 3.6 | **0.48** |
| `postal_point` | exact postal (indexed) | 3.1 | **0.54** |
| `city_prov_count` | city+province count | 35 474 | 177.5 |
| `city_fuzzy` | `ILIKE '%toron%'` | 225.5 | 226 |
| `street_prefix` | `LIKE 'main%'` | 40 251 | 66.3 |
| `group_by_prov` | aggregate all rows | 2 403 | 350 |
| `top20_cities` | group + sort top-20 | 111 959 | 78 640 |
| `distinct_postal` | count distinct postal | 3 636 | 521.7 |
| `random_in_city` | random address in city | 219 | 218.6 |

## Headline

- **Indexed OLTP work is sub-millisecond warm:** `point_by_guid` 0.48 ms,
  `postal_point` 0.54 ms; fuzzy substring search is fast thanks to the GIN trigram
  index.
- **Un-indexed full-table analytics are slow** (`top20_cities` ~78.6 s warm)
  because they scan the whole 5.3 GB heap, which is larger than `shared_buffers`.

## Why the numbers look the way they do (EXPLAIN-verified)

- **`top20_cities` — 78.6 s warm (the slow one).** `Parallel Seq Scan` over the
  **entire 5.3 GB heap** (`read=256730` blocks ≈ 2 GB from disk) because no index
  covers raw `csd_eng_name`. The table is larger than `shared_buffers` (2 GB), so
  every run re-reads from the external SSD.
  *Fix if needed:* a plain `CREATE INDEX ON nar_addresses (csd_eng_name)` lets PG
  do an index-only scan here too.

- **`group_by_prov` — 350 ms (225× faster than `top20_cities`, same shape).**
  Here PG gets an **Index-Only Scan** on the covering
  `(lower(csd_eng_name), mail_prov_abvn)` index (~245 MB, fully cached, 0 heap
  fetches) — so it never touches the heap. Same query shape, opposite outcome,
  purely because one column is index-covered and the other is not.

- **`point_by_guid` — 0.034 ms exec.** `Index Scan` on `nar_addresses_pkey`,
  5 buffer hits.

- **`city_fuzzy` — 226 ms.** `Bitmap Index Scan` on the GIN trigram index
  (`nar_addresses_city_trgm_idx`) instead of a full scan.

## Caveats

- **Warm is the fair steady-state number** — Postgres is a persistent server with a
  hot buffer cache. **Cold scans are brutal on external storage** (35–112 s) because
  a row store reads whole rows; this is realistic for a 5.3 GB table on a USB/TB SSD
  with a 2 GB cache. See `docs/DISK-BENCHMARK-RESULTS.md` for how the cable/link
  affects cold times.
- Absolute numbers are specific to this machine (10-core, 16 GB) and the external SSD.

## Takeaway for this project

The random-address app is dominated by **point lookups and city/province filters**,
which are exactly Postgres's strength here: sub-ms indexed lookups, the trigram fuzzy
search, and the running API on `:55432`. If the workload ever shifts to heavy
full-dataset analytics, add covering indexes (see `top20_cities` above) rather than
reaching for a second engine.
