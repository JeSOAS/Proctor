# Design Decisions (for the team taking over)

This project is **Part 1 (SP2)**. It is a working foundation, not a finished
product. This file explains *why* things are the way they are, and — just as
importantly — what was **deliberately left for you** and why. Read it alongside
the deck (the deck is the final vision; this repo implements an early slice).

Format: each entry is a short decision record — context, decision, reasoning,
and what a future team might do next.

---

## 1. No keystroke or mouse logging

**Decision:** The extension records tab switches, window focus changes, page
navigation, and clipboard *actions* (that a copy/paste/cut happened) — but never
what the student types, never mouse movement, and never the copied text.

**Why:** An earlier prototype logged every keystroke and mouse position. That is
effectively a keylogger, contradicts the deck's "transparent about what is
monitored" promise, and is an ethics/privacy liability for a tool that runs on a
student's personal machine. Removing it also makes the privacy policy honest and
the Web Store review easier.

**Next:** If richer signals are needed, prefer aggregate/among-consenting signals
over raw capture, and keep the privacy policy in sync.

## 2. Heartbeat for session liveness (not a "closed" event)

**Decision:** The extension sends `POST /sessions/:id/heartbeat` every 30s. The
backend marks an ACTIVE session ENDED once its `lastSeenAt` is >90s old.

**Why:** MV3 service workers are killed by Chrome without any reliable shutdown
event, so the extension cannot announce "the student closed the browser." Absence
of heartbeats is the only dependable signal. 90s = three missed beats, tolerating
Chrome's timer throttling.

**Known limitation:** an unstable network looks the same as a closed browser.
See DECISIONS #7-known-limitations and the backend README.

**Next:** Socket.IO presence (in the deck) replaces this with instant
connect/disconnect and reconnection — retire the heartbeat then.

## 3. Join-code registration (not link auto-detect)

**Decision:** A student joins an exam by entering a 6-character code in the popup.
The instructor creates the exam and shares the code.

**Why:** Simplest robust path to a demoable, review-friendly MVP for the SP2
deadline. Works on any exam platform, needs no extra host permissions, and is
easy to explain. The deck's "auto-activate on the exam link/QR" is a later
enhancement layered on top of the same registration API.

**Next:** Add link/QR auto-detection that calls the same `register` endpoint.

## 4. Data model: Exam -> StudentSession -> Violation

**Decision:** `Exam` (instructor-created, has a unique `joinCode`), `StudentSession`
(one student's participation), `Violation` (a monitoring event). `type`,
`status`, and `payload` are plain strings.

**Why:** Mirrors the real domain and satisfies the Week 7 "session management"
goals. Free-string `type` lets new event kinds be added without a migration;
`payload` is JSON-as-text for the same flexibility.

**Next:** Once event kinds stabilize, promote `status`/`type` to Postgres enums
and `payload` to a native `Json` column for integrity and query power.

## 5. SQLite (early dev) -> PostgreSQL (now)

**Decision:** The project used SQLite while there was no database infrastructure,
then moved to PostgreSQL for deployment.

**Why:** SQLite needed zero install and unblocked early work. But a real exam has
dozens of students writing events and heartbeats concurrently, which triggers
SQLite write-lock ("database is locked") errors. Postgres handles concurrent
writes and matches the deck. The migration history was squashed to a single clean
Postgres `init` at the switch.

**Next:** Nothing required; this is the intended production database.

## 6. Admin-token guard (lightweight, intentional stop-gap)

**Decision:** Instructor/destructive endpoints (create/list/delete exams, set
status, view sessions) require an `x-admin-token` header matching `ADMIN_TOKEN`.
Student endpoints (register, heartbeat, violations) are open. If `ADMIN_TOKEN` is
unset, the guard allows everything (local-dev convenience).

**Why:** The server is publicly reachable during the exam, and `DELETE /exams`
wipes everything — it cannot be anonymous. A shared token is the minimum viable
protection without building an auth system before the deadline.

**Next:** Replace with real instructor accounts + JWT (in the deck). Student
endpoints will also need anti-abuse (rate limiting, binding a session to its
device) since anyone with a join code can currently post events.

## 7. Cloudflare Tunnel for HTTPS

**Decision:** Public HTTPS is provided by a Cloudflare Tunnel, not by opening
ports + Nginx/Let's Encrypt on the VM.

**Why:** A published extension must call an HTTPS URL (a bare IP can't get a
cert). The VM is Oracle free-tier, which has two firewall layers (cloud Security
List + instance iptables) that are easy to misconfigure. A tunnel connects
*outbound* and needs no open ports, sidestepping that entirely, and gives a
stable `https://` hostname. The deck's Nginx + Let's Encrypt is equivalent and
fine if a future team prefers it.

**Next:** For a permanent deployment, Nginx + Let's Encrypt on a proper domain is
the deck's plan; the tunnel is the pragmatic choice for this handoff window.

## 8. Backend URL is configurable in the extension

**Decision:** `DEFAULT_API_BASE` is a single constant in `background.js` and
`popup.js`, overridable at runtime via `chrome.storage.local.apiBase`.

**Why:** The published extension bakes in one URL, but this project changes hands.
Centralizing it (and allowing an override) lets the next team repoint the
extension at their own backend without hunting through the code.

## 9. Teacher accounts + JWT (multi-tenancy)

**Decision:** Instructors are `Teacher` accounts. An admin creates them
(`POST /auth/register` with `x-admin-token`) — no public sign-up. Teachers log in
(`POST /auth/login`) and get a JWT (Node scrypt for password hashing — no native
bcrypt/argon2 dependency, which is painful on ARM/Windows). Every instructor
endpoint is scoped to the logged-in teacher through the ownership chain, so a
teacher can only ever see their own data. The old single `ADMIN_TOKEN` now only
creates teachers and guards the dev wipe.

**Why:** "A dashboard isolated for different teachers" is multi-tenancy, which
requires authentication. Admin-created accounts (vs open sign-up) keep a public
server from accumulating random accounts.

**Next:** password reset, refresh tokens, and a real "system admin" UI instead of
the shared token.

## 10. Model: Teacher → Course → Exam → StudentSession → Violation

**Decision:** Added `Teacher` and `Course` above the existing `Exam`. `subject`
is a plain field on `Course`. `Exam.courseId` is nullable at the DB level (so the
migration is safe on existing data) but required by the API. Students stay as
`StudentSession` records (no separate `Student` entity).

**Why:** Matches how teachers think (courses contain exams) and gives the
ownership chain that enforces isolation. Nullable `courseId` avoided a
destructive migration; a `Student` table wasn't worth the identity/roster
complexity for SP2 (students self-identify at join time).

**Next:** promote `subject` to its own table if it needs to be shared/managed;
add a `Student` entity if cross-exam tracking is needed.

## 11. Dashboard is React, served by the backend

**Decision:** The dashboard (`dashboard/`, Vite + React + TypeScript + Tailwind)
is built and served by the NestJS backend at `/dashboard` (via
`@nestjs/serve-static`). Same origin as the API — no CORS, one deployment. The
Docker image is multi-stage: it builds the dashboard and hands the output to the
backend (`DASHBOARD_DIST`).

**Why:** Fastest path to a usable UI with the fewest moving parts to deploy and
hand off; still the deck's React stack. Navigation is state-based (no router), so
there are no deep-link routes to configure.

**Next:** if the dashboard grows, add client-side routing and split it into its
own deployment (Cloudflare Pages) — the API is already CORS-open.

## 12. Changes from the 17 Sep 2026 trial (and CSV export)

- **Exams close on time.** Expiry used to run only when the dashboard read data,
  so an exam ending 10:00 closed at 11:16 and students stayed monitored. A 30 s
  server timer now runs the same sweep. Exams without an end time close 24 h
  after they were opened *or last reopened* (reopening restarts the period).
- **Chrome Web Store allowed.** 17 trial violations were students opening the
  store to install/check the extension right after joining.
- **Duplicate student IDs.** A join with an ID that is in use by an online
  session (different name or browser) is refused with 409 and logged
  (`ID_CONFLICT`); re-joins keep the first name (`NAME_MISMATCH` if different);
  confirmed form submissions with no matching session get their own
  `NO_SESSION` row. Backend-only, so the published extension did not change.
- **CSV export** (`GET /exams/:id/export`, dashboard button) — one row per
  event, with the classifier's "counts as violation".
- **`/` redirects to `/dashboard/`** instead of returning 404.

**Why:** each item came from the trial data or a real usage problem; all are
backend/dashboard changes, avoiding another Chrome Web Store review.

## Deliberately left for the next team

None of these are bugs — they are scoped-out on purpose for SP2:

- **Real-time updates** (Socket.IO) — the dashboard polls (5s) for now.
- **Submission confirmation beyond Google Forms** — the webhook is generic, but
  only the Google Forms Apps Script exists (Microsoft Forms would need a Power
  Automate flow). Auto-*submitting* a student's form is intentionally not done.
- **Telegram alerts** — in the deck, not implemented.
- **Student rate-limiting / anti-abuse** — student endpoints are rate-limited
  per IP; anyone with a join code can still post events; a real deployment
  should bind a session to its device.
