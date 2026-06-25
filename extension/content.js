// Content script
// ----------------------------------------------------------------
// Runs in the context of every web page (per host_permissions).
// Has access to the DOM but NOT to chrome.tabs / chrome.windows.
// Forwards interesting events to the background worker via chrome.runtime.sendMessage.
//
// To view this log:
//   Open any page  →  F12  →  Console tab
//
// NOTE: After reloading the extension at chrome://extensions, you must REFRESH
//       any open tabs — already-loaded pages won't have the new content script.
// ----------------------------------------------------------------

console.log('[Proctor/cs] Content script loaded on', location.href);

// ---------- Helpers ----------

function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

function send(type, payload = {}) {
  // Fire-and-forget; ignore errors when the worker is asleep
  try {
    chrome.runtime.sendMessage({ type, payload });
  } catch (_) {}
}

// ---------- Mouse ----------

// Throttle mousemove so we don't flood the console
document.addEventListener('mousemove', throttle((e) => {
  console.log('[Proctor/cs] mousemove', { x: e.clientX, y: e.clientY });
  storeLocal("mousemove", {
    x: e.clientX,
    y: e.clientY
  });
}, 500));

document.addEventListener('click', (e) => {
  console.log('[Proctor/cs] click', {
    x: e.clientX,
    y: e.clientY,
    target: e.target?.tagName,
    button: e.button
  });
  storeLocal("click", {
    x: e.clientX,
    y: e.clientY,
    target: e.target?.tagName
  });
});

document.addEventListener('contextmenu', (e) => {
  console.log('[Proctor/cs] contextmenu (right-click)', { x: e.clientX, y: e.clientY });
});

// ---------- Keyboard ----------

document.addEventListener('keydown', (e) => {
  console.log('[Proctor/cs] keydown', {
    key: e.key,
    code: e.code,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey
  });
  storeLocal("keydown", {
    key: e.key,
    code: e.code
  });
});

// ---------- Clipboard ----------

document.addEventListener('copy', () => {
  console.log('[Proctor/cs] copy');

  send('COPY', { url: location.href });

  storeLocal("copy");
});

document.addEventListener('paste', () => {
  console.log('[Proctor/cs] paste');
  send('PASTE', { url: location.href });
  storeLocal("paste");
});

document.addEventListener('cut', () => {
  console.log('[Proctor/cs] cut');
  send('CUT', { url: location.href });
  storeLocal("cut");
});


// ---------- Focus / visibility ----------

window.addEventListener('focus', () => {
  console.log('[Proctor/cs] window.focus');
});

window.addEventListener('blur', () => {
  console.log('[Proctor/cs] window.blur');
});

document.addEventListener('visibilitychange', () => {
  console.log('[Proctor/cs] visibilitychange →', document.visibilityState);
  send('VISIBILITY', { state: document.visibilityState, url: location.href });
  storeLocal("visibility", {
    state: document.visibilityState
  });

});

// ---------- Page lifecycle ----------

window.addEventListener('beforeunload', () => {
  console.log('[Proctor/cs] beforeunload');
});
function storeLocal(type, data = {}) {
  fetch("http://localhost:3000/logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type,
      data,
      time: Date.now(),
      url: location.href
    })
  });
}