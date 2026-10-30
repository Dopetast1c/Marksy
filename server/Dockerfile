# syntax=docker/dockerfile:1.7
# The server image (docs/running.md): the API, the planner and the collector, the backup service and every command
# (`marksy <command>`, server/src/cli/marksy.ts). Built only in GitHub Actions, for linux/amd64 and linux/arm64, from
# the repository root: docker build -f server/Dockerfile .
# Nothing private goes in: .dockerignore keeps out secrets, local data and the diary provider's fixtures, the bundle
# carries no test, and the image audit in CI checks the result.

# Node 22 LTS, pinned by version and digest (the multi-arch index): an update of the base is a change in this file
ARG NODE_IMAGE=node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c

FROM ${NODE_IMAGE} AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @marksy/server... --ignore-scripts
RUN pnpm --filter @marksy/server build

# the packages that stay outside the bundle, installed for this image's own architecture
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY --from=build /src/server/dist/package.json ./
RUN npm install --omit=dev --no-audit --no-fund --no-package-lock && npm cache clean --force

FROM ${NODE_IMAGE}
ARG MARKSY_VERSION=0.0.0
ARG MARKSY_COMMIT=dev
# the PostgreSQL 16 client for backups and restores, from the PostgreSQL project's own repository (Debian has 15)
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg; \
  echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list; \
  apt-get update; \
  apt-get install -y --no-install-recommends postgresql-client-16; \
  apt-get purge -y curl gnupg; \
  apt-get autoremove -y; \
  rm -rf /var/lib/apt/lists/* /root/.gnupg
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /src/server/dist/marksy.mjs ./dist/marksy.mjs
COPY --from=build /src/server/drizzle ./drizzle
COPY env.example ./env.example
RUN mkdir -p /data/uploads /backups && chown -R node:node /data /backups
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000 \
  UPLOADS_DIR=/data/uploads \
  BACKUP_DIR_IN_CONTAINER=/backups \
  MARKSY_MIGRATIONS_DIR=/app/drizzle \
  MARKSY_ENV_TEMPLATE=/app/env.example \
  MARKSY_VERSION=${MARKSY_VERSION} \
  MARKSY_COMMIT=${MARKSY_COMMIT}
LABEL org.opencontainers.image.title="marksy-server" \
  org.opencontainers.image.description="Marksy: the API, the collector, backups and commands" \
  org.opencontainers.image.source="https://github.com/Dopetast1c/Marksy" \
  org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0" \
  org.opencontainers.image.version="${MARKSY_VERSION}" \
  org.opencontainers.image.revision="${MARKSY_COMMIT}"
USER node
EXPOSE 3000
ENTRYPOINT ["node", "/app/dist/marksy.mjs"]
CMD ["serve"]
