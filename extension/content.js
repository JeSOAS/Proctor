// Content script
// ----------------------------------------------------------------
// Runs in the context of every web page (per host_permissions).
// Detects in-page events the background worker can't see (clipboard use)
// and forwards them via chrome.runtime.sendMessage.
// All backend communication happens in background.js.
//
// Tab switches and window focus are handled by the background worker —
// visibilitychange is NOT reported here because it duplicates those events.
//
// To view this log:
//   Open any page  →  F12  →  Console tab
//
// NOTE: After reloading the extension at chrome://extensions, you must REFRESH
//       any open tabs — already-loaded pages won't have the new content script.
// ----------------------------------------------------------------

console.log('[Proctor/cs] Content script loaded on', location.href);

function send(type, payload = {}) {
  // Fire-and-forget; ignore errors when the worker is asleep
  try {
    chrome.runtime.sendMessage({ type, payload });
  } catch (_) {}
}

// ---------- Clipboard ----------

document.addEventListener('copy', () => {
  console.log('[Proctor/cs] copy');
  send('COPY');
});

document.addEventListener('paste', () => {
  console.log('[Proctor/cs] paste');
  send('PASTE');
});

document.addEventListener('cut', () => {
  console.log('[Proctor/cs] cut');
  send('CUT');
});

// ---------- Exam submission (Google Forms) ----------
//
// After a successful submit, Google Forms navigates to a ".../formResponse"
// page and shows "Your response has been recorded." Detecting that page load is
// a reliable "the student finished" signal. The background worker only records
// it while the student is enrolled, so it's harmless on any other form.

function detectGoogleFormSubmit() {
  if (location.hostname === 'docs.google.com' && location.pathname.includes('/formResponse')) {
    console.log('[Proctor/cs] Google Form submission detected');
    send('EXAM_SUBMITTED', { url: location.href });
  }
}

detectGoogleFormSubmit();

// ---------- Fullscreen lock ----------
//
// While a student is enrolled AND on the exam page, require fullscreen. Show a
// blocking overlay that they must click to enter fullscreen; if they leave
// fullscreen, re-show it and report FULLSCREEN_EXIT. Entering fullscreen needs a
// user gesture, so it's driven by the button click.

function hostOf(value) {
  if (!value) return '';
  try {
    return new URL(value.startsWith('http') ? value : 'https://' + value).host.toLowerCase();
  } catch (_) {
    return '';
  }
}

function onExamPage(examLink) {
  const examHost = hostOf(examLink);
  if (!examHost) return false;
  const h = location.host.toLowerCase();
  return h === examHost || h.endsWith('.' + examHost);
}

let fsOverlay = null;

function showFullscreenOverlay() {
  if (fsOverlay) {
    fsOverlay.style.display = 'flex';
    return;
  }
  const o = document.createElement('div');
  o.id = '__proctor_fs_overlay';
  o.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:20px;text-align:center;padding:24px;' +
      'background:rgba(15,23,42,0.97);color:#fff;font-family:system-ui,-apple-system,sans-serif;',
  );
  o.innerHTML =
    '<div style="font-size:26px;font-weight:700;">Exam in progress</div>' +
    '<div style="font-size:17px;max-width:520px;line-height:1.5;">' +
    'This exam is monitored. You must stay in <b>fullscreen</b> and <b>must not leave the browser</b>. ' +
    'Leaving fullscreen or switching away is recorded.</div>';
  const btn = document.createElement('button');
  btn.textContent = 'Enter fullscreen & continue';
  btn.setAttribute(
    'style',
    'font-size:16px;font-weight:600;padding:12px 22px;border:0;border-radius:8px;' +
      'background:#2563eb;color:#fff;cursor:pointer;',
  );
  btn.addEventListener('click', async () => {
    try {
      await document.documentElement.requestFullscreen();
      o.style.display = 'none';
    } catch (_) {
      /* user denied / not allowed — overlay stays */
    }
  });
  o.appendChild(btn);
  (document.body || document.documentElement).appendChild(o);
  fsOverlay = o;
}

async function initFullscreenLock() {
  let enrollment, examLink;
  try {
    const store = await chrome.storage.local.get('enrollment');
    enrollment = store.enrollment;
    examLink = enrollment && enrollment.examLink;
  } catch (_) {
    return;
  }
  if (!enrollment || !onExamPage(examLink)) return;

  if (!document.fullscreenElement) showFullscreenOverlay();

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      if (fsOverlay) fsOverlay.style.display = 'none';
    } else {
      send('FULLSCREEN_EXIT', { url: location.href });
      showFullscreenOverlay();
    }
  });
}

// document_start can run before <body>; wait for the DOM if needed.
if (document.body) initFullscreenLock();
else document.addEventListener('DOMContentLoaded', initFullscreenLock);
