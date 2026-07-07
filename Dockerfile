FROM node:24-alpine AS builder
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy lib and artifact manifests
COPY lib/ ./lib/
COPY artifacts/ ./artifacts/
COPY scripts/ ./scripts/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build TypeScript libs
RUN pnpm run typecheck:libs

# Build frontend (BASE_PATH=/ for production root deployment)
ENV BASE_PATH=/ PORT=3000 NODE_ENV=production
RUN pnpm --filter @workspace/leadgen run build

# Build API server bundle
RUN pnpm --filter @workspace/api-server run build

# ── Runtime image ──────────────────────────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app

# Copy the esbuild bundle (self-contained, no node_modules needed for the server)
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Copy the Vite-built frontend (served as static files by Express in production)
COPY --from=builder /app/artifacts/leadgen/dist/public ./artifacts/leadgen/dist/public

# pnpm workspace packages that are NOT bundled by esbuild need to be present
# (drizzle-orm pg driver is typically external)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

ENV NODE_ENV=production PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["node", "artifacts/api-server/dist/index.mjs"]
