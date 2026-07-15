# Proctor backend image.
# Single stage kept deliberately simple for handoff: the Prisma CLI (a
# devDependency) stays available so `prisma migrate deploy` can run at startup.
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies against the committed lockfile (reproducible builds).
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client, then build the Nest app.
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Apply any pending migrations, then start the server. If the DB is a fresh
# volume this creates all tables; on restarts it is a no-op.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
