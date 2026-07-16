# Proctor Backend

NestJS API that receives and stores monitoring events from the Chrome extension.

## Stack

- NestJS 11 (REST)
- Prisma 6 → **PostgreSQL 16**
- Docker Compose for the whole stack (`docker/docker-compose.yml`)

## Data model

- **Exam** — an instructor-created exam session; has a unique `joinCode`.
- **StudentSession** — one student's participation in an exam (created on register).
- **Violation** — a monitoring event belonging to a StudentSession.

See [../docs/DECISIONS.md](../docs/DECISIONS.md) for why the model and stack are shaped this way.

## Run it

**With Docker (recommended — matches production).** Full runbook in
[../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md). In short, from `docker/`:

```bash
cp .env.example .env          # set POSTGRES_PASSWORD and ADMIN_TOKEN
docker compose up -d --build
curl http://127.0.0.1:3000/health
```

**Without Docker** (needs a reachable PostgreSQL):

```bash
cd backend
npm install
cp .env.example .env          # set DATABASE_URL to your Postgres
npm run prisma:migrate        # apply migrations
npm run start:dev
```

Health check: <http://localhost:3000/health>

## API

**Exams (instructor side)**

| Method & path | Purpose |
|---|---|
| `POST /exams` | create an exam `{ title, maxWarnings? }` → returns `{ id, joinCode, ... }` |
| `GET /exams` | list exams with student-session counts |
| `GET /exams/:id` | one exam (auto-ends stale sessions first) |
| `GET /exams/:id/sessions` | students registered in an exam, with violation counts |
| `POST /exams/:id/status` | set exam status `{ status: OPEN \| CLOSED \| DRAFT }` |
| `DELETE /exams` | **dev helper** — wipe all exams, sessions, violations |

🔒 The instructor endpoints above require an `x-admin-token` header matching
`ADMIN_TOKEN` whenever that is set (always set it in production). The student
endpoints below are intentionally open — the extension calls them with no credential.

**Registration + session lifecycle (student side / extension)**

| Method & path | Purpose |
|---|---|
| `GET /health` | liveness check |
| `POST /exams/:code/register` | student joins with a join code `{ studentName, studentId? }` → returns `{ sessionId, examTitle, maxWarnings }` |
| `POST /sessions/:id/heartbeat` | extension keep-alive; sent every 30s |
| `POST /sessions/:id/violations` | record an event `{ type, url?, payload?, occurredAt? }` |
| `GET /sessions/:id/violations` | list a session's events in order |
| `POST /sessions/:id/end` | mark a session ENDED |
| `GET /sessions/:id` | 🔒 read one session (student info, status, exam, counts) |
| `PATCH /sessions/:id` | 🔒 update `{ studentName?, studentId?, status? }` |
| `DELETE /sessions/:id` | 🔒 delete a session + its violations |

The 🔒 session routes are instructor CRUD and require the `x-admin-token`. Student
info (name, ID) lives on the session record, so these cover both. "Create" is
registration (`POST /exams/:code/register`).

Registration only succeeds while the exam is `OPEN`; a `CLOSED`/`DRAFT` exam
returns 409. There is no anonymous session creation — every session belongs to
an exam. Writing to an ended/unknown session returns 404 so the extension knows
to re-register.

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

- Wipe rows, keep schema: `curl -X DELETE http://localhost:3000/exams -H "x-admin-token: $ADMIN_TOKEN"`
- Edit/delete individual rows: `npm run prisma:studio`
- Full reset (drop + recreate + re-apply migrations): `npx prisma migrate reset`

## Useful commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | dev server with watch mode |
| `npm run prisma:migrate` | create/apply migrations from schema.prisma |
| `npm run prisma:studio` | browse the database in a web UI |
