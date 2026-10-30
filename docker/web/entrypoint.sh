#!/bin/sh
# The web image's entry point (docs/running.md): `web` serves the PWA at BASE_PATH, `proxy` is the reverse proxy in
# front of the stack. Both read their settings from the environment when the container starts, so switching between
# the ways in (options A to D) is a change of .env.production and a restart.
set -eu

role="${1:-web}"

# BASE_PATH as one form: "" for the root, "/marksy" for a path; anything but a plain path is refused
base="${BASE_PATH:-/}"
base="$(printf '%s' "$base" | sed -e 's#^/*##' -e 's#/*$##')"
if [ -n "$base" ]; then
  case "$base" in
    *[!A-Za-z0-9._/-]* | */ | *//*) echo "BASE_PATH must be a plain path such as /marksy" >&2; exit 2 ;;
  esac
  base="/$base"
fi

mkdir -p /tmp/caddy

case "$role" in
  web)
    # the PWA was built with a placeholder base: a copy with this BASE_PATH in every address
    rm -rf /tmp/srv
    cp -R /srv/app /tmp/srv
    find /tmp/srv -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.webmanifest' \) \
      -exec sed -i "s#/__MARKSY_BASE__/#${base}/#g" {} +
    exec caddy run --config /etc/marksy/web.Caddyfile --adapter caddyfile
    ;;

  proxy)
    subnet="${MARKSY_EDGE_SUBNET:-172.30.57.0/24}"
    extra="${PROXY_TRUSTED_EXTRA:-}"
    hook="${UPDATE_HOOK_UPSTREAM:-}"
    {
      echo "{"
      echo "  admin off"
      echo "  auto_https off"
      echo "  persist_config off"
      echo "  servers {"
      # forwarded headers are believed only from cloudflared on the compose network and an optional proxy in front
      echo "    trusted_proxies static ${subnet} ${extra}"
      echo "  }"
      echo "}"
      echo ""
      echo "(marksy) {"
      echo "  header -Server"
      echo "  handle /_marksy/proxy-health {"
      echo "    respond \"ok\" 200"
      echo "  }"
      if [ -n "$hook" ]; then
        echo "  handle /_marksy/update-hook {"
        echo "    reverse_proxy ${hook}"
        echo "  }"
      fi
      echo "  handle ${base}/api/* {"
      [ -n "$base" ] && echo "    uri strip_prefix ${base}"
      echo "    reverse_proxy server:3000 {"
      echo "      lb_try_duration 30s"
      echo "      lb_try_interval 500ms"
      echo "    }"
      echo "  }"
      if [ -n "$base" ]; then
        echo "  redir ${base} ${base}/ 308"
        echo "  handle ${base}/* {"
        echo "    uri strip_prefix ${base}"
      else
        echo "  handle {"
      fi
      echo "    reverse_proxy web:8080 {"
      echo "      lb_try_duration 30s"
      echo "      lb_try_interval 500ms"
      echo "    }"
      echo "  }"
      if [ -n "$base" ]; then
        # nothing personal at the host's root: it points to the app, and every other path is free for other services
        echo "  handle / {"
        echo "    redir * ${base}/ 302"
        echo "  }"
        echo "  import /etc/marksy/extra/*.caddy"
        echo "  handle {"
        echo "    respond 404"
        echo "  }"
      fi
      echo "  handle_errors 502 503 504 {"
      echo "    root * /srv/proxy"
      echo "    rewrite * /updating.html"
      echo "    header Cache-Control no-store"
      echo "    file_server {"
      echo "      status 503"
      echo "    }"
      echo "  }"
      echo "}"
      echo ""
      # 8080 is published on the host (options A, C, D); 80 is the proxy's own address on the home network (option B,
      # docker-compose.macvlan.yml). Docker lets a container's user open low ports inside its own network.
      if [ -n "${PROXY_HOST:-}" ]; then
        echo "http://${PROXY_HOST}:8080, http://${PROXY_HOST}:80 {"
        echo "  import marksy"
        echo "}"
        echo ""
      fi
      echo ":8080, :80 {"
      echo "  import marksy"
      echo "}"
    } > /tmp/caddy/proxy.Caddyfile
    exec caddy run --config /tmp/caddy/proxy.Caddyfile --adapter caddyfile
    ;;

  *)
    echo "usage: marksy-web web|proxy" >&2
    exit 2
    ;;
esac
