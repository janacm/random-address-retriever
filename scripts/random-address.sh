#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

city="${1:-Burlington}"
province="${2:-}"

psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -v city="$city" -v province="$province" <<'SQL'
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
FROM nar_addresses
WHERE lower(csd_eng_name) = lower(:'city')
  AND (:'province' = '' OR upper(mail_prov_abvn) = upper(:'province'))
ORDER BY random()
LIMIT 1;
SQL
