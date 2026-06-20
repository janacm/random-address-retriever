#!/usr/bin/env bash
set -euo pipefail

PG_BIN="/opt/homebrew/opt/postgresql@16/bin"

# Postgres data lives on the external APFS SSD "FATRIOT". It is a normal
# removable volume (APFS, not ExFAT), so no sparseimage workaround is needed.
export PG_MOUNT="${PG_MOUNT:-/Volumes/FATRIOT}"
export PGDATA="${PGDATA:-$PG_MOUNT/postgres/data}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-55432}"
export PGDATABASE="${PGDATABASE:-random_address_retriever}"
export PGUSER="${PGUSER:-$(id -un)}"
export PATH="$PG_BIN:$PATH"
