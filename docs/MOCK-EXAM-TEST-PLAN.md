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
- [ ] Leave, then re-join → the same session becomes ACTIVE again with a "Re-joined" row (one row per student).
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
- [ ] Laptop sleeps / lid closed < 10 min, then wake → the session shows Disconnected, then resumes with an "offline" gap row (no re-join needed).
- [ ] Disable the extension mid-exam → session ENDs (looks like leaving); re-enable + re-join to resume.
- [ ] "Leave exam" in the popup → session ENDED; monitoring stops.
- [ ] Teacher **closes the exam** mid-session → the student's next event/heartbeat is rejected; they stop being monitored and cannot re-join.

## 6. Network

- [ ] Turn WiFi off ~1 min, do some tab switches, turn WiFi back on → the switches made offline still appear (buffered and sent on reconnect), in the right order.
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

## 10. Added after the 17 Sep trial

- [ ] Open `https://<host>/` → redirected to `/dashboard/`.
- [ ] Exam page → **Export summary (CSV)** → `<exam title> - summary.csv`: one row per student; violations, assessment and flags match the dashboard; times are local.
- [ ] **Export full log (CSV)** → one row per event with the same wording as the student's log on screen ("Away from Chrome for …", "Opened the exam"…), in time order, framed by Joined / Ended rows.
- [ ] Non-Latin (e.g. Thai) names display correctly when the CSV is opened in Excel.
- [ ] Both export buttons are disabled while no student has joined.
- [ ] Scheduled exam: leave the dashboard **closed** past the end time → within ~30 s the exam is CLOSED and running sessions show "Exam ended".
- [ ] Exam with no end time, reopened after being closed → stays open (does not close again straight away).
- [ ] Right after joining, open the Chrome Web Store → **not** counted as a violation.
- [ ] Student A joined and online; a second device joins with A's ID and a different name → refused ("This student ID is already being used…"); A shows "🪪 ID also used by someone else" and the log row has the name entered.
- [ ] A leaves; the ID is used again with a different name → allowed; A's original name is kept and "✏️ Different name on re-join" appears.
- [ ] (Webhook configured) a Google Form is submitted with a student ID that never joined → a "Submitted, but no Proctor session with this ID" row appears; it is not counted in "joined".

## 11. Extension 1.2.2

- [ ] Open the exam form first, **then** join in the popup → the fullscreen prompt appears on the already-open exam tab without refreshing.
- [ ] In fullscreen on the exam, switch to another tab, then back → the prompt appears again ("Continue in fullscreen" / "Finish").
- [ ] Exam with **Notify students** on: switch to a non-allowed site (e.g. chatgpt.com) → a red "Proctor warning … Warning N of M" banner appears at the top of that page within a couple of seconds.
- [ ] Same, with Windows notifications for Chrome turned **off** → the banner still appears.
- [ ] Notify students **off** → no banner, no notification.
- [ ] Alt-Tab to another app for **under 30 s** and back → no warning.
- [ ] Alt-Tab away for **30 s or more** and back → banner appears on return ("Warning N of M").
- [ ] Open a **second Chrome window** with chatgpt.com, switch to it with Alt-Tab / the taskbar → a "Switched browser tab" violation with the ChatGPT URL, and a banner.
- [ ] Switch back to the exam window → recorded, not counted.
- [ ] Set *Away from Chrome allowed* to 60 s mid-exam → earlier 30–59 s absences stop counting; the student's count, badges and both CSV exports update on the next refresh.
- [ ] Service-worker console (`chrome://extensions` → Proctor → service worker) shows "warning shown on page" for each warning.

## Not built — do NOT expect these in the mock

- **Auto-submitting** the form on the warning limit — the session closes instead ("Reached warning limit").
- **Submission confirmation for non-Google forms** — other platforms rely on Finish / Leave.

---

| Date | Tester | Result / notes |
|------|--------|----------------|
|      |        |                |
