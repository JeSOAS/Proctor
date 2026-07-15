// Background service worker
// ----------------------------------------------------------------
// Records tab/window events for a student who has JOINED an exam. The student
// registers in the popup (name + join code); the popup stores the resulting
// `enrollment` ({ sessionId, examTitle, ... }) in chrome.storage.local. Until
// that exists, this worker does nothing — no monitoring before the student joins.
//
// A heartbeat pings the backend every 30s; when the browser closes the beats
// stop and the backend auto-marks the session ENDED (MV3 workers are killed
// without any shutdown event we could report from).
//
// To view this log:
//   chrome://extensions  →  Proctor  →  click "service worker" link  →  Console tab
// ----------------------------------------------------------------

// Production backend. To repoint the extension at a different server, change
// this in BOTH background.js and popup.js, or override at runtime via
// chrome.storage.local.apiBase (see docs/DECISIONS.md #8).
const DEFAULT_API_BASE = 'https://proctor.jesoas.org';
const HEARTBEAT_PERIOD_MINUTES = 0.5;

console.log('[Proctor/bg] Service worker started at', new Date().toISOString());

// ---------- Shared state (chrome.storage.local) ----------

async function apiBase() {
  const { apiBase } = await chrome.storage.local.get('apiBase');
  return apiBase || DEFAULT_API_BASE;
}

async function getEnrollment() {
  const { enrollment } = await chrome.storage.local.get('enrollment');
  return enrollment || null;
}

async function clearEnrollment() {
  await chrome.storage.local.remove('enrollment');
  console.log('[Proctor/bg] enrollment cleared — monitoring stopped');
}

// ---------- Reporting ----------
//
// Every event flows through here. If the student has not joined an exam, it is
// a no-op — the extension is inert until enrollment exists.

async function report(type, payload = {}) {
  const enrollment = await getEnrollment();
  if (!enrollment) return;
  try {
    const base = await apiBase();
    const res = await fetch(`${base}/sessions/${enrollment.sessionId}/violations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload, url: payload.url, occurredAt: new Date().toISOString() }),
    });
    if (res.status === 404) {
      // Session ended server-side (exam closed, or timed out) — stop monitoring.
      // The student must re-join from the popup to resume.
      await clearEnrollment();
      return;
    }
    if (!res.ok) throw new Error(`POST violation → ${res.status}`);
    console.log('[Proctor/bg] recorded', type, payload);
  } catch (err) {
    console.warn('[Proctor/bg] could not reach backend, event lost:', type, err.message);
  }
}

// ---------- Heartbeat ----------

async function sendHeartbeat() {
  const enrollment = await getEnrollment();
  if (!enrollment) return;
  try {
    const base = await apiBase();
    const res = await fetch(`${base}/sessions/${enrollment.sessionId}/heartbeat`, { method: 'POST' });
    if (res.status === 404) await clearEnrollment();
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

// ---------- Messages ----------
//
// Control messages from the popup start with "__proctor_"; everything else is
// a monitoring event forwarded by the content script.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === '__proctor_enrolled') {
    sendHeartbeat(); // begin monitoring immediately, don't wait for the next alarm
    sendResponse({ ok: true });
    return false;
  }
  report(msg.type, { ...msg.payload, url: sender.tab?.url });
  sendResponse({ received: true });
  return false;
});
