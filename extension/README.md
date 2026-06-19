# Proctor Extension (Dev Prototype)

Logs student-side events to the console — no backend connection yet.

## Load it in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right) on
3. Click **Load unpacked**
4. Select this `extension/` folder
5. The extension appears in the list. Pin it to the toolbar if you like.

## Where the logs go

There are two separate consoles:

| Source | What logs there | How to open |
|---|---|---|
| **Content script** (`content.js`) | mouse moves, clicks, keypress, copy/paste, visibility | Open any page → **F12** → Console |
| **Background service worker** (`background.js`) | tab switches, tab created/closed, window focus changes | `chrome://extensions` → **Proctor** → click `service worker` link |

All log lines are prefixed with `[Proctor/cs]` (content) or `[Proctor/bg]` (background) so you can filter the console.

## When you change the code

1. Go to `chrome://extensions`
2. Click the **reload** icon on the Proctor card
3. **Refresh any open tabs** — the content script only injects into freshly loaded pages

## Files

```
extension/
├── manifest.json     MV3 config — permissions, scripts, action
├── background.js     service worker — tab + window events
├── content.js        injected into pages — mouse, keyboard, clipboard
└── popup.html        small toolbar popup (status indicator)
```

## Next steps (Week 3+)

- Add `chrome.storage.local` writes so events survive worker restarts
- Connect to backend via `chrome.runtime.sendMessage` → `fetch` to NestJS
- Narrow `host_permissions` from `<all_urls>` to the actual exam URLs
- Migrate to TypeScript once a Vite/esbuild pipeline is in place
