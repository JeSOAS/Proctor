// Background service worker
// ----------------------------------------------------------------
// Single reporting path to the backend. On startup it creates (or reuses)
// a monitoring session, then records every tab/window event as a violation
// row via the REST API. Content scripts forward their events here.
//
// A heartbeat pings the backend every 30s; when the browser closes, the
// beats stop and the backend auto-marks the session ENDED (MV3 workers are
// killed without any shutdown event we could report from).
//
// To view this log:
//   chrome://extensions  →  Proctor  →  click "service worker" link  →  Console tab
// ----------------------------------------------------------------

const API_BASE = 'http://localhost:3000';
const HEARTBEAT_PERIOD_MINUTES = 0.5;

console.log('[Proctor/bg] Service worker started at', new Date().toISOString());

// ---------- Session handling ----------
//
// The worker is restarted by Chrome whenever it goes idle, so the session id
// is kept in chrome.storage.local rather than a variable. The in-flight
// promise is memoized: at startup many events fire at once, and without this
// each of them would race through "storage is empty → create a session",
// producing several parallel sessions.

let sessionIdPromise = null;

function getSessionId(forceNew = false) {
  if (forceNew || !sessionIdPromise) {
    sessionIdPromise = (async () => {
      if (!forceNew) {
        const { sessionId } = await chrome.storage.local.get('sessionId');
        if (sessionId) return sessionId;
      }
      const res = await fetch(`${API_BASE}/sessions`, { method: 'POST' });
      if (!res.ok) throw new Error(`POST /sessions → ${res.status}`);
      const session = await res.json();
      await chrome.storage.local.set({ sessionId: session.id });
      console.log('[Proctor/bg] session started:', session.id);
      return session.id;
    })();
    // If creation failed (backend down), allow the next caller to retry
    sessionIdPromise.catch(() => {
      sessionIdPromise = null;
    });
  }
  return sessionIdPromise;
}

async function report(type, payload = {}) {
  try {
    let res = await postViolation(await getSessionId(), type, payload);
    if (res.status === 404) {
      // Stored session no longer exists (backend DB was reset) — start over
      res = await postViolation(await getSessionId(true), type, payload);
    }
    if (!res.ok) throw new Error(`POST violation → ${res.status}`);
    console.log('[Proctor/bg] recorded', type, payload);
  } catch (err) {
    console.warn('[Proctor/bg] could not reach backend, event lost:', type, err.message);
  }
}

function postViolation(sessionId, type, payload) {
  return fetch(`${API_BASE}/sessions/${sessionId}/violations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload, url: payload.url, occurredAt: new Date().toISOString() }),
  });
}

// ---------- Heartbeat ----------

async function sendHeartbeat() {
  try {
    const sessionId = await getSessionId();
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/heartbeat`, { method: 'POST' });
    if (res.status === 404) await getSessionId(true);
  } catch (err) {
    console.warn('[Proctor/bg] heartbeat failed:', err.message);
  }
}

chrome.alarms.create('heartbeat', { periodInMinutes: HEARTBEAT_PERIOD_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') sendHeartbeat();
});
sendHeartbeat(); // also beat immediately on every worker start

// ---------- Tab URL registry ----------
//
// onRemoved fires after the tab is already gone, so its URL must be
// remembered while the tab is alive. Kept in chrome.storage.session:
// survives service-worker restarts, cleared when the browser closes.
// One key per tab so concurrent writes can't clobber each other.

function rememberTabUrl(tabId, url) {
  if (url) chrome.storage.session.set({ ['tabUrl:' + tabId]: url });
}

async function recallTabUrl(tabId, { remove = false } = {}) {
  const key = 'tabUrl:' + tabId;
  const stored = await chrome.storage.session.get(key);
  if (remove) chrome.storage.session.remove(key);
  return stored[key];
}

// Seed the registry with tabs that were already open before this worker started
chrome.tabs.query({}).then((tabs) => {
  for (const tab of tabs) rememberTabUrl(tab.id, tab.url || tab.pendingUrl);
});

// Track navigations: keep the registry current and record where the user
// went. Without this, a tab opened as chrome://newtab/ and then navigated
// would never show its real URL until the next switch back to it.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  const from = await recallTabUrl(tabId);
  rememberTabUrl(tabId, changeInfo.url);
  // Only report navigations in the tab the user is looking at — background
  // tabs redirect/refresh on their own and would clutter the log.
  if (tab.active && changeInfo.url !== from) {
    report('TAB_NAVIGATE', { tabId, url: changeInfo.url, from });
  }
});

// ---------- Tab events ----------

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  let url;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    url = tab.url || tab.pendingUrl; // url is empty while the tab is still loading
  } catch (_) {}
  if (url) rememberTabUrl(activeInfo.tabId, url);
  else url = await recallTabUrl(activeInfo.tabId);
  report('TAB_SWITCH', { tabId: activeInfo.tabId, url });
});

chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url;
  rememberTabUrl(tab.id, url);
  report('TAB_CREATED', { tabId: tab.id, url });
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const url = await recallTabUrl(tabId, { remove: true });
  report('TAB_CLOSED', { tabId, url, windowClosing: removeInfo.isWindowClosing });
});

// ---------- Window events ----------

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // User switched to another app — the violation we care about most
    report('WINDOW_BLUR', {});
  } else {
    report('WINDOW_FOCUS', { windowId });
  }
});

// ---------- Messages from content script ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  report(msg.type, { ...msg.payload, url: sender.tab?.url });
  sendResponse({ received: true });
  return false;
});
