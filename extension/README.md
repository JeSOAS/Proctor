# Proctor Extension (MV3)

Monitors student-side activity and reports events to the local backend (`http://localhost:3000`).

## Load it in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right) on
3. Click **Load unpacked** and select this `extension/` folder

## After changing the code

1. Click the **reload** icon on the Proctor card at `chrome://extensions`
2. **Refresh any open tabs** — the content script only injects into freshly loaded pages

## Debugging consoles

| Source | What logs there | How to open |
|---|---|---|
| Content script (`content.js`) | in-page events: clipboard | any page → **F12** → Console |
| Service worker (`background.js`) | tab switches, window focus changes, heartbeat | `chrome://extensions` → Proctor → `service worker` link |

Log lines are prefixed `[Proctor/cs]` (content) or `[Proctor/bg]` (background).

## Files

```
extension/
├── manifest.json     MV3 config — permissions, scripts, action
├── background.js     service worker — tab + window events
├── content.js        injected into pages — clipboard events
└── popup.html        toolbar popup (status indicator)
```
