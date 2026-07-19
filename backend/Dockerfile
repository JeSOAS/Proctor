# Proctor image — builds the React dashboard AND the NestJS backend, and the
# backend serves the built dashboard at /dashboard.
#
# Built from the REPO ROOT context so it can see both folders
# (see docker/docker-compose.yml: build.context = .. , dockerfile = backend/Dockerfile).

# --- Stage 1: build the dashboard ---
FROM node:22-bookworm-slim AS dashboard
WORKDIR /dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build          # -> /dashboard/dist

# --- Stage 2: backend (serves the dashboard) ---
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend deps against the committed lockfile (reproducible).
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Generate the Prisma client, then build the Nest app.
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/ ./
RUN npm run build

# Copy the built dashboard in and point the backend at it.
COPY --from=dashboard /dashboard/dist ./dashboard-dist
ENV DASHBOARD_DIST=/app/dashboard-dist

ENV NODE_ENV=production
EXPOSE 3000

# Apply pending migrations, then start. Fresh DB → creates all tables.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
