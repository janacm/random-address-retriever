#!/usr/bin/env bash
set -euo pipefail

# Regenerates the Facts page data (apps/web/src/facts.generated.json) from the
# full local NAR import, so the page describes all 17M addresses rather than
# the hosted sample. Runs sql/facts.sql and pretty-prints its JSON output.
#
#   NAR_ZIP       NAR release zip; its Locations/*.csv files supply each
#                 building's CSD code and coordinates    (default tmp/nar-202507.zip)
#   NAR_RELEASE   release label stamped into the JSON    (default "July 2025")
#   FACTS_OUT     JSON file to write                     (default apps/web/src/facts.generated.json)
#   FACTS_WORK_MEM / FACTS_TEMP_BUFFERS
#                 session memory settings                (default 2GB / 4GB)
#
# The full database is only read: everything the SQL builds is a temp table in
# its own session. Postgres must already be running (./scripts/db-start.sh);
# this script only needs a connection, so it never starts or stops the
# cluster. A run takes about five minutes and the output is deterministic, so
# an unchanged import regenerates an identical file.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

NAR_ZIP="${NAR_ZIP:-$ROOT_DIR/tmp/nar-202507.zip}"
NAR_RELEASE="${NAR_RELEASE:-July 2025}"
FACTS_OUT="${FACTS_OUT:-$ROOT_DIR/apps/web/src/facts.generated.json}"
FACTS_WORK_MEM="${FACTS_WORK_MEM:-2GB}"
FACTS_TEMP_BUFFERS="${FACTS_TEMP_BUFFERS:-4GB}"

for tool in unzip node psql pg_isready; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool is required but was not found on PATH." >&2
    exit 1
  fi
done

if [[ ! -f "$NAR_ZIP" ]]; then
  echo "NAR zip not found at $NAR_ZIP. Set NAR_ZIP to the release zip." >&2
  exit 1
fi

if ! pg_isready -h "$PGHOST" -p "$PGPORT" -q; then
  echo "Postgres is not accepting connections at $PGHOST:$PGPORT." >&2
  echo "Start it with ./scripts/db-start.sh and try again." >&2
  exit 1
fi

# sql/facts.sql reads the zip through \copy FROM PROGRAM, whose shell sees
# this environment.
export NAR_ZIP

raw="$(mktemp)"
trap 'rm -f "$raw"' EXIT

echo "Computing facts from $PGDATABASE (full import) and $(basename "$NAR_ZIP")..."
PGOPTIONS="-c work_mem=$FACTS_WORK_MEM -c temp_buffers=$FACTS_TEMP_BUFFERS" \
  psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -X -q -v ON_ERROR_STOP=1 \
    -v release="$NAR_RELEASE" -f "$ROOT_DIR/sql/facts.sql" > "$raw"

node -e '
  const fs = require("node:fs");
  const [src, dst] = process.argv.slice(1);
  const facts = JSON.parse(fs.readFileSync(src, "utf8"));
  fs.writeFileSync(dst, JSON.stringify(facts, null, 2) + "\n");
' "$raw" "$FACTS_OUT"

echo "Wrote $FACTS_OUT ($(wc -c < "$FACTS_OUT" | tr -d ' ') bytes)."
