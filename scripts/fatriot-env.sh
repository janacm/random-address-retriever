#!/usr/bin/env bash
# Shared environment for the FATRIOT-hosted benchmark setup.
# Both Postgres and DuckDB live directly on the external APFS volume so the
# DuckDB-vs-Postgres performance comparison runs against the same disk.
#
# Safe to `source` from bash or zsh; the setup scripts source it after their
# own `set -euo pipefail`, so this file intentionally does not set shell flags.

PG_BIN="/opt/homebrew/opt/postgresql@16/bin"

# macOS + Postgres 16: pin the locale so the postmaster does not go
# multithreaded during startup ("postmaster became multithreaded" FATAL).
# Matches the cluster's --locale=C.
export LC_ALL="${LC_ALL:-C}"
export LANG="${LANG:-C}"

export FATRIOT="${FATRIOT:-/Volumes/FATRIOT}"
export ADDR_DIR="${ADDR_DIR:-$FATRIOT/Addresses}"

# Postgres (data dir directly on FATRIOT, no sparseimage)
export PGDATA="${PGDATA:-$FATRIOT/postgres/data}"
export PG_LOGDIR="${PG_LOGDIR:-$FATRIOT/logs}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-55432}"
export PGDATABASE="${PGDATABASE:-random_address_retriever}"
export PGUSER="${PGUSER:-$(id -un)}"

# DuckDB (single database file on FATRIOT)
export DUCKDB_FILE="${DUCKDB_FILE:-$FATRIOT/duckdb/addresses.duckdb}"

export PATH="$PG_BIN:$PATH"
