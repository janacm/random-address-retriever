#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/db-env.sh"

mkdir -p "$ROOT_DIR/.postgres"

if [[ ! -e "$PG_IMAGE" ]]; then
  hdiutil create \
    -size "$PG_IMAGE_SIZE" \
    -type SPARSE \
    -fs APFS \
    -volname random-address-postgres \
    "$PG_IMAGE"
fi

if mount | awk '{print $3}' | grep -Fxq "$PG_MOUNT"; then
  exit 0
fi

hdiutil attach "$PG_IMAGE" -nobrowse

if ! mount | awk '{print $3}' | grep -Fxq "$PG_MOUNT"; then
  echo "Expected disk image to mount at $PG_MOUNT" >&2
  exit 1
fi
