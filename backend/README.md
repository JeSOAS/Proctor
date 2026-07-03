# Proctor Backend

NestJS API that receives and stores monitoring events from the Chrome extension.

## Stack

- NestJS 11 (REST)
- Prisma 6 → **SQLite** for local development (file at `prisma/dev.db`, zero install)
- Production (Linux VM): switch the Prisma provider to `postgresql` and use
  `docker/docker-compose.yml` (PostgreSQL 16 + Redis 7)

## Setup

```bash
cd backend
npm install
cp .env.example .env
npm run prisma:migrate   # creates prisma/dev.db and applies migrations
```

## Run

```bash
npm run start:dev
```

Health check: <http://localhost:3000/health>

## API

| Method & path | Purpose |
|---|---|
| `GET /health` | liveness check |
| `POST /sessions` | start a monitoring session → returns `{ id, ... }` |
| `GET /sessions` | list sessions with violation counts (auto-ends stale ones) |
| `DELETE /sessions` | **dev helper** — wipe all sessions + violations |
| `POST /sessions/:id/end` | mark a session ENDED |
| `POST /sessions/:id/heartbeat` | extension keep-alive; sent every 30s |
| `POST /sessions/:id/violations` | record an event `{ type, url?, payload?, occurredAt? }` |
| `GET /sessions/:id/violations` | list a session's events in order |

Sessions whose heartbeat is older than 90 s are automatically marked ENDED when
listed — Chrome kills the extension's service worker on browser close without
any event to report from, so "the beats stopped" is how we detect it.

### Known limitation — unstable internet (fine locally, must be fixed before real use)

The heartbeat cannot distinguish "browser closed" from "network dropped". On a
connection outage longer than 90 s:

1. the session is falsely marked ENDED and a new one is created on reconnect
   (one student's exam splits into several sessions);
2. worse, every event during the outage is **dropped** — `report()` in
   `background.js` currently just logs "event lost".

Everything runs on localhost for now, so neither can happen. Before the
extension talks to a remote server, the connected phase needs:

- **Offline buffering**: queue unsent events in `chrome.storage.local` and
  flush on reconnect. Violations already carry a client-side `occurredAt`, so
  late-delivered events still land at the correct time in the log.
- **A `DISCONNECTED` status** distinct from `ENDED`, so the dashboard shows
  "connection lost" (itself suspicious) instead of "exam finished".
- Longer term, Socket.IO presence (planned for the real-time phase) replaces
  heartbeat inference with instant connect/disconnect events, including
  reconnect handling.

## Clearing recorded data

- Wipe rows, keep schema: `curl -X DELETE http://localhost:3000/sessions`
- Edit/delete individual rows: `npm run prisma:studio`
- Full reset (drop + recreate + re-apply migrations): `npx prisma migrate reset`

## Useful commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | dev server with watch mode |
| `npm run prisma:migrate` | create/apply migrations from schema.prisma |
| `npm run prisma:studio` | browse the database in a web UI |
