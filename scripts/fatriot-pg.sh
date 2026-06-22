#!/usr/bin/env bash
# Start / stop the FATRIOT-hosted Postgres cluster.
#
# This is the lightweight day-to-day control for the cluster that
# scripts/fatriot-pg-setup.sh initializes and loads. It only manages the
# server process; it does not touch data. Runtime tuning persists in
# postgresql.auto.conf, so a plain start picks it up automatically.
#
# Usage:
#   scripts/fatriot-pg.sh start     # start if not already running
#   scripts/fatriot-pg.sh stop      # fast shutdown
#   scripts/fatriot-pg.sh restart   # stop (if running) then start
#   scripts/fatriot-pg.sh status    # report pg_ctl status
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/fatriot-env.sh"

usage() {
  echo "Usage: $(basename "$0") {start|stop|restart|status}" >&2
  exit 2
}

require_volume() {
  if [[ ! -d "$FATRIOT" ]]; then
    echo "FATRIOT volume is not mounted at $FATRIOT" >&2
    exit 1
  fi
}

start_pg() {
  require_volume
  if [[ ! -d "$PGDATA/base" ]]; then
    echo "No Postgres cluster at $PGDATA." >&2
    echo "Run scripts/fatriot-pg-setup.sh first to initialize it." >&2
    exit 1
  fi
  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "Postgres already running at postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
    return 0
  fi
  mkdir -p "$PG_LOGDIR"
  pg_ctl -D "$PGDATA" -l "$PG_LOGDIR/postgres.log" -o "-p $PGPORT -k /tmp" start
  echo "Postgres started at postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
}

stop_pg() {
  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    pg_ctl -D "$PGDATA" stop -m fast
    echo "Postgres stopped."
  else
    echo "Postgres is not running."
  fi
}

case "${1:-}" in
  start)   start_pg ;;
  stop)    stop_pg ;;
  restart) stop_pg; start_pg ;;
  status)  pg_ctl -D "$PGDATA" status ;;
  *)       usage ;;
esac
