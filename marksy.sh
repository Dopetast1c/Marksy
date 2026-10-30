#!/bin/sh
# Marksy on a host with only Docker (docs/running.md): every operation is a command here, run in the folder that holds
# docker-compose.prod.yml and .env.production. Windows has the same commands in marksy.ps1.
#   ./marksy.sh up | stop | pull | ps | logs [service] | status
#   ./marksy.sh backup | restore <file in BACKUP_DIR> [--without-demo] [--replace --yes]
#   ./marksy.sh sync enable|disable | check-network | connect | tunnel on|off
#   ./marksy.sh update status | history [n] | pause | resume | now [--to X.Y.Z]
#   ./marksy.sh init-env [--credentials-key-from <file>] [--tz <zone>] [--show-hook-secret]
set -eu
cd "$(dirname "$0")"

ENV_FILE=.env.production
setting() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -n 1; }

compose() {
  files="-f docker-compose.prod.yml"
  if [ -n "$(setting MACVLAN_ADDRESS)" ]; then files="$files -f docker-compose.macvlan.yml"; fi
  # shellcheck disable=SC2086
  docker compose --env-file "$ENV_FILE" $files "$@"
}

need_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "No $ENV_FILE here: create it first with ./marksy.sh init-env (docs/running.md)" >&2
    exit 2
  fi
}

command="${1:-help}"
[ $# -gt 0 ] && shift

case "$command" in
  init-env)
    channel="${UPDATE_CHANNEL:-$(setting UPDATE_CHANNEL)}"
    docker run --rm -v "$PWD:/work" "ghcr.io/dopetast1c/marksy-server:${channel:-1}" init-env "/work/$ENV_FILE" "$@"
    ;;
  up) need_env; compose up -d "$@" ;;
  stop) need_env; compose stop "$@" ;;
  pull) need_env; compose pull "$@" ;;
  ps) need_env; compose ps ;;
  logs) need_env; compose logs --tail 200 -f "$@" ;;
  status)
    need_env
    compose ps
    compose exec server node /app/dist/marksy.mjs status
    compose exec updater marksy-updater status
    ;;
  update)
    need_env
    case "${1:-status}" in
      status | history | pause | resume | now) ;;
      *) echo "update status|history [n]|pause|resume|now [--to X.Y.Z]" >&2; exit 2 ;;
    esac
    [ $# -eq 0 ] && set -- status
    compose exec updater marksy-updater "$@"
    ;;
  backup) need_env; compose exec server node /app/dist/marksy.mjs backup ;;
  restore)
    need_env
    if [ $# -lt 1 ]; then
      echo "restore <file>: a path inside BACKUP_DIR, e.g. daily/marksy-2026-10-29T03-30-00Z-daily-1.0.0.dump" >&2
      exit 2
    fi
    file="$1"
    shift
    # the updater too: no update may start while the database is replaced
    compose stop updater server backup
    compose run --rm --no-deps server restore "/backups/$file" "$@"
    compose up -d
    ;;
  sync) need_env; compose exec server node /app/dist/marksy.mjs sync "$@" ;;
  check-network) need_env; compose exec server node /app/dist/marksy.mjs check-network ;;
  seed) need_env; compose exec server node /app/dist/marksy.mjs seed "$@" ;;
  connect)
    need_env
    compose run --rm --no-deps -e DIARY_LOGIN -e DIARY_PASSWORD -e MARKSY_DEV_EMAIL -e MARKSY_DEV_PASSWORD server connect "$@"
    ;;
  tunnel)
    need_env
    case "${1:-}" in
      on) docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml --profile tunnel up -d cloudflared ;;
      off) docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml --profile tunnel stop cloudflared ;;
      *) echo "tunnel on|off" >&2; exit 2 ;;
    esac
    ;;
  *)
    sed -n '2,9p' "$0"
    ;;
esac
