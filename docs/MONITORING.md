# Proctor — Monitoring model & known limitations

How the system decides what counts as a violation, what each flag means, and
where the honest limits are. This is the current behaviour (supersedes older
scattered notes). Tuning knobs are called out inline.

## 1. What the extension reports

The extension reports events only while a student has **joined** an exam. Each
event carries a type, the page URL where relevant, and a client-side timestamp.

| Event | Meaning |
|---|---|
| `TAB_NAVIGATE` / `TAB_SWITCH` | Navigated / switched to a page (URL included) |
| `TAB_CREATED` / `TAB_CLOSED` | Opened / closed a tab |
| `NEW_WINDOW` | Opened a separate browser window |
| `WINDOW_BLUR` / `WINDOW_FOCUS` | Left / returned to the Chrome window (blur carries the page URL) |
| `COPY` / `PASTE` / `CUT` | Clipboard action (no content is captured) |
| `IDLE` | No mouse/keyboard/scroll for 2 min (`chrome.idle`) |
| `EXAM_STARTED` | First visit to the exam link |
| `EXAM_SUBMITTED` | Google Forms submission detected (`…/formResponse`) |
| `FULLSCREEN_EXIT` | Left the enforced fullscreen |
| `RECONNECT` / `LONG_DISCONNECT` | Backend-generated when a dropped session resumes (gap seconds in payload) |
| `REJOIN` | Backend-generated when a student re-joins an existing session |

## 2. How events become warnings — the 3-tier model

All classification happens **at read time** on the backend (`common/concerning.ts`),
so the raw log is never altered and rules can be re-tuned without re-collecting.

- **AI (loudest):** navigation to a domain in `ai-domains.txt` → sets the
  **AI used** flag *and* counts.
- **Violation (counts toward the limit):** navigation / tab / clipboard on a
  site that is **not** whitelisted, opening the extensions page
  (`chrome://extensions`), a significant disconnect, or leaving fullscreen.
- **Minor / info (recorded, never counts):** a window blur shorter than
  **30 s** (`CONCERNING_BLUR_MS`), a blank/new tab, a whitelisted or
  browser-internal page, a query-only re-navigation of the same page, going
  idle, brief reconnects.

Events **after `EXAM_SUBMITTED`** are recorded and shown but **never counted**
(the student has finished).

## 3. The whitelist (deliberately narrow, path-aware)

`backend/allowed-domains.txt` — activity here is not a violation. It exists only
so unavoidable, automatic navigation (login, the exam form, an auto-opened page)
doesn't false-positive. Entries are `host` (any path) or `host/path` (that
prefix only, e.g. `docs.google.com/forms` allows Forms but **not** Docs/Sheets).
The exam's own link is auto-whitelisted, scoped to its path. `ai-domains.txt`
lists AI tools (host-only). Both are plain text, loaded at startup — edit and
restart to apply.

## 4. Session & exam lifecycle

- **Session states:** `ACTIVE` → (no heartbeat 90 s) → `DISCONNECTED` →
  (resumes within 10 min) back to `ACTIVE` with a gap event, or → `ENDED`.
- **End reasons:** `LEFT` (pressed Leave), `TIMEOUT` (disconnected too long),
  `EXAM_CLOSED` (teacher closed the exam), `AUTO_CLOSED` (hit the warning limit).
- **Re-join:** re-registering reuses the student's existing session for that
  exam (matched by student ID, else name) and logs `REJOIN` — one row per
  student, no fragmentation.
- **Closing an exam** ends its still-running sessions so tabs stop logging.

## 5. Dashboard flags (per session)

Counting badge: **⚠ N/M** warnings, escalating to "Very high chance of cheating".
Non-counting attention flags shown alongside:

- **🤖 AI used** — visited an AI tool.
- **⚠ Did not open exam** — an exam link is set but the session never visited it.
- **⏱ Started late / ✔ Finished early** — vs the scheduled start/end (needs times set).
- **💤 Went idle** — had an idle period.
- **🔌 Reconnected N×** — more than two reconnects.
- **🕳 Xm unaccounted** — total disconnected-but-returned time ("active while
  unmonitored"); ≥ 60 s. This is the honest coverage signal, not an accusation.
- **🛠 Opened extension settings** — navigated to `chrome://extensions` during
  the exam (tampering intent, caught while the extension is still running).

## 6. Enforcement & student-facing

- **Fullscreen lock:** on the exam page a blocking overlay requires fullscreen;
  leaving it re-prompts and logs `FULLSCREEN_EXIT`.
- **Notify students** (per-exam toggle): a desktop notification on each flagged
  action ("Warning N of M"). Requires the updated extension.
- **Auto-close on limit** (per-exam toggle): the session ends server-side at the
  warning limit; works even with the older extension (it gets a 404 and stops).

## 7. Reliability & security

- **Offline buffering:** events are queued in the extension and flushed on
  reconnect, so nothing is lost on flaky networks.
- **Rate limiting:** the open student endpoints are burst-limited per real
  client IP (`RealIpThrottlerGuard`, reads `CF-Connecting-IP` behind the
  tunnel). Defaults: `THROTTLE_LIMIT=100` requests per `THROTTLE_TTL_MS=10000`.
  If many students share one NAT IP and get throttled, raise `THROTTLE_LIMIT`.

## 8. Tuning knobs

- Domains: `backend/allowed-domains.txt`, `backend/ai-domains.txt`.
- Thresholds (`backend/src/common/concerning.ts`): `CONCERNING_BLUR_MS` (30 s),
  the ≥ 60 s unaccounted badge, the > 2 reconnect badge.
- Idle interval: `IDLE_SECONDS` in `extension/background.js` (120 s).
- Per-exam settings (dashboard): max warnings, disconnect grace, notify,
  auto-close, exam link, expected students, start/end times.
- Rate limit: `THROTTLE_LIMIT`, `THROTTLE_TTL_MS`.

## 9. Known limitations (by design / inherent)

These are real and cannot be fully closed; document them, don't pretend
otherwise.

- **Silent extension disable.** MV3 extensions cannot report their own
  disabling — the code stops the instant it's turned off. We surface *intent*
  (navigating to `chrome://extensions`) and *unaccounted time* (coverage), but a
  student who disables without visiting that page and never returns leaves an
  ambiguous heartbeat gap. Treat coverage as information, not proof.
- **Second monitor / second device.** Fullscreen and focus-loss do not detect a
  phone or a second screen. Out of scope for a browser extension.
- **Submission detection is Google-Forms-only.** Other platforms (Microsoft
  Forms, Moodle, Canvas, coding judges) fall back to the student pressing
  "Leave exam". Definitive multi-platform detection is a future extension change.
- **Shared-IP rate limiting.** If the tunnel ever fails to forward
  `CF-Connecting-IP`, all students collapse to one IP for throttling; the burst
  limit is generous, but raise it if needed.
- **No automated tests.** Testing is manual by project scope.
