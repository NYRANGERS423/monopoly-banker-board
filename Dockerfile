# --- Stage 1: install deps + build everything ---
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install

COPY shared ./shared
COPY server ./server
COPY client ./client

RUN npm run build
RUN npm prune --omit=dev --workspaces

# --- Stage 2: runtime ---
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/src/db/schema.sql ./server/dist/db/schema.sql
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000
VOLUME ["/app/data"]
ENV PORT=3000 HOST=0.0.0.0 DB_PATH=/app/data/banker.db

CMD ["node", "server/dist/index.js"]
