// Background service worker
// ----------------------------------------------------------------
// Runs persistently in the background (event-driven under MV3).
// Has access to chrome.tabs, chrome.windows — APIs not available to content scripts.
//
// To view this log:
//   chrome://extensions  →  Proctor  →  click "service worker" link  →  Console tab
// ----------------------------------------------------------------

console.log('[Proctor/bg] Service worker started at', new Date().toISOString());

// ---------- Tab events ----------

chrome.tabs.onActivated.addListener((activeInfo) => {
  // User switched to a different tab within the same window
  console.log('[Proctor/bg] tab.onActivated', activeInfo);
});

chrome.tabs.onCreated.addListener((tab) => {
  console.log('[Proctor/bg] tab.onCreated', { id: tab.id, url: tab.pendingUrl || tab.url });
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log('[Proctor/bg] tab.onRemoved', { tabId, windowClosing: removeInfo.isWindowClosing });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Fires often — narrow to URL changes and full-load completes
  if (changeInfo.url) {
    console.log('[Proctor/bg] tab.onUpdated (url changed)', { tabId, url: changeInfo.url });
  }
  if (changeInfo.status === 'complete') {
    console.log('[Proctor/bg] tab.onUpdated (loaded)', { tabId, url: tab.url });
  }
});

// ---------- Window events ----------

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // User switched to another app — the violation we care about most
    console.log('[Proctor/bg] window.onFocusChanged → CHROME LOST FOCUS (user switched away)');
  } else {
    console.log('[Proctor/bg] window.onFocusChanged → focused windowId =', windowId);
  }
});

chrome.windows.onCreated.addListener((win) => {
  console.log('[Proctor/bg] window.onCreated', { id: win.id, type: win.type });
});

chrome.windows.onRemoved.addListener((windowId) => {
  console.log('[Proctor/bg] window.onRemoved', { windowId });
});

// ---------- Messages from content script ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Proctor/bg] msg from content', {
    type: msg.type,
    payload: msg.payload,
    fromTabId: sender.tab?.id,
    fromUrl: sender.tab?.url
  });
  sendResponse({ received: true });
  return false;
});
