# syntax=docker/dockerfile:1.7
# The web image (docs/running.md): the built PWA, served by Caddy, and the reverse proxy in front of the whole stack;
# the role is the command: `web` or `proxy`. One build for any BASE_PATH: the PWA is built with a placeholder base that
# the entry point replaces when the container starts. Built only in GitHub Actions, from the repository root:
# docker build -f web/Dockerfile .

# pinned by version and digest (multi-arch indexes): an update of a base is a change in this file
ARG NODE_IMAGE=node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c
ARG CADDY_IMAGE=caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d

FROM ${NODE_IMAGE} AS build
ARG MARKSY_VERSION=0.0.0
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @marksy/web... --ignore-scripts
RUN MARKSY_VERSION=${MARKSY_VERSION} pnpm --filter @marksy/web build

FROM ${CADDY_IMAGE}
ARG MARKSY_VERSION=0.0.0
ARG MARKSY_COMMIT=dev
RUN addgroup -S -g 1000 marksy && adduser -S -u 1000 -G marksy marksy
COPY --from=build /src/web/dist /srv/app
COPY docker/web/web.Caddyfile /etc/marksy/web.Caddyfile
COPY docker/web/updating.html /srv/proxy/updating.html
COPY docker/web/extra.caddy /etc/marksy/extra/README.caddy
COPY --chmod=0755 docker/web/entrypoint.sh /usr/local/bin/marksy-web
ENV XDG_CONFIG_HOME=/tmp/caddy/config \
  XDG_DATA_HOME=/tmp/caddy/data \
  MARKSY_VERSION=${MARKSY_VERSION} \
  MARKSY_COMMIT=${MARKSY_COMMIT}
LABEL org.opencontainers.image.title="marksy-web" \
  org.opencontainers.image.description="Marksy: the web app and the reverse proxy" \
  org.opencontainers.image.source="https://github.com/Dopetast1c/Marksy" \
  org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0" \
  org.opencontainers.image.version="${MARKSY_VERSION}" \
  org.opencontainers.image.revision="${MARKSY_COMMIT}"
USER marksy
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/marksy-web"]
CMD ["web"]
