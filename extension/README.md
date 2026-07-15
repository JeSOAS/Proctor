# Proctor Extension (MV3)

Monitors a student's activity **during an exam they have joined** and reports
events to the backend. The extension is inert until the student joins an exam
from the popup — no monitoring happens before that.

The backend URL is `DEFAULT_API_BASE`, defined in both `background.js` and
`popup.js` (`http://localhost:3000` for local dev). **Change both to the
production URL before submitting to the Chrome Web Store.**

## Load it in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right) on
3. Click **Load unpacked** and select this `extension/` folder

## How a student joins

1. Instructor creates an exam (`POST /exams`) and shares the 6-character join code.
2. Student clicks the Proctor toolbar icon → enters name + join code → **Join exam**.
3. The popup registers (`POST /exams/:code/register`), stores the returned
   session, and the background worker starts recording events + heartbeating.
4. **Leave exam** ends the session.

## After changing the code

1. Click the **reload** icon on the Proctor card at `chrome://extensions`
2. **Refresh any open tabs** — the content script only injects into freshly loaded pages

## Debugging consoles

| Source | What logs there | How to open |
|---|---|---|
| Content script (`content.js`) | in-page events: clipboard | any page → **F12** → Console |
| Service worker (`background.js`) | tab switches, window focus, heartbeat | `chrome://extensions` → Proctor → `service worker` link |

Log lines are prefixed `[Proctor/cs]` (content) or `[Proctor/bg]` (background).

## Files

```
extension/
├── manifest.json     MV3 config — permissions, scripts, action
├── background.js     service worker — tab + window events, heartbeat
├── content.js        injected into pages — clipboard events
├── popup.html        toolbar popup — join form / active state
└── popup.js          popup logic — register / leave
```
