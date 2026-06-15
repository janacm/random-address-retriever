#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/random-address.sh [CITY] [PROVINCE]
  ./scripts/random-address.sh --city CITY [--province PROVINCE] [--verbose]

Options:
  --city CITY           City/CSD name to search. Defaults to Burlington.
  --province PROVINCE   Optional postal province abbreviation, such as ON.
  --verbose             Include loc_guid and addr_guid in the output.
  --help                Show this help text.
EOF
}

city=""
province=""
verbose=false
positionals=()

while (($#)); do
  case "$1" in
    --city)
      if [[ $# -lt 2 ]]; then
        echo "error: --city requires a value" >&2
        exit 2
      fi
      city="$2"
      shift 2
      ;;
    --city=*)
      city="${1#--city=}"
      shift
      ;;
    --province)
      if [[ $# -lt 2 ]]; then
        echo "error: --province requires a value" >&2
        exit 2
      fi
      province="$2"
      shift 2
      ;;
    --province=*)
      province="${1#--province=}"
      shift
      ;;
    --verbose)
      verbose=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    --)
      shift
      while (($#)); do
        positionals+=("$1")
        shift
      done
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      positionals+=("$1")
      shift
      ;;
  esac
done

remaining_positionals=("${positionals[@]}")

if [[ -z "$city" && ${#remaining_positionals[@]} -ge 1 ]]; then
  city="${remaining_positionals[0]}"
  remaining_positionals=("${remaining_positionals[@]:1}")
fi

if [[ -z "$province" && ${#remaining_positionals[@]} -ge 1 ]]; then
  province="${remaining_positionals[0]}"
  remaining_positionals=("${remaining_positionals[@]:1}")
fi

if ((${#remaining_positionals[@]} > 0)); then
  echo "error: too many positional arguments: ${remaining_positionals[*]}" >&2
  usage >&2
  exit 2
fi

city="${city:-Burlington}"

if [[ "$verbose" == "true" ]]; then
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
else
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
  mail_postal_code AS postal_code
FROM nar_addresses
WHERE lower(csd_eng_name) = lower(:'city')
  AND (:'province' = '' OR upper(mail_prov_abvn) = upper(:'province'))
ORDER BY random()
LIMIT 1;
SQL
fi
