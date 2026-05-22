# syntax=docker/dockerfile:1.7

# ─── deps stage ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Apenas package.json + lock pra cache de camada
COPY package.json package-lock.json ./
# Instala TODAS as deps (tsx está em dependencies, não devDependencies)
RUN npm ci --omit=dev --no-audit --no-fund

# ─── runtime stage ──────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Curl pro HEALTHCHECK
RUN apk add --no-cache curl tini

# node_modules de deps + source
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV API_PORT=3000
ENV API_HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/v1/health || exit 1

# tini = init PID 1 (lida com SIGTERM/SIGINT corretamente)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/api/server.ts"]
