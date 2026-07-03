# Manual Test Checklist — Week 4 Monitoring Logic

Run through this list after any change to the extension or backend. Mark each
item and note the date + tester at the bottom.

## Setup

- [ ] `cd backend && npm run prisma:migrate` — SQLite db exists at `backend/prisma/dev.db`
- [ ] `npm run start:dev` — console shows `Backend listening on http://localhost:3000`
- [ ] <http://localhost:3000/health> returns `{"status":"ok", ...}`
- [ ] Extension loaded/reloaded at `chrome://extensions`, all open tabs refreshed

## Session auto-connect (rector's requirement)

- [ ] Open the service-worker console (`chrome://extensions` → Proctor → `service worker`)
- [ ] It shows `[Proctor/bg] session started: <id>` — note the id
- [ ] `GET http://localhost:3000/sessions` lists that session with status `ACTIVE`

## Tab switching

- [ ] Open two tabs and switch between them → each switch logs `recorded TAB_SWITCH`
      with the `url` of the tab switched TO
- [ ] Open a new tab → `TAB_CREATED` recorded (`chrome://newtab/` is correct —
      that IS the tab's URL until you navigate)
- [ ] Type a URL in that tab → `TAB_NAVIGATE` recorded with the real `url`
      (and `from` in the payload showing where the tab was before)
- [ ] Navigating in a BACKGROUND tab records nothing (no clutter)
- [ ] Navigate the tab somewhere, then close it → `TAB_CLOSED` recorded with the
      `url` the tab had when it was closed

## Window focus

- [ ] Alt-Tab to another application → `WINDOW_BLUR` recorded
- [ ] Return to Chrome → `WINDOW_FOCUS` recorded
- [ ] Minimize Chrome → `WINDOW_BLUR` recorded
- [ ] Switching tabs records exactly ONE `TAB_SWITCH` (no duplicate visibility events)

## Session lifecycle

- [ ] While Chrome is open, `GET /sessions` shows the session `ACTIVE`
      (heartbeat every 30s keeps `lastSeenAt` fresh)
- [ ] Close Chrome completely, wait ~2 minutes, `GET /sessions` again →
      session is `ENDED`, `endedAt` equals the last heartbeat time
- [ ] Reopen Chrome → a NEW single session is created (exactly one, not two)

## Clipboard

- [ ] Copy text on any page → `COPY` recorded
- [ ] Paste text into a text field → `PASTE` recorded
- [ ] Cut text → `CUT` recorded

## Events persisted in the database

- [ ] `GET http://localhost:3000/sessions/<id>/violations` returns all events above,
      in order, with correct `type`, `url`, and `occurredAt` timestamps
- [ ] Same rows visible in `npm run prisma:studio` (Violation table)

## Resetting between test runs

Wipe all recorded sessions/violations before a fresh run:

```bash
curl -X DELETE http://localhost:3000/sessions
```

(or delete rows in `npm run prisma:studio`, or `npx prisma migrate reset` for a
full wipe). Also clear the extension's stored session id by reloading the
extension at `chrome://extensions` — or it will keep reporting into the old id.

## Failure behavior

- [ ] Stop the backend, switch tabs → worker console warns `could not reach backend`,
      Chrome itself keeps working normally
- [ ] Restart the backend, switch tabs → events are recorded again

---

| Date | Tester | Result / notes |
|------|--------|----------------|
|      |        |                |
