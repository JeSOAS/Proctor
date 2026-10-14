# Proctor — Architecture cheat sheet (module by module)

Technical reference for every module of the system, with links to the source files.
Paths are relative to this file (`docs/`), so the links work on GitHub and in VS Code.
Line counts and constants are as of extension 1.2.2 (October 2026).

**Contents**

1. [System at a glance](#1-system-at-a-glance)
2. [Chrome extension](#2-chrome-extension) — manifest, popup, background worker, content script
3. [Edge and hosting](#3-edge-and-hosting) — Cloudflare, Docker Compose, Dockerfile, deploy script, environment
4. [Backend core](#4-backend-core) — bootstrap, app module, rate limiter, health
5. [Auth module](#5-auth-module)
6. [Courses module](#6-courses-module)
7. [Exams module](#7-exams-module) — exam CRUD, join codes, student registration, expiry, CSV
8. [Sessions module](#8-sessions-module) — heartbeat, events, disconnect lifecycle, warnings, auto-close
9. [Classifier](#9-classifier-commonconcerningts) — what counts as a violation
10. [Domain lists](#10-domain-lists)
11. [Webhooks module + Google Apps Script](#11-webhooks-module--google-apps-script)
12. [Database (Prisma / PostgreSQL)](#12-database-prisma--postgresql)
13. [Dashboard (React)](#13-dashboard-react)
14. [Event catalogue](#14-event-catalogue)
15. [Timers and thresholds](#15-timers-and-thresholds)
16. [HTTP API reference](#16-http-api-reference)
17. [Known limits and where they live](#17-known-limits-and-where-they-live)

---

## 1. System at a glance

```
 Student laptop (Chrome)                Instructor browser            Admin (curl)
 ┌───────────────────────────┐          ┌──────────────────┐          ┌──────────────┐
 │ Proctor extension (MV3)   │          │ Dashboard (React)│          │ x-admin-token│
 │ popup · background · page │          └────────┬─────────┘          └──────┬───────┘
 └────────────┬──────────────┘                   │ HTTPS + JWT               │ HTTPS
              │ HTTPS (no auth, session id)      │                           │
              ▼                                  ▼                           ▼
        ┌──────────────────── Cloudflare (DNS, TLS, DDoS) ────────────────────┐
        └──────────────────────────────┬──────────────────────────────────────┘
                                       │ Cloudflare Tunnel (outbound from the VM)
 Google Forms + Apps Script ──────────►│ (POST /webhooks/form-submit, x-webhook-secret)
                                       ▼
   Oracle Cloud VM · Ubuntu 24.04 · Docker Compose · no open inbound ports
   ┌────────────┐   ┌──────────────────────────────────────────┐   ┌──────────────┐
   │ cloudflared│──►│ NestJS backend  127.0.0.1:3000           │──►│ PostgreSQL 16│
   └────────────┘   │ RealIpThrottlerGuard (global)            │   │ (no ports)   │
                    │ Auth · Courses · Exams · Sessions ·      │   └──────────────┘
                    │ Webhooks · common/ classifier · Prisma   │
                    │ ServeStatic: /dashboard (built React)    │
                    └──────────────────────────────────────────┘
```

**Design rule that explains most of the code:** the extension *records* raw events; the backend
*decides* what counts, at read time, with one classifier ([concerning.ts](../backend/src/common/concerning.ts)).
Counts are never stored, so changing an exam setting re-evaluates every past event.

**Trust boundaries**

| Caller | Authenticated by | Endpoints |
|---|---|---|
| Extension (student) | nothing but the session id (cuid) returned at join | `POST /exams/:code/register`, `POST /sessions/:id/{heartbeat,violations,end}` |
| Dashboard (teacher) | JWT `Authorization: Bearer …` (12 h) | everything under `/courses`, `/exams`, `/sessions` that reads or edits |
| Administrator | `x-admin-token` header = `ADMIN_TOKEN` | `POST /auth/register`, `DELETE /exams` |
| Google Apps Script | `x-webhook-secret` header = `WEBHOOK_SECRET` | `GET /webhooks/forms`, `POST /webhooks/form-submit` |

---

## 2. Chrome extension

Folder: [extension/](../extension/) — plain JavaScript, Manifest V3, no build step (the Web Store
reviews exactly the code in the repo). Version **1.2.3** in the repo (1.2.2 is the version approved on the Chrome Web Store).

### 2.1 Manifest — [manifest.json](../extension/manifest.json)

| Key | Value | Why |
|---|---|---|
| `permissions` | `tabs`, `windows`, `storage`, `alarms`, `notifications`, `idle`, `scripting` | tab/window events, state, heartbeat timer, desktop warnings, idle detection, injecting the warning banner |
| `host_permissions` | `<all_urls>` | read tab URLs and inject the banner on any page |
| `background.service_worker` | `background.js` | event recorder (MV3 worker: can be stopped by Chrome at any time) |
| `content_scripts` | `content.js` on `<all_urls>`, `run_at: document_start`, `all_frames: false` | in-page events; top frame only, so iframes are not covered |
| `action.default_popup` | `popup.html` | join form |

The API base is hard-coded as `https://proctor.jesoas.org` in **both** `background.js` and `popup.js`
(`DEFAULT_API_BASE`) and can be overridden at runtime with `chrome.storage.local.apiBase`.

### 2.2 Popup — [popup.html](../extension/popup.html) · [popup.js](../extension/popup.js)

Two views: the join form, and an "active" view once joined (exam title, student name, exam link,
**Open exam**, **Leave**, a link to the extension's own settings page).

`join()` step by step:

1. Validates name, student ID and join code (code upper-cased).
2. `chrome.extension.isAllowedIncognitoAccess()` → if false, shows the incognito help and refuses
   ("Allow Proctor in incognito to join").
3. `chrome.runtime.requestUpdateCheck()` → if `update_available`, shows "Updating Proctor…" and calls
   `chrome.runtime.reload()` after 1.5 s; the student reopens the popup and joins on the new version.
4. `POST /exams/:code/register` with `{ studentName, studentId, extensionVersion }`
   (version from `chrome.runtime.getManifest()`).
5. Stores `enrollment = { sessionId, examTitle, examLink, studentName }` in `chrome.storage.local`
   (this is what switches monitoring on), clears `joinDraft` and `examStartedReported`.
6. Sends `__proctor_enrolled` to wake the worker (immediate heartbeat).
7. Opens the exam link in a new tab — only if it is `http(s)://` (`safeLink`).

Other behaviour:
- **Join draft:** what the student types is saved to `chrome.storage.session.joinDraft` on every
  keystroke (the popup closes on any outside click); cleared on join, and by Chrome when the browser closes.
- **Leave:** `POST /sessions/:id/end` (reason defaults to `LEFT` on the server), then `__proctor_left`
  to the worker, then removes `enrollment` locally even if the server was unreachable.

### 2.3 Background service worker — [background.js](../extension/background.js)

The recorder. Every function is a no-op until `enrollment` exists.

| Part | Function(s) | Details |
|---|---|---|
| State | `getEnrollment`, `clearEnrollment`, `apiBase` | `clearEnrollment` removes `enrollment`, `examStartedReported`, `incognitoReported`; if `updatePending`, reloads the extension to apply the deferred update |
| Reporting | `report(type, payload)` | `POST /sessions/:id/violations` with `{ type, payload, url, occurredAt: new Date().toISOString() }` (client time). 404 → session ended server-side → `clearEnrollment()`. Network error / non-OK → `enqueue()` |
| Offline buffer | `enqueue`, `flushBuffer` | queue in `chrome.storage.local.eventBuffer`, capped at **500** (oldest dropped). Flushed in order after any successful report or heartbeat; a 404 drops that item, other errors stop the flush for later |
| Heartbeat | `sendHeartbeat` | `chrome.alarms` every **0.5 min** (30 s), plus once on every worker start and on `__proctor_enrolled`. 404 → `clearEnrollment()` |
| Warnings | `handleReportResponse`, `warnStudent`, `injectWarningBanner`, `notify` | server reply `{concerning, concerningCount, maxWarnings, notifyStudent, autoClosed}`. If `notifyStudent && concerning`: red banner injected with `chrome.scripting.executeScript` into the active tab (fixed top, max z-index, hides after 8 s) **and** a desktop notification. If `autoClosed`: "Exam monitoring ended" + `clearEnrollment()` |
| Exam start | `maybeReportExamStarted` | first visit to the exam link's **host** → `EXAM_STARTED` once per join (`examStartedReported` flag) |
| Tab URL registry | `rememberTabUrl`, `recallTabUrl` | `chrome.storage.session` key `tabUrl:<id>`, because `tabs.onRemoved` fires after the URL is gone; seeded from all open tabs at worker start |
| Tab events | `tabs.onUpdated` → `TAB_NAVIGATE` (active tab, URL changed); `tabs.onActivated` → `TAB_SWITCH`; `tabs.onCreated` → `TAB_CREATED`; `tabs.onRemoved` → `TAB_CLOSED` | URLs taken from `tab.url \|\| tab.pendingUrl`, falling back to the registry |
| Windows | `windows.onCreated` → `NEW_WINDOW` with `incognito` flag; `windows.onFocusChanged` | focus to `WINDOW_ID_NONE` → `WINDOW_BLUR` (with the page the student was on); focus back → `WINDOW_FOCUS`, and if the newly focused window's active tab differs from `lastActiveTabId` → also `TAB_SWITCH` (`viaWindow`) so a page in a second Chrome window is judged like a tab switch |
| Idle | `chrome.idle.setDetectionInterval(120)` | state `idle` or `locked` → `IDLE` (recorded and badged, never counted) |
| Incognito | `checkIncognitoAccess` | runs at worker start and every heartbeat; if access was turned off during an exam → `INCOGNITO_DISABLED` once (`incognitoReported`) |
| Updates | `runtime.onUpdateAvailable` | no exam → reload now; during an exam → `updatePending = true`, applied by `clearEnrollment()` |
| Messages | `runtime.onMessage` | control messages start with `__proctor_`: `enrolled` (beat now), `finish` (`POST …/end` with `reason: FINISHED_FULLSCREEN`, then clear), `left` (clear). Anything else is a content-script event, reported with `sender.tab.url` |

### 2.4 Content script — [content.js](../extension/content.js)

Runs on every page at `document_start`, silent unless `enrollment` exists (`currentEnrollment`,
kept current with `chrome.storage.onChanged`). Sends events to the worker with `chrome.runtime.sendMessage`;
it never calls the backend itself.

- **Clipboard:** `copy` / `cut` / `paste` DOM listeners → `COPY` / `CUT` / `PASTE`. Keyboard
  shortcuts, the right-click menu and Chrome's Edit menu all fire the same DOM event. The clipboard
  **content is never read**.
- **Submission detection:** on `docs.google.com` with `/formResponse` in the path → `EXAM_SUBMITTED`.
- **Fullscreen lock** (only on the exam page = host of `examLink`, while enrolled, until the exam is submitted — the `/formResponse` page and anything after it are never locked; flag `examSubmitted` in `storage.local`, cleared on the next join):
  - `requestFullscreen()` plus `navigator.keyboard.lock(['Escape'])`, so a short Esc shows the prompt
    instead of exiting (holding Esc still force-exits; browsers keep that escape hatch).
  - The overlay "Exam in progress" offers **Continue in fullscreen** or **Finish & end exam**
    (→ `__proctor_finish`).
  - `fullscreenchange` to non-fullscreen → `FULLSCREEN_EXIT` + prompt. `visibilitychange` back to the
    exam tab → prompt again.
  - A new join re-arms the lock (`fsActive = true`); leaving disarms it and unlocks the keyboard.

---

## 3. Edge and hosting

### 3.1 Cloudflare

- DNS for `proctor.jesoas.org` and the TLS certificate at the edge (HTTPS for free, auto-renewed).
- **Cloudflare Tunnel:** `cloudflared` on the VM makes an *outbound* connection to Cloudflare, so the VM
  needs **no open inbound ports**. Cloudflare sets `CF-Connecting-IP` (the client's public IP), which the
  rate limiter trusts because nothing can reach the origin except through the tunnel.
- Automatic DDoS mitigation (free plan) in front of everything.

### 3.2 Docker Compose — [docker/docker-compose.yml](../docker/docker-compose.yml)

| Service | Image | Network exposure | Notes |
|---|---|---|---|
| `db` | `postgres:16-alpine` | **none** (internal Docker network only) | volume `postgres_data`; healthcheck `pg_isready` every 5 s |
| `backend` | built from [backend/Dockerfile](../backend/Dockerfile) (context = repo root) | `127.0.0.1:3000` on the VM only | waits for `db` healthy; env below |
| `cloudflared` | `cloudflare/cloudflared:latest` | outbound only | profile `tunnel`; `TUNNEL_TOKEN` |

### 3.3 Image — [backend/Dockerfile](../backend/Dockerfile)

Multi-stage on `node:22-bookworm-slim`:
1. **dashboard stage:** `npm ci` + `vite build` → `/dashboard/dist`.
2. **backend stage:** installs OpenSSL (Prisma engine), `npm ci`, `prisma generate`, `nest build`,
   copies the dashboard build to `/app/dashboard-dist` (`DASHBOARD_DIST`), `NODE_ENV=production`.
3. `CMD`: `npx prisma migrate deploy && node dist/main` — every start applies pending migrations.

### 3.4 Deploy — [deploy.sh](../deploy.sh)

Run on the VM: `git pull --ff-only` (fails if the checkout diverged) → checks `docker/.env` exists →
`docker compose --profile tunnel up -d --build` → polls `http://127.0.0.1:3000/health` for up to ~60 s;
prints the last 40 backend log lines if it never becomes healthy.

### 3.5 Environment — [docker/.env.example](../docker/.env.example) · [backend/.env.example](../backend/.env.example)

| Variable | Required | Effect |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | password required by Compose | database credentials; `DATABASE_URL` is built from them |
| `ADMIN_TOKEN` | required by Compose | `x-admin-token` for creating teachers and the wipe endpoint. If unset in a non-Compose run, admin routes are **open** |
| `JWT_SECRET` | required by Compose | signs teacher JWTs. Code falls back to `dev-insecure-secret-change-me` if unset |
| `WEBHOOK_SECRET` | optional | Google Forms webhook secret; blank = webhook rejects everything |
| `MIN_EXTENSION_VERSION` | optional (set to `1.2.2` in production) | joins from older or unversioned extensions get HTTP 426 |
| `THROTTLE_LIMIT` / `THROTTLE_TTL_MS` | optional (defaults 100 / 10 000) | per-IP rate limit |
| `TUNNEL_TOKEN` | for the tunnel profile | Cloudflare connector token |

---

## 4. Backend core

Framework: **NestJS** (TypeScript, Express adapter). Folder: [backend/src/](../backend/src/).

- [main.ts](../backend/src/main.ts) — `trust proxy = true` (so `req.ip` reflects the forwarded client),
  CORS `origin: '*'` (safe here: auth is a bearer token, not cookies), listens on `PORT` (3000).
- [app.module.ts](../backend/src/app.module.ts)
  - `ServeStaticModule`: serves the built dashboard at `/dashboard`. Files under `assets/` get
    `Cache-Control: public, max-age=31536000, immutable` (Vite content-hashes them); everything else gets
    `no-cache`, so a new deploy reaches returning browsers.
  - `ThrottlerModule.forRoot([{ ttl: THROTTLE_TTL_MS ?? 10000, limit: THROTTLE_LIMIT ?? 100 }])` with the
    guard registered globally as `APP_GUARD`. In-memory storage (one process).
  - Imports `PrismaModule`, `AuthModule`, `CoursesModule`, `SessionsModule`, `ExamsModule`, `WebhooksModule`.
- [common/real-ip-throttler.guard.ts](../backend/src/common/real-ip-throttler.guard.ts) — overrides
  `getTracker()`: key = `CF-Connecting-IP` → first `X-Forwarded-For` → `req.ip` → socket address.
  Without it every request would look like it came from the tunnel and the whole class would share one limit.
  Note: behind NAT (campus Wi-Fi) all devices share one public IP, so they still share one limit.
- [app.controller.ts](../backend/src/app.controller.ts) — `GET /` → 302 to `/dashboard/`;
  `GET /health` → `{ status: 'ok', service, timestamp }`, `@SkipThrottle()`.
- [prisma/prisma.service.ts](../backend/src/prisma/prisma.service.ts) — `PrismaClient` with connect/disconnect
  on module init/destroy; [prisma.module.ts](../backend/src/prisma/prisma.module.ts) makes it injectable everywhere.

---

## 5. Auth module

Files: [auth.module.ts](../backend/src/auth/auth.module.ts) · [auth.controller.ts](../backend/src/auth/auth.controller.ts) ·
[auth.service.ts](../backend/src/auth/auth.service.ts) · [password.util.ts](../backend/src/auth/password.util.ts) ·
[jwt-auth.guard.ts](../backend/src/auth/jwt-auth.guard.ts) · [current-teacher.decorator.ts](../backend/src/auth/current-teacher.decorator.ts) ·
[common/admin.guard.ts](../backend/src/common/admin.guard.ts)

| Endpoint | Guard | Behaviour |
|---|---|---|
| `POST /auth/register` | `AdminGuard` | create a teacher: email (lower-cased, must contain `@`), name, password ≥ 8 chars; 409 if the email exists. **No self-registration.** |
| `POST /auth/login` | — (global throttle only) | look up by email, `verifyPassword`; 401 "invalid email or password" for both unknown email and wrong password; returns `{ token, teacher }` |
| `GET /auth/me` | `JwtAuthGuard` | returns the teacher from the token (the dashboard uses it to restore a session) |

- **Password hashing:** Node `crypto.scryptSync(password, salt, 64)` with a random 16-byte salt,
  stored as `salt:hash` (hex). Verification recomputes and compares with `timingSafeEqual`.
- **JWT:** `@nestjs/jwt`, HS256 with `JWT_SECRET`, `expiresIn: '12h'`, payload `{ sub: teacherId, email, name }`.
  No refresh token and no revocation list: signing out only deletes the token in the browser.
- **JwtAuthGuard:** requires `Authorization: Bearer <token>`, verifies it, attaches `req.teacher`.
  `@CurrentTeacher()` reads it in controllers.
- **AdminGuard:** compares `x-admin-token` with `ADMIN_TOKEN` (plain `!==`); if `ADMIN_TOKEN` is unset
  it allows everything (dev convenience).

---

## 6. Courses module

Files: [courses.controller.ts](../backend/src/courses/courses.controller.ts) · [courses.service.ts](../backend/src/courses/courses.service.ts)

All routes use `JwtAuthGuard` at the controller level and filter by `teacherId`.

| Endpoint | Behaviour |
|---|---|
| `POST /courses` | `{ name (required), year?, section? }` (free text) |
| `GET /courses` | the teacher's courses, newest first, with `_count.exams` |
| `GET /courses/:id` | `findFirst({ id, teacherId })` → 404 if not theirs (indistinguishable from absent) |
| `PATCH /courses/:id` | ownership check, then name / year / section |
| `DELETE /courses/:id` | cascades to exams → sessions → events (`onDelete: Cascade` in the schema) |

---

## 7. Exams module

Files: [exams.controller.ts](../backend/src/exams/exams.controller.ts) · [exams.service.ts](../backend/src/exams/exams.service.ts) ·
[csv-export.ts](../backend/src/exams/csv-export.ts)

Ownership is enforced through **Exam → Course → Teacher**: every query has `course: { teacherId }`.

### 7.1 Endpoints

| Endpoint | Guard | Service method |
|---|---|---|
| `POST /exams` | JWT | `createExam` |
| `GET /exams` | JWT | `listExams` (runs `closeExpiredExams` first; session count excludes webhook placeholder rows) |
| `GET /exams/:id` | JWT | `getExam` (runs `closeExpiredExams` + `sessions.expireStale`) |
| `GET /exams/:id/sessions` | JWT | `listExamSessions` — the live list with computed signals |
| `GET /exams/:id/export?view=summary\|log&tz=` | JWT | `exportCsv` → `text/csv`, RFC 5987 filename |
| `POST /exams/:id/status` | JWT | `setStatus` (`DRAFT` / `OPEN` / `CLOSED`) |
| `PATCH /exams/:id` | JWT | `updateExam` (advanced settings) |
| `DELETE /exams/:id` | JWT | `deleteExam` (cascade) |
| `DELETE /exams` | Admin | `clearAll` — wipes every exam (dev helper) |
| `POST /exams/:code/register` | **open** | `register` — the student join |

### 7.2 Creating an exam — `createExam`

- Required: `title`, `courseId` (must be the teacher's), `examLink` (must match `^https?://\S+$`).
- `maxWarnings` ≥ 1 (DB default 3); optional `startsAt` / `endsAt` (ISO, `endsAt > startsAt`), `expectedStudents` ≥ 0.
- `openedAt` = now, unless `startsAt` is in the future (then set on the first successful join).
- **Join code** — `generateUniqueCode()`: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  (31 symbols, no 0/O/1/I/L) → 31⁶ ≈ 887 million codes; checks `findUnique` and retries up to 10 times,
  then 409. The column is `@unique`, so the database is the final guard. Codes are unique across **all**
  exams ever created, open or closed; a code is freed only when its exam is deleted.

### 7.3 Student join — `register(code, body, userAgent)`

1. **Version gate:** if `MIN_EXTENSION_VERSION` is set and `extensionVersion` is missing or older
   (numeric part-by-part compare, `olderThan()`) → **HTTP 426** with an update message.
2. `studentName` required → 400.
3. Find the exam by `joinCode.toUpperCase()` → 404 "No exam for code …".
4. **Exam window:** refuse if `status ≠ OPEN`, before `startsAt` ("has not started yet"), or after `endsAt`
   ("is not open for registration") → 409. An OPEN exam past its end is closed on the spot.
5. First successful join sets `openedAt` if it was null.
6. **One session per student per exam:** look up an existing session by `studentId` (or by name if no ID).
   - **ID conflict:** if that session is *live* (ACTIVE and seen within 90 s) and the joiner has a
     different name (case/space-insensitive) or a different browser (user agent without the
     ` Proctor/x.y.z` suffix) → write `ID_CONFLICT` on the existing session and return **409**.
   - Otherwise reuse it: status ACTIVE, clear end/disconnect fields, keep the first name (a webhook
     placeholder row takes the newly typed name), store the new user agent.
   - Different name → `NAME_MISMATCH` event. Re-joining an ENDED session → `REJOIN` event.
   - No existing session → create one.
7. The user agent is stored as `<browser UA> Proctor/<version>`; the dashboard shows it as "ext x.y.z".
8. Returns `{ sessionId, examTitle, examLink }`.

### 7.4 Status, settings and expiry

- `setStatus`: OPEN clears `closedAt` and, for an exam without an end time being reopened, resets
  `openedAt` (restarts the 24 h safeguard). CLOSED sets `closedAt` and ends every running session of
  closed exams (`endedReason: EXAM_CLOSED`).
- `updateExam` validation: `maxWarnings ≥ 1`, `disconnectGraceSec ≥ 0`, `awayGraceSec` 0–3600,
  `examLink` http(s), `expectedStudents ≥ 0`, booleans `autoClose` / `notifyStudent`.
- `closeExpiredExams()` — one `updateMany` that closes OPEN exams whose `endsAt` passed, or with no end
  time that have been open more than **24 h** (`MAX_EXAM_OPEN_HOURS`, counted from `openedAt`, else
  `startsAt`, else `createdAt`); then ends their sessions. Runs from a **server timer every 30 s**
  (`EXPIRY_SWEEP_MS`, started in `onModuleInit`, `unref()`'d) and on instructor reads, throttled to once
  per 15 s (`MAINTENANCE_THROTTLE_MS`).

### 7.5 Live list — `listExamSessions`

Loads all sessions of the exam and **all their events in one query** (`sessionId IN (…)`, ordered by
`occurredAt`), groups them per session and runs `classify()` for each. Returned per student:

`concerningCount` · `aiUsed` · `didNotOpenExam` (exam link set but never visited) · `examStartedAt` ·
`submittedAt` · `submissionConfirmed` · `startedLate` (first exam visit > `startsAt` + 60 s) ·
`finishedEarly` (submitted before `endsAt`) · `idle` · `reconnectCount` · `tamperIntent` ·
`unaccountedSec` · `idConflict` · `nameMismatch` · `submittedWithoutJoining` (webhook placeholder row).

Cost note: this recomputes everything on every dashboard poll (every 5 s per open tab), so it grows with
the number of events. The natural optimisation is an in-memory cache of each session's result,
classifying only new events (not implemented).

### 7.6 CSV export — [csv-export.ts](../backend/src/exams/csv-export.ts)

- `buildSummaryCsv(rows, maxWarnings, tz)`: one row per student (counts, assessment, flags).
- `buildLogCsv(sessions, opts, tz)`: every event as a readable row, framed by "joined" / "ended",
  same wording and same away-time pairing as the dashboard's `buildLogRows`.
- Labels are **copied** from `dashboard/src/ui.tsx` (`EVENT_LABELS`, `endedReasonLabel`); keep them in sync.
- Times are formatted in the teacher's time zone (`tz` from the browser, falls back to UTC) as
  `YYYY-MM-DD HH:mm:ss`. Output has a UTF-8 BOM (Excel + Thai names), CRLF line endings, and quotes cells
  containing `"` `,` or newlines. Cells starting with `=` `+` `-` `@` are **not** neutralised yet
  (CSV formula injection).

---

## 8. Sessions module

Files: [sessions.controller.ts](../backend/src/sessions/sessions.controller.ts) · [sessions.service.ts](../backend/src/sessions/sessions.service.ts)

### 8.1 Endpoints

| Endpoint | Guard | Behaviour |
|---|---|---|
| `POST /sessions/:id/heartbeat` | open | `touchSession` → `{ ok: true }` |
| `POST /sessions/:id/violations` | open | `addViolation` (any event, not only violations) |
| `POST /sessions/:id/end` | open | ENDED with `FINISHED_FULLSCREEN` if sent, else `LEFT` |
| `GET /sessions/:id/violations` | JWT | `listViolations`: the readable timeline from [common/timeline.ts](../backend/src/common/timeline.ts) (same rows as the full-log CSV: merged tab events, away rows, short URLs), each marked `concerning` / `postSubmission` |
| `GET /sessions/:id` | JWT | session + exam title/code + event count |
| `PATCH /sessions/:id` | JWT | teacher edits name, student ID or status |
| `DELETE /sessions/:id` | JWT | deletes the session and its events |

Teacher routes check ownership through Session → Exam → Course → Teacher (`ensureOwned`, 404 otherwise).

### 8.2 Session lifecycle

```
          join                 no heartbeat 90 s            no return within 10 min
 (none) ───────► ACTIVE ─────────────────────────► DISCONNECTED ───────────────────► ENDED (TIMEOUT)
                   ▲  │                                 │
                   │  │ Leave / Finish / auto-close /   │ any heartbeat or event:
                   │  │ exam closed → ENDED             │ ACTIVE again + RECONNECT, or
                   │  ▼                                 │ LONG_DISCONNECT if gap ≥ disconnectGraceSec
                   └──── re-join (same student ID) ◄────┘
```

- `touchSession(id)` (every heartbeat and event): ENDED or missing → **404**, which makes the extension
  stop. DISCONNECTED → back to ACTIVE in one transaction, and writes `RECONNECT` or `LONG_DISCONNECT`
  (gap ≥ the exam's `disconnectGraceSec`, default 180 s) dated at `disconnectedAt`, payload `{ seconds }`.
  ACTIVE → bump `lastSeenAt`.
- `expireStale()` — one raw SQL `UPDATE "StudentSession" SET status='DISCONNECTED', "disconnectedAt"="lastSeenAt"
  WHERE status='ACTIVE' AND "lastSeenAt" < now-90s`, then DISCONNECTED longer than 10 min → ENDED
  (`TIMEOUT`). Runs on instructor reads (`getExam`), throttled to once per 15 s — there is no timer for it,
  so statuses update when a dashboard is open.

### 8.3 Recording an event — `addViolation`

1. `type` required (free string). `touchSession()`.
2. Insert the event with the **client** `occurredAt` (server receive time is not stored).
3. If the exam has neither `notifyStudent` nor `autoClose` → return immediately (cheap write path).
4. Otherwise load **all** of this session's events and run `classify()` — so cost grows with the session's
   length when warnings are on.
5. Should the student be warned *for this event*?
   - `WINDOW_BLUR` never warns (the away time is unknown until they return).
   - `WINDOW_FOCUS` warns if the blur it closes (latest unmatched `WINDOW_BLUR`) counted.
   - Anything else warns if it is in the concerning set.
6. **Auto-close:** if `autoClose` and the count ≥ `maxWarnings` → session ENDED, `endedReason: AUTO_CLOSED`.
7. Reply `{ id, concerning, concerningCount, maxWarnings, notifyStudent, autoClosed }` — the extension
   turns this into the banner / notification.

---

## 9. Classifier (`common/concerning.ts`)

File: [backend/src/common/concerning.ts](../backend/src/common/concerning.ts) — a pure function
`classify(events, { examLink, awayGraceSec })` used by the live list, the per-student log, the warning
path and both CSVs. Events are processed in time order.

**Allowed target** (`isAllowedTarget`): no URL (blank new tab) · a browser scheme (`chrome:`, `about:`,
`chrome-extension:`, `edge:`, `devtools:`, `view-source:`) · the exam link rule · the allowed list.
The **exam link rule** is host + first path segment (`docs.google.com/forms/...` → `docs.google.com` + `/forms`),
so a Google Form link does not whitelist Google Docs.

| Event | Rule |
|---|---|
| `EXAM_STARTED` | sets `examStartedAt`, `visitedExamLink` |
| `EXAM_SUBMITTED`, `SUBMISSION_CONFIRMED` | sets `submittedAt`; the second also `submissionConfirmed`. **After this point every flagged event goes to `postSubmission`, not counted** |
| `WINDOW_BLUR` → `WINDOW_FOCUS` | counted if away ≥ `awayGraceSec` (default 30 s). The absence also ends at the first activity in Chrome (tab switch/new tab/new window/closed tab/clipboard/submit) at least 2 s after leaving, because Chrome can miss the focus event. A blur never followed by a return counts |
| `TAB_NAVIGATE`, `TAB_SWITCH` | `chrome://extensions` / `edge://extensions` → counted + `tamperIntent`. Same host+path as the previous navigation (query-only change) → ignored. Otherwise counted if not an allowed target |
| `TAB_CREATED`, `NEW_WINDOW` | incognito window → always counted; otherwise counted only if it lands on a non-allowed URL |
| `COPY`, `PASTE`, `CUT` | counted only on a non-allowed page |
| `INCOGNITO_DISABLED` | counted + `tamperIntent` |
| `FULLSCREEN_EXIT` | counted, unless the tab is now on an allowed (sign-in) page other than the exam: the sign-in redirect ends fullscreen by itself |
| `LONG_DISCONNECT` | counted; adds to `reconnectCount` and `unaccountedSec` |
| `RECONNECT` | not counted; adds to `reconnectCount` and `unaccountedSec` |
| `IDLE` | not counted; sets `idle` |
| `TAB_CLOSED`, `REJOIN`, `ID_CONFLICT`, `NAME_MISMATCH`, others | never counted |

Any visit to an AI host sets `aiUsed` (the visit also counts, because AI hosts are not on the allowed list).

---

## 10. Domain lists

- [backend/allowed-domains.txt](../backend/allowed-domains.txt) — **deliberately tiny:**
  `accounts.google.com` (sign-in), `docs.google.com/forms` (Forms only), `forms.gle`,
  `chromewebstore.google.com` (17 false alarms in the trial), `www.google.com/a` (Google Workspace SSO, not `/search`),
  `home.au.edu` (the university's SAML sign-in portal; 4 false alarms in the defence exam). The header explains why other domains were removed.
- [backend/ai-domains.txt](../backend/ai-domains.txt) — `chatgpt.com`, `chat.openai.com`, `openai.com`,
  `gemini.google.com`, `bard.google.com`, `claude.ai`, `copilot.microsoft.com`, `perplexity.ai`, `openrouter.ai`.
- Loader: [common/allowed-domains.ts](../backend/src/common/allowed-domains.ts) — reads the files from
  `process.cwd()` (or the app root), strips `#` comments, caches them in memory; built-in defaults if a
  file is missing. Entry = `host` (any path, subdomains included) or `host/path` (that path and children).
  **Edit the file and restart the backend** to apply.

---

## 11. Webhooks module + Google Apps Script

Files: [webhooks.controller.ts](../backend/src/webhooks/webhooks.controller.ts) · [webhooks.service.ts](../backend/src/webhooks/webhooks.service.ts) ·
[integrations/google-forms/Code.gs](../integrations/google-forms/Code.gs) · [README](../integrations/google-forms/README.md)

**Backend** (`@SkipThrottle()`, every call needs `x-webhook-secret = WEBHOOK_SECRET`):
- `GET /webhooks/forms` → `{ forms: [tokens] }`: the Google Form ids found in every exam's `examLink`
  (`/forms/d/e/<published id>` and `/forms/d/<file id>`).
- `POST /webhooks/form-submit` `{ formId, publishedUrl, studentId, submittedAt }`:
  1. exam = first exam whose `examLink` contains one of the form's tokens;
  2. student = session whose student ID matches **digits only** (`u6530338` = `6530338`);
  3. no match → creates a placeholder session "Submitted without joining Proctor", ENDED, `endedReason: NO_SESSION`
     (adopted by the real student if they join later);
  4. writes `SUBMISSION_CONFIRMED` at the form's timestamp.

**Apps Script** (standalone, in the teacher's Google account):
- `installAutoSync()` — run once: a time trigger runs `syncForms` **every minute**.
- `syncForms()` — asks the backend which forms to watch; only if the list changed (`lastTokens` in
  script properties) does it scan the teacher's Drive forms and add/remove `onFormSubmit` triggers.
- `onFormSubmit(e)` — student ID from a question titled "Student ID", else the digits of the respondent
  email (needs "Collect email addresses"); posts to `/webhooks/form-submit`.

---

## 12. Database (Prisma / PostgreSQL)

Schema: [backend/prisma/schema.prisma](../backend/prisma/schema.prisma) · migrations: [backend/prisma/migrations/](../backend/prisma/migrations/) (8, applied by `prisma migrate deploy` on container start).

| Model | Key fields | Relations / indexes |
|---|---|---|
| `Teacher` | `id` (cuid), `email` **unique**, `name`, `passwordHash`, `createdAt` | 1 → n `Course` |
| `Course` | `name`, `year?`, `section?` | `teacherId` (cascade), `@@index([teacherId])` |
| `Exam` | `title`, `joinCode` **unique**, `status` (`DRAFT`/`OPEN`/`CLOSED`, default OPEN), `maxWarnings` (3), `disconnectGraceSec` (180), `awayGraceSec` (30), `autoClose` (false), `notifyStudent` (false), `expectedStudents?`, `examLink?`, `startsAt?`, `endsAt?`, `openedAt?`, `closedAt?` | `courseId` (cascade), `@@index([courseId])` |
| `StudentSession` | `studentName`, `studentId?`, `status` (`ACTIVE`/`DISCONNECTED`/`ENDED`), `startedAt`, `endedAt?`, `endedReason?` (`LEFT`, `FINISHED_FULLSCREEN`, `AUTO_CLOSED`, `EXAM_CLOSED`, `TIMEOUT`, `NO_SESSION`), `disconnectedAt?`, `lastSeenAt`, `userAgent?` (+ ` Proctor/x.y.z`) | `examId` (cascade), `@@index([examId])` |
| `Violation` (= any event) | `id` autoincrement, `type` (free string), `url?`, `payload?` (JSON as text), `occurredAt` (client time) | `sessionId` (cascade), `@@index([sessionId, occurredAt])` |

- `status`, `type` and `payload` are plain strings (kept from the SQLite era; enums/JSON are a possible
  tightening — see [docs/DECISIONS.md](DECISIONS.md)).
- Counts are **never stored**; they are computed from `Violation` rows by the classifier.
- Only one raw query exists (`expireStale`), with no user input; everything else is parameterised by Prisma.

---

## 13. Dashboard (React)

Folder: [dashboard/](../dashboard/) — React 18, TypeScript, Vite 6, Tailwind CSS 4. Built into the backend
image and served at `/dashboard/` ([vite.config.ts](../dashboard/vite.config.ts): `base: '/dashboard/'`).

| File | Role |
|---|---|
| [src/main.tsx](../dashboard/src/main.tsx) | mounts `<App>`, applies the saved theme before first paint |
| [src/api.ts](../dashboard/src/api.ts) | the only HTTP client. Same origin in production (`API_BASE = ''`), `localhost:3000` in dev. Token in `localStorage.proctor_token`, sent as `Bearer`. A 401 clears the token ("Session expired"). `reqBlob` for CSV downloads |
| [src/App.tsx](../dashboard/src/App.tsx) | on load: token? → `GET /auth/me` → `<Dashboard>`, else `<Login>` |
| [src/pages/Login.tsx](../dashboard/src/pages/Login.tsx) | email + password → `api.login`, stores the token |
| [src/pages/Dashboard.tsx](../dashboard/src/pages/Dashboard.tsx) | shell + drill-down Courses → Exams → Sessions. Navigation is stored in `history.state` (`pushState` / `popstate`), so browser Back/Forward, Alt+←/→ and refresh keep the current view. Theme toggle, sign out |
| [src/components/CoursesPanel.tsx](../dashboard/src/components/CoursesPanel.tsx) | list / create / delete courses |
| [src/components/ExamsPanel.tsx](../dashboard/src/components/ExamsPanel.tsx) | create exam (title, exam link and max warnings required, Google-style red `*`), list with join code, status (shows `SCHEDULED` for an OPEN exam whose start is in the future), open/close, delete |
| [src/components/ExamSettings.tsx](../dashboard/src/components/ExamSettings.tsx) | "Advanced settings": max warnings, disconnect grace, away time, expected students, exam link, notify students, auto-close. Saves every field at once, so it must be rendered with fresh exam data |
| [src/components/SessionsPanel.tsx](../dashboard/src/components/SessionsPanel.tsx) | exam page: fetches fresh `GET /exams/:id`, then the live list. **Poll every 5 s** with a self-scheduling `setTimeout` (no overlap), paused while the tab is hidden, immediate refresh on return; the open student's log refreshes too. `buildLogRows` turns events into the readable timeline (pairs blur/focus into "away for …"). CSV buttons fetch a Blob and save it. "ext x.y.z" parsed from the user agent |
| [src/ui.tsx](../dashboard/src/ui.tsx) | shared pieces: buttons, `JoinCode` + copy, `WarningBadge` (`count/max`, amber below the limit, red at it; **"Very high chance of cheating" when count > max**; purple "AI used"), submission / no-exam / timing / attention badges, `EVENT_LABELS` + `eventHelp`, `endedReasonLabel`, `StatusPill`, required-field helpers |
| [src/theme.ts](../dashboard/src/theme.ts) | dark (default) / light, remembered in `localStorage.proctor_theme` |

---

## 14. Event catalogue

| Type | Produced by | Counted? |
|---|---|---|
| `TAB_NAVIGATE` | background (`tabs.onUpdated`, active tab) | if the target is not allowed; extensions page always |
| `TAB_SWITCH` | background (`tabs.onActivated`, or focus to another Chrome window) | same as above |
| `TAB_CREATED` | background | if it lands on a non-allowed URL |
| `TAB_CLOSED` | background | never |
| `NEW_WINDOW` | background | incognito always; otherwise if non-allowed |
| `WINDOW_BLUR` / `WINDOW_FOCUS` | background | the blur counts if away ≥ `awayGraceSec` |
| `IDLE` | background (`chrome.idle`, 120 s) | never (badge) |
| `INCOGNITO_DISABLED` | background | always (+ tamper flag) |
| `EXAM_STARTED` | background (first exam-host visit) | never |
| `COPY` / `CUT` / `PASTE` | content script | on non-allowed pages |
| `EXAM_SUBMITTED` | content script (`/formResponse`) | never; later events not counted |
| `FULLSCREEN_EXIT` | content script | yes, except when the tab moved to an allowed sign-in page |
| `RECONNECT` / `LONG_DISCONNECT` | backend (`touchSession`) | the long one counts |
| `REJOIN`, `ID_CONFLICT`, `NAME_MISMATCH` | backend (`register`) | never (flags) |
| `SUBMISSION_CONFIRMED` | backend (webhook) | never; later events not counted |

---

## 15. Timers and thresholds

| What | Value | Where |
|---|---|---|
| Heartbeat | 30 s (`chrome.alarms`, 0.5 min) | `background.js` `HEARTBEAT_PERIOD_MINUTES` |
| Session → DISCONNECTED | 90 s without a beat | `sessions.service.ts` `STALE_TIMEOUT_MS` |
| DISCONNECTED → ENDED | 10 min | `RESUME_WINDOW_MS` |
| Long disconnect counts | ≥ `disconnectGraceSec` (default 180 s) | per exam |
| Away from Chrome counts | ≥ `awayGraceSec` (default 30 s, 0–3600) | per exam |
| Idle | 120 s | `background.js` `IDLE_SECONDS` |
| Exam expiry sweep | every 30 s | `exams.service.ts` `EXPIRY_SWEEP_MS` |
| Read-path housekeeping | at most every 15 s | `MAINTENANCE_THROTTLE_MS`, `STALE_SWEEP_THROTTLE_MS` |
| Exam without end time | auto-closed after 24 h open | `MAX_EXAM_OPEN_HOURS` |
| Late start | > `startsAt` + 60 s | `LATE_START_GRACE_MS` |
| Dashboard poll | 5 s, paused when hidden | `SessionsPanel.tsx` |
| Offline buffer | 500 events | `background.js` `MAX_BUFFER` |
| Warning banner | 8 s on screen | `injectWarningBanner` |
| Rate limit | 100 requests / 10 s per public IP | `THROTTLE_LIMIT`, `THROTTLE_TTL_MS` |
| JWT lifetime | 12 h | `auth.module.ts` |
| Apps Script sync | every 1 min | `Code.gs` `installAutoSync` |

---

## 16. HTTP API reference

| Method + path | Auth | Purpose |
|---|---|---|
| `GET /` | — | redirect to `/dashboard/` |
| `GET /health` | — (not throttled) | liveness for deploys/monitoring |
| `POST /auth/register` | admin token | create teacher |
| `POST /auth/login` | — | teacher sign-in → JWT |
| `GET /auth/me` | JWT | current teacher |
| `POST /courses`, `GET /courses`, `GET/PATCH/DELETE /courses/:id` | JWT | course CRUD |
| `POST /exams`, `GET /exams`, `GET/PATCH/DELETE /exams/:id` | JWT | exam CRUD + settings |
| `POST /exams/:id/status` | JWT | open / close / draft |
| `GET /exams/:id/sessions` | JWT | live student list with signals |
| `GET /exams/:id/export?view=summary\|log&tz=` | JWT | CSV |
| `DELETE /exams` | admin token | wipe all exams |
| `POST /exams/:code/register` | — | student join (426 / 404 / 409 / 400) |
| `POST /sessions/:id/heartbeat` | — | keep-alive |
| `POST /sessions/:id/violations` | — | record an event; reply drives warnings |
| `POST /sessions/:id/end` | — | Leave / Finish |
| `GET /sessions/:id`, `GET /sessions/:id/violations` | JWT | session + annotated timeline |
| `PATCH /sessions/:id`, `DELETE /sessions/:id` | JWT | edit / delete a student row |
| `GET /webhooks/forms` | webhook secret | forms to watch |
| `POST /webhooks/form-submit` | webhook secret | submission confirmed |

---

## 17. Known limits and where they live

| Limit | Where | Possible fix |
|---|---|---|
| Rate limit is per **public** IP: a classroom behind campus NAT shares 100 req / 10 s (~220 students) | `app.module.ts`, `real-ip-throttler.guard.ts` | raise `THROTTLE_LIMIT`; limit per session id; Cloudflare edge rate rule |
| Login only has the global per-IP limit; no lockout or MFA | `auth.controller.ts` | `@Throttle` on `/auth/login` |
| Insecure fallbacks if `JWT_SECRET` / `ADMIN_TOKEN` are unset outside Compose | `auth.module.ts`, `admin.guard.ts` | fail at startup in production |
| Secret comparisons use `!==` | `admin.guard.ts`, `webhooks.controller.ts` | `crypto.timingSafeEqual` |
| CSV formula injection (typed names starting with `=`) | `csv-export.ts` `toCsv` | prefix `'` to such cells |
| Event time is the client's; receive time not stored | `sessions.service.ts` `addViolation` | add a server `receivedAt` column |
| Classification re-reads all events on every poll / warned event | `exams.service.ts` `listExamSessions`, `sessions.service.ts` `addViolation` | in-memory per-session cache, classify only new events |
| Student endpoints trust whoever holds the session id; a modified client can fake events | extension ↔ `sessions.controller.ts` | only a locked-down exam environment fully stops a fake client |
| `expireStale` runs only when a dashboard reads | `sessions.service.ts` | move it onto the 30 s timer |
| Single VM, in-memory throttler state | `docker-compose.yml` | second instance + shared store (e.g. Redis) when needed |
| Content script top frame only; no chrome:// / Web Store / PDF viewer pages | `manifest.json` | browser limitation |
