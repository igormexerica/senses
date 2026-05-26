FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

# Instala deps primeiro pra aproveitar cache
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# Diretórios persistentes (montados como volume em runtime)
RUN mkdir -p /data/playwright-state /data/playwright-failures \
  && chown -R pwuser:pwuser /data /app

USER pwuser

ENV NODE_ENV=production
CMD ["node", "dist/worker.js"]
