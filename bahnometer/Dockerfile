FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# Optional CA mount for proxied development builds. HA OS does not need it.
# All production dependencies are JavaScript/data; no native build scripts run.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
ARG BUILD_VERSION=2.0.0
ARG BUILD_ARCH=amd64
LABEL io.hass.name="Bahnometer" \
      io.hass.description="RE und RB zwischen Ingolstadt und Pfaffenhofen" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}" \
      org.opencontainers.image.source="https://github.com/CommanderReiker/Bahnometer"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chmod=0444 package.json server.js addon.js ./
COPY --chmod=0555 lib ./lib
COPY --chmod=0555 public ./public
COPY --chmod=0555 scripts ./scripts
EXPOSE 8099
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8099/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "addon.js"]
