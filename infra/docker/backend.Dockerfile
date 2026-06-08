# ---- Stage 1: Builder ----
FROM node:22-slim AS builder

WORKDIR /usr/src/app

# Build args (proxy / registry)
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG http_proxy
ARG https_proxy
ARG no_proxy

# System deps (openssl + CA) for Prisma and HTTPS
RUN set -eux; \
  for i in 1 2 3 4 5; do \
    apt-get update -y && break || (echo "apt-get update failed, retry $i" && sleep 3); \
  done; \
  apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client; \
  rm -rf /var/lib/apt/lists/*

# Proxy env reset - clear any injected proxy variables before npm
ENV HTTP_PROXY= \
    HTTPS_PROXY= \
    NO_PROXY= \
    http_proxy= \
    https_proxy= \
    no_proxy=

# Prefer IPv4 DNS resolution inside container to reduce ECONNRESET
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

# NPM network hardening (default registry when empty)
RUN unset HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy || true \
  && npm config delete proxy || true \
  && npm config delete https-proxy || true \
  && npm config delete registry || true \
  && npm config set registry ${NPM_REGISTRY} \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-factor 3 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 180000 \
  && npm config set fetch-timeout 600000 \
  && npm config set prefer-online true \
  && npm config set progress false \
  && npm config set audit false \
  && npm config set fund false

# Clear npm-specific proxy env (in addition to HTTP_PROXY*)
ENV npm_config_proxy= \
    npm_config_https_proxy= \
    npm_config_noproxy=

COPY package*.json ./

# Install all deps (including dev) for build
RUN --mount=type=cache,target=/root/.npm \
  unset HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy || true; \
  if [ -f package-lock.json ]; then npm ci --include=dev --legacy-peer-deps --prefer-online --no-progress; else npm install; fi

COPY prisma ./prisma
COPY . .

# Build script already runs `prisma generate`
RUN set -eux; \
  for i in 1 2 3 4 5; do \
    npm run build && break || (echo "npm run build failed (retry $i)"; sleep 8); \
  done

# ---- Stage 2: Runtime ----
FROM node:22-slim

WORKDIR /usr/src/app

# System deps for runtime
RUN set -eux; \
  for i in 1 2 3 4 5; do \
    apt-get update -y && break || (echo "apt-get update failed, retry $i" && sleep 3); \
  done; \
  apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client curl; \
  rm -rf /var/lib/apt/lists/*

# Reuse proxy / registry config in runtime (default registry when empty)
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config delete registry || true \
  && npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 300000 \
  && npm config set audit false \
  && npm config set fund false

COPY package*.json ./

# Production dependencies:
# Bazı ortamlarda npm ci sırasında ERR_INVALID_URL
# hatası oluştuğu için, runtime imajında ikinci kez
# npm kurulumunu atlıyoruz ve builder'dan kopyalıyoruz.
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Prisma schema + generate client for runtime
COPY --from=builder /usr/src/app/prisma ./prisma
RUN npx prisma generate

# Copy compiled application and start script
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/src/application/services/content-safety/prompts ./dist/application/services/content-safety/prompts
COPY --from=builder /usr/src/app/src/infrastructure/email/templates ./dist/infrastructure/email/templates
COPY docker/app/start.sh ./start.sh
RUN chmod +x ./start.sh

ENV NODE_ENV=production

# Non-root user for better security
# /backups: pg_dump çıktısının yazıldığı dizin. appuser yazabilsin diye image'da
# oluşturulup chown edilir; named volume ilk mount'ta bu sahipliği devralır
# (aksi halde root-owned mount'a appuser yazamaz → mkdir/yazma EACCES).
RUN useradd -m appuser && mkdir -p /usr/src/app/uploads /backups && chown -R appuser:appuser /usr/src/app/uploads /backups
USER appuser

EXPOSE 3000

CMD ["./start.sh"]
