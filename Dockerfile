# ── 1. Build de la PWA (Vue + Vite + PGlite) ─────────────────────
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json pwa-assets.config.ts ./
COPY public public
COPY src src
# La PWA synchronise avec l'API servie sur la même origine.
ENV VITE_SYNC_URL=/api
RUN npm run build

# ── 2. Image d'exécution : API Fastify qui sert aussi la PWA ─────
FROM node:24-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    CLIENT_DIST=/app/dist
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/src src
COPY server/migrations migrations
COPY --from=build /app/dist /app/dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/index.js"]
