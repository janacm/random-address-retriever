#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

# The Postgres data directory lives on the external APFS SSD mounted at
# $PG_MOUNT. It is a normal removable volume, so just verify it is attached
# (no sparseimage to create or hdiutil-attach).
if ! mount | awk '{print $3}' | grep -Fxq "$PG_MOUNT"; then
  echo "Expected the Postgres drive to be mounted at $PG_MOUNT." >&2
  echo "Plug in the drive, or set PG_MOUNT/PGDATA, and try again." >&2
  exit 1
fi
