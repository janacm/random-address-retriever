#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"

export PG_IMAGE="${PG_IMAGE:-$ROOT_DIR/.postgres/random-address-postgres.sparseimage}"
export PG_IMAGE_SIZE="${PG_IMAGE_SIZE:-80g}"
export PG_MOUNT="${PG_MOUNT:-/Volumes/random-address-postgres}"
export PGDATA="${PGDATA:-$PG_MOUNT/data}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-55432}"
export PGDATABASE="${PGDATABASE:-random_address_retriever}"
export PGUSER="${PGUSER:-$(id -un)}"
export PATH="$PG_BIN:$PATH"
