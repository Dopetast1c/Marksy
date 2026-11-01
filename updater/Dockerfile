# syntax=docker/dockerfile:1.7
# The updater image (docs/running.md, updates): the updater service, the socket guard and the swap container; the role
# is the command. Built only in GitHub Actions, for linux/amd64 and linux/arm64, from the repository root:
# docker build -f updater/Dockerfile .

ARG NODE_IMAGE=node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c

FROM ${NODE_IMAGE} AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @marksy/updater... --ignore-scripts
RUN pnpm --filter @marksy/updater build

# cosign checks the signatures of every image before an update; the same version signs them in release.yml.
# Pinned by version and by the checksums of the sigstore release (cosign_checksums.txt).
FROM scratch AS cosign-amd64
ADD --checksum=sha256:4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71 \
  https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64 /cosign
FROM scratch AS cosign-arm64
ADD --checksum=sha256:c5d324e091826b0d7a78eb16fef316450b4eb9aaec045611c08ba06f5e73220a \
  https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-arm64 /cosign
ARG TARGETARCH
FROM cosign-${TARGETARCH} AS cosign

FROM ${NODE_IMAGE}
ARG MARKSY_VERSION=0.0.0
ARG MARKSY_COMMIT=dev
COPY --from=cosign --chmod=0755 /cosign /usr/local/bin/cosign
COPY --from=build /src/updater/dist/marksy-updater.mjs /app/marksy-updater.mjs
RUN printf '#!/bin/sh\nexec node /app/marksy-updater.mjs "$@"\n' > /usr/local/bin/marksy-updater \
  && chmod 0755 /usr/local/bin/marksy-updater \
  && mkdir -p /state && chown node:node /state
ENV NODE_ENV=production \
  UPDATE_STATE_DIR=/state \
  HOME=/state \
  MARKSY_VERSION=${MARKSY_VERSION} \
  MARKSY_COMMIT=${MARKSY_COMMIT}
LABEL org.opencontainers.image.title="marksy-updater" \
  org.opencontainers.image.description="Marksy: installs signed releases, with a backup before and a rollback" \
  org.opencontainers.image.source="https://github.com/Dopetast1c/Marksy" \
  org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0" \
  org.opencontainers.image.version="${MARKSY_VERSION}" \
  org.opencontainers.image.revision="${MARKSY_COMMIT}"
USER node
EXPOSE 8090
ENTRYPOINT ["node", "/app/marksy-updater.mjs"]
CMD ["updater"]
