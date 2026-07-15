# Manual Test Checklist — Monitoring + Session Management

Run through this list after any change to the extension or backend. Mark each
item and note the date + tester at the bottom.

## Setup

- [ ] Backend running (locally via Docker, or on the VM — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md))
- [ ] `curl <backend>/health` returns `{"status":"ok", ...}`
      (`<backend>` = `http://127.0.0.1:3000` locally, or your `https://…` tunnel URL)
- [ ] Extension loaded/reloaded at `chrome://extensions`, all open tabs refreshed

## Create an exam + join (Week 7)

- [ ] Create an exam (needs the admin token in production):
      `curl -X POST <backend>/exams -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" -d "{\"title\":\"Test Exam\"}"`
      → returns a `joinCode`
- [ ] Click the Proctor toolbar icon → the popup shows a **Join an exam** form
- [ ] Enter a name + the join code → **Join exam** → popup switches to
      **Monitoring active** showing the exam title and your name
- [ ] Wrong code → popup shows "No exam for code …"; empty name → "Enter your name."
- [ ] `GET /exams/<examId>/sessions` lists your student session as `ACTIVE`
- [ ] Before joining, the service-worker console records nothing (extension inert)

## Tab switching

- [ ] Switch between two tabs → each switch logs `recorded TAB_SWITCH`
      with the `url` of the tab switched TO
- [ ] Open a new tab → `TAB_CREATED` (`chrome://newtab/` is correct — that IS
      the tab's URL until you navigate)
- [ ] Type a URL in that tab → `TAB_NAVIGATE` with the real `url` (and `from`)
- [ ] Navigating in a BACKGROUND tab records nothing (no clutter)
- [ ] Navigate a tab somewhere, then close it → `TAB_CLOSED` with the `url` it had

## Window focus

- [ ] Alt-Tab to another application → `WINDOW_BLUR` recorded
- [ ] Return to Chrome → `WINDOW_FOCUS` recorded
- [ ] Minimize Chrome → `WINDOW_BLUR` recorded
- [ ] Switching tabs records exactly ONE `TAB_SWITCH` (no duplicate visibility events)

## Clipboard

- [ ] Copy text on a page → `COPY` recorded
- [ ] Paste into a field → `PASTE` recorded
- [ ] Cut text → `CUT` recorded

## Session lifecycle

- [ ] While joined, `GET /exams/<examId>/sessions` shows the session `ACTIVE`
      (heartbeat every 30s keeps `lastSeenAt` fresh)
- [ ] Click **Leave exam** → session becomes `ENDED`; popup returns to the join form
- [ ] Re-join → a new `ACTIVE` session appears (the old one stays `ENDED`)
- [ ] Close Chrome completely while joined, wait ~2 min, list sessions →
      the session is `ENDED`, `endedAt` ≈ the last heartbeat
- [ ] Close the exam (`POST /exams/<examId>/status {"status":"CLOSED"}`), then try
      to join with the code → popup shows "… is not open for registration"

## Events persisted in the database

- [ ] `GET /sessions/<sessionId>/violations` returns all events above, in order,
      with correct `type`, `url`, and `occurredAt` timestamps
- [ ] Same rows visible in `npm run prisma:studio` (Violation table)

## Resetting between test runs

Wipe all exams, sessions and violations:

```bash
curl -X DELETE http://localhost:3000/exams
```

(or delete rows in `npm run prisma:studio`, or `npx prisma migrate reset` for a
full wipe). Also click **Leave exam** (or reload the extension) to clear the
stored enrollment — otherwise it keeps reporting into a now-deleted session.

## Failure behavior

- [ ] Stop the backend, switch tabs → worker console warns `could not reach backend`,
      Chrome itself keeps working normally
- [ ] Restart the backend, switch tabs → events are recorded again

---

| Date | Tester | Result / notes |
|------|--------|----------------|
|      |        |                |
