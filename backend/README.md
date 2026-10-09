# Proctor Backend

NestJS API that receives and stores monitoring events from the Chrome extension.

## Stack

- NestJS 11 (REST)
- Prisma 6 → **PostgreSQL 16**
- Docker Compose for the whole stack (`docker/docker-compose.yml`)

## Data model

`Teacher → Course → Exam → StudentSession → Violation`

- **Teacher** — an instructor account (login); owns courses.
- **Course** — a course a teacher runs (name, year, section).
- **Exam** — an exam in a course; has a unique `joinCode`.
- **StudentSession** — one student's participation in an exam (created on register).
- **Violation** — a monitoring event belonging to a StudentSession.

See [../docs/DECISIONS.md](../docs/DECISIONS.md) for why the model and stack are shaped this way.

## Run it

**With Docker (recommended — matches production).** Full runbook in
[../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md). In short, from `docker/`:

```bash
cp .env.example .env          # set POSTGRES_PASSWORD, ADMIN_TOKEN, JWT_SECRET
docker compose up -d --build  # builds the dashboard + backend
curl http://127.0.0.1:3000/health
```

The dashboard is served at `/dashboard` (built into the image automatically).

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

The instructor dashboard at **`/dashboard`** is the primary UI; these endpoints back it (and the extension).

**Auth**

| Method & path | Purpose |
|---|---|
| `POST /auth/register` | 🔑 admin creates a teacher `{ email, name, password }` |
| `POST /auth/login` | teacher login `{ email, password }` → `{ token }` |
| `GET /auth/me` | 🎫 current teacher |

**Courses** (🎫 scoped to the logged-in teacher)

| Method & path | Purpose |
|---|---|
| `POST /courses` | create `{ name, year?, section? }` |
| `GET /courses` | list your courses |
| `GET /courses/:id` · `PATCH /courses/:id` · `DELETE /courses/:id` | read / update / delete |

**Exams** (🎫)

| Method & path | Purpose |
|---|---|
| `POST /exams` | create `{ courseId, title, examLink, maxWarnings?, expectedStudents?, startsAt?, endsAt? }` → `{ id, joinCode, ... }` |
| `GET /exams` | list your exams |
| `GET /exams/:id` | one exam |
| `PATCH /exams/:id` | settings `{ maxWarnings, disconnectGraceSec, awayGraceSec, autoClose, notifyStudent, expectedStudents, examLink }` |
| `GET /exams/:id/sessions` | students in an exam, with violation counts and flags |
| `GET /exams/:id/export?view=summary\|log&tz=<zone>` | CSV: per-student summary or full event log |
| `POST /exams/:id/status` | set status `{ status: OPEN \| CLOSED \| DRAFT }` |
| `DELETE /exams/:id` | delete one exam |
| `DELETE /exams` | 🔑 **dev wipe** — all exams/sessions/violations |

**Sessions** — student/extension (open) + instructor (🎫)

| Method & path | Purpose |
|---|---|
| `GET /health` | liveness check (open) |
| `POST /exams/:code/register` | student joins `{ studentName, studentId, extensionVersion }` → `{ sessionId, examTitle, examLink }` (open) |
| `POST /sessions/:id/heartbeat` | extension keep-alive, every 30s (open) |
| `POST /sessions/:id/violations` | record an event (open) |
| `POST /sessions/:id/end` | mark a session ENDED (open) |
| `GET /sessions/:id` · `GET /sessions/:id/violations` | 🎫 read a session / its events |
| `PATCH /sessions/:id` · `DELETE /sessions/:id` | 🎫 update / delete a session |

**Webhooks** (shared secret `WEBHOOK_SECRET`, used by the Google Forms Apps Script)

| Method & path | Purpose |
|---|---|
| `GET /webhooks/forms` | form tokens the script should watch |
| `POST /webhooks/form-submit` | a form was submitted → `SUBMISSION_CONFIRMED` on the student's session |

Auth legend: 🔑 = `x-admin-token` header (`ADMIN_TOKEN`); 🎫 = teacher token
(`Authorization: Bearer <token>` from `/auth/login`); open = no credential (the
extension). The 🎫 routes are scoped to the logged-in teacher — you only ever see
your own courses/exams/students.

Registration only succeeds while the exam is `OPEN`; a `CLOSED`/`DRAFT` exam
returns 409. There is no anonymous session creation — every session belongs to
an exam. Writing to an ended/unknown session returns 404 so the extension knows
to re-register.

Session lifecycle: no heartbeat for 90 s → `DISCONNECTED`; a heartbeat within
10 minutes resumes the same session (the gap is logged); otherwise it ends as
`TIMEOUT`. Events recorded while offline are buffered by the extension and sent
on reconnect. Exams close automatically at their end time (30 s server timer).
Full details: [../docs/MONITORING.md](../docs/MONITORING.md).

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
