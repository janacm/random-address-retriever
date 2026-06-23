#!/usr/bin/env bash
# Raw disk throughput: external SSD volume vs the internal Mac SSD.
#
# Both targets get the identical workload (sequential write, sequential read,
# 4 KiB random read) via scripts/disk_bench.py, which uses macOS F_NOCACHE so
# every pass hits the device instead of the buffer cache. No sudo / purge needed.
#
# Usage: scripts/disk-bench.sh
# Env:   SIZE_MB BLOCK_MB PASSES RAND_OPS (see disk_bench.py)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
source "$ROOT_DIR/scripts/pg-env.sh"

if [[ ! -d "$DB_VOLUME" ]]; then
  echo "Database volume not mounted at $DB_VOLUME" >&2
  exit 1
fi

# Internal SSD scratch dir (TMPDIR lives on the internal APFS Data volume);
# fall back to $HOME. The external scratch dir lives on the database volume.
INT_DIR="$(mktemp -d "${TMPDIR:-$HOME}/disk-bench.XXXXXX")"
EXT_DIR="$(mktemp -d "$DB_VOLUME/disk-bench.XXXXXX")"
trap 'rm -rf "$INT_DIR" "$EXT_DIR"' EXIT

export CSV="${CSV:-$ROOT_DIR/docs/disk-bench-results.csv}"

python3 "$ROOT_DIR/scripts/disk_bench.py" \
  "internal=$INT_DIR" \
  "external=$EXT_DIR"
