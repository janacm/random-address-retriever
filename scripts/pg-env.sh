#!/usr/bin/env bash
# Shared environment for the external-SSD Postgres setup.
# Postgres data and the source CSVs live directly on an external APFS volume,
# so switching drives is just a matter of pointing DB_VOLUME at the new mount.
#
# Safe to `source` from bash or zsh; the setup scripts source it after their
# own `set -euo pipefail`, so this file intentionally does not set shell flags.

PG_BIN="/opt/homebrew/opt/postgresql@16/bin"

# macOS + Postgres 16: pin the locale so the postmaster does not go
# multithreaded during startup ("postmaster became multithreaded" FATAL).
# Matches the cluster's --locale=C.
export LC_ALL="${LC_ALL:-C}"
export LANG="${LANG:-C}"

# External volume that hosts the cluster + source CSVs. Override DB_VOLUME if
# you rename or swap the drive, e.g. DB_VOLUME=/Volumes/NewSSD scripts/pg.sh start.
export DB_VOLUME="${DB_VOLUME:-/Volumes/FATRIOT}"
export ADDR_DIR="${ADDR_DIR:-$DB_VOLUME/Addresses}"

# Postgres (data dir directly on the external volume, no sparseimage)
export PGDATA="${PGDATA:-$DB_VOLUME/postgres/data}"
export PG_LOGDIR="${PG_LOGDIR:-$DB_VOLUME/logs}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-55432}"
export PGDATABASE="${PGDATABASE:-random_address_retriever}"
export PGUSER="${PGUSER:-$(id -un)}"

export PATH="$PG_BIN:$PATH"
