# Mock Exam — Behavior & Edge-Case Test Plan

For a mock run where students deliberately try to cheat. Tick each item and note
anything unexpected. **Observe results** in the dashboard (exam → click a student
→ expand their events) and, if helpful, the extension's service-worker console
(`chrome://extensions` → Proctor → "service worker").

## Preconditions

- [ ] Backend deployed (latest `main`) and reachable from the test network.
- [ ] Teacher logged into the dashboard; an exam created and OPEN; join code shared.
- [ ] Each student device has the extension installed and is on the test network.
- [ ] Do a 1-person dry run first (create → join → tab-switch → copy → see it land).

---

## 1. Join & registration

- [ ] Correct code + name → popup shows "Monitoring active"; student appears ACTIVE in the dashboard.
- [ ] Wrong code → error, no session created.
- [ ] Empty name → error.
- [ ] Join a **CLOSED** exam → refused.
- [ ] (Scheduled exam) join **before** start time → "has not started yet".
- [ ] (Scheduled exam) join **after** end time → refused.
- [ ] Leave, then re-join → a new ACTIVE session; the old one shows ENDED.
- [ ] Two students type the **same name** → two separate sessions, both visible.
- [ ] Join, then close the popup without leaving → still monitored.

## 2. Tab & window behaviors (the core "cheating" signals)

- [ ] Switch to another open tab (e.g. a search engine) → `TAB_SWITCH` with that tab's URL.
- [ ] Open a new tab → `TAB_CREATED`.
- [ ] In the current tab, type a new URL or click a link → `TAB_NAVIGATE` (from → to).
- [ ] Close a tab → `TAB_CLOSED` with the URL it had.
- [ ] Alt-Tab to another app (Word / PDF / Notes) → `WINDOW_BLUR`.
- [ ] Return to Chrome → `WINDOW_FOCUS`.
- [ ] Minimize Chrome → `WINDOW_BLUR`.
- [ ] Switch to a second Chrome window → focus change recorded.
- [ ] Rapidly switch tabs several times → every switch recorded, in order, no duplicates.
- [ ] Switch to a tab that is still loading → its URL is still captured (not blank).

## 3. Clipboard

- [ ] Copy text on the exam page (Ctrl+C) → `COPY`.
- [ ] Copy via the right-click menu → `COPY`.
- [ ] Paste into the form (Ctrl+V) → `PASTE`.
- [ ] Cut text (Ctrl+X) → `CUT`.
- [ ] Copy something on a **different** normal tab → `COPY` logged under that tab's URL.
- [ ] Copy an image rather than text → `COPY` still fires.

## 4. Normal behavior — there should be NO false positives

- [ ] Read questions, scroll, click radio buttons, **type answers**, stay on the page → **no** violation events (only heartbeats). Confirms typing/clicking/scrolling are not logged.
- [ ] Submit the form normally → no spurious events.

## 5. Session reliability

- [ ] Reload the exam page → still monitored (events after the reload still record).
- [ ] Leave the browser idle ~2 min, then switch a tab → still recorded (the worker wakes).
- [ ] Close the whole browser → session becomes ENDED within ~90 s in the dashboard.
- [ ] ⚠ Laptop sleeps / lid closed, then wake → the session ENDs during sleep; after waking the student must **re-join** (the extension clears its stale session). Confirm this behavior.
- [ ] Disable the extension mid-exam → session ENDs (looks like leaving); re-enable + re-join to resume.
- [ ] "Leave exam" in the popup → session ENDED; monitoring stops.
- [ ] Teacher **closes the exam** mid-session → the student's next event/heartbeat is rejected; they stop being monitored and cannot re-join.

## 6. Network

- [ ] ⚠ Turn WiFi off ~1 min, do some tab switches, turn WiFi back on → events **during the outage are lost** (no offline buffer yet); the session may briefly show ENDED and a new session appears on re-activity. Confirm the extent of the loss.
- [ ] Brief blip (< 90 s) → heartbeat catches up; the session stays.

## 7. Multiple students / load

- [ ] 5–10+ students join at once → all appear; counts update (~5 s refresh).
- [ ] Each student's events appear **only** under their own session (isolation).
- [ ] Heavy simultaneous activity → nothing lost or misattributed; dashboard stays responsive.

## 8. Data correctness

- [ ] Every event has the right type, a URL where applicable, and a timestamp.
- [ ] Event order matches what the student actually did.
- [ ] Exactly **one** event per action (e.g. one `TAB_SWITCH`, no duplicate visibility event).
- [ ] ⚠ A device with a wrong system clock → timestamps reflect **that device's** clock (times are client-side).

## 9. Evasion attempts / environment quirks

- [ ] Switch to a `chrome://` page (settings/extensions) → `TAB_SWITCH` recorded; but clipboard on `chrome://` pages is **not** caught (content scripts can't run there).
- [ ] ⚠ Open an **Incognito** window and switch to it → confirm what records (the extension is usually disabled in incognito; the focus change may or may not register). Realistic evasion — worth testing.
- [ ] Open a different **Chrome profile** window → similar to incognito.
- [ ] Open **DevTools** → confirm whether it registers as focus loss.
- [ ] Try to stop the service worker / disable the extension → heartbeats stop → session ENDs. Tampering shows up as a dropped student.

---

## Blind spots — will NOT be detected (by design or current limitation)

State these plainly so results aren't misread:

- **A second device** (phone/tablet) used to look up answers — completely invisible.
- **Passive reading** of a side-by-side window or a second monitor *without clicking it* — no focus change, so nothing records.
- **What** was copied or typed — no content is captured (no keystroke logging, clipboard contents not stored), only that it happened.
- Anything **before joining** or **after leaving/closing** the exam.
- Content-script events (clipboard) on **`chrome://` pages or the Web Store** — though tab switches to them are still seen.

## Not built yet — do NOT expect these in the mock

- **Warning pop-ups** to the student (Week 9) — students see no warnings.
- **Auto-submit** on a violation threshold (Week 10) — `maxWarnings` is stored but not enforced; the exam will **not** auto-submit.
- **Restricted-site blocklist** — URLs are captured but not matched against a banned list.
- **Offline buffering / a DISCONNECTED status** — network drops lose events and can look like the student left.

---

| Date | Tester | Result / notes |
|------|--------|----------------|
|      |        |                |
