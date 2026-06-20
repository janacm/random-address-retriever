#!/usr/bin/env bash
set -euo pipefail

# Prepares nar_addresses for fast, bounded read latency.
#
# 1. Creates a covering index so a random-address pick is satisfied entirely
#    from the index (Heap Fetches: 0) instead of reading every matching heap
#    row. On the slow external-SSD sparseimage this turns a cold ~16.8 s pick
#    into a few hundred ms at worst (~20 ms warm).
# 2. VACUUM (VERBOSE, ANALYZE) sets the visibility map so index-only scans are
#    usable and refreshes planner stats.
#
# The covering index is large (~2.7 GB for the full NAR dataset) and the build
# reads the whole table once. Read latency is the only performance target for
# this project, so the one-time write cost is acceptable.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

"$ROOT_DIR/scripts/db-start.sh" >/dev/null

echo "Creating covering index nar_addresses_random_pick_idx (if missing)..."
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c "
CREATE INDEX IF NOT EXISTS nar_addresses_random_pick_idx
  ON nar_addresses (lower(csd_eng_name), mail_prov_abvn)
  INCLUDE (apt_no_label, civic_no, civic_no_suffix,
           official_street_name, official_street_type, official_street_dir,
           csd_eng_name, mail_postal_code, loc_guid, addr_guid);"

echo "Running VACUUM (VERBOSE, ANALYZE) nar_addresses..."
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -v ON_ERROR_STOP=1 \
  -c "VACUUM (VERBOSE, ANALYZE) nar_addresses;"

echo "Index size:"
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -At \
  -c "SELECT pg_size_pretty(pg_relation_size('nar_addresses_random_pick_idx'));"

echo "Done. Random-address lookups now use an index-only scan."
