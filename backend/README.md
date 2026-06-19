# Proctor Backend

NestJS API + Socket.IO server. **Not yet connected to the extension** — this is the Week 2 scaffold.

## Stack

- NestJS 10 (REST + WebSocket)
- Prisma 5 → PostgreSQL 16
- Socket.IO (planned: real-time event stream to dashboard)
- Redis 7 (planned: pub/sub for multi-instance Socket.IO)

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Start Postgres + Redis from the repo root:

```bash
cd ../docker
docker compose up -d
```

Generate the Prisma client and run the first migration:

```bash
cd ../backend
npm run prisma:migrate -- --name init
```

## Run

```bash
npm run start:dev
```

Health check: <http://localhost:3000/health>

## Layout

```
backend/
├── prisma/
│   └── schema.prisma     placeholder schema — flesh out in Week 3+
├── src/
│   ├── main.ts           bootstrap, CORS, port
│   ├── app.module.ts     root module
│   └── app.controller.ts /health endpoint
├── .env.example
├── nest-cli.json
├── package.json
└── tsconfig.json
```
