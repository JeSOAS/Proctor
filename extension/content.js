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

// ---------- Fullscreen lock + finish prompt ----------
//
// While a student is enrolled AND on the exam page, require fullscreen. Wanting
// to LEAVE fullscreen is treated as "I'm done": we intercept Esc (Keyboard Lock)
// and catch any exit, then show a prompt with two choices —
//   • Continue in fullscreen  → re-enter and keep working
//   • Finish & end exam        → end the session (reason FINISHED_FULLSCREEN)
// Fullscreen can't be made truly inescapable (holding Esc always force-exits),
// so we also react to fullscreenchange as a backstop and log FULLSCREEN_EXIT.

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
let fsActive = true; // enforcement stops once the student finishes

function buildOverlay() {
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
    '<div style="font-size:17px;max-width:540px;line-height:1.5;">' +
    'This exam is monitored and must stay in <b>fullscreen</b>. Only finish once you have ' +
    '<b>submitted your answers</b> — finishing ends monitoring.</div>';

  const row = document.createElement('div');
  row.setAttribute('style', 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;');

  const cont = document.createElement('button');
  cont.textContent = 'Continue in fullscreen';
  cont.setAttribute(
    'style',
    'font-size:16px;font-weight:600;padding:12px 22px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;',
  );
  cont.addEventListener('click', enterFullscreen);

  const fin = document.createElement('button');
  fin.textContent = 'Finish & end exam';
  fin.setAttribute(
    'style',
    'font-size:16px;font-weight:600;padding:12px 22px;border:1px solid #94a3b8;border-radius:8px;background:transparent;color:#e2e8f0;cursor:pointer;',
  );
  fin.addEventListener('click', finishExam);

  row.appendChild(cont);
  row.appendChild(fin);
  o.appendChild(row);
  (document.body || document.documentElement).appendChild(o);
  return o;
}

function showPrompt() {
  if (!fsActive) return;
  if (!fsOverlay) fsOverlay = buildOverlay();
  fsOverlay.style.display = 'flex';
}

function hidePrompt() {
  if (fsOverlay) fsOverlay.style.display = 'none';
}

async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    // Capture Esc so a short press prompts instead of instantly exiting
    // (holding Esc still force-exits — the browser's mandatory safety valve).
    if (navigator.keyboard && navigator.keyboard.lock) {
      try {
        await navigator.keyboard.lock(['Escape']);
      } catch (_) {}
    }
    hidePrompt();
  } catch (_) {
    /* denied / not allowed — prompt stays */
  }
}

function finishExam() {
  fsActive = false;
  try {
    chrome.runtime.sendMessage({ type: '__proctor_finish' });
  } catch (_) {}
  try {
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
  } catch (_) {}
  hidePrompt();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// The enrollment is read from storage and kept current, so the lock also works
// on an exam tab that was opened BEFORE the student joined, and re-prompts when
// the student comes back to the exam tab (switching tabs exits fullscreen).
let currentEnrollment = null;

function enforced() {
  return fsActive && !!currentEnrollment && onExamPage(currentEnrollment.examLink);
}

function checkPrompt() {
  if (enforced() && !document.fullscreenElement && document.visibilityState === 'visible') showPrompt();
}

async function initFullscreenLock() {
  try {
    const store = await chrome.storage.local.get('enrollment');
    currentEnrollment = store.enrollment || null;
  } catch (_) {
    return;
  }

  // Joined / left while this page was already open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.enrollment) return;
    currentEnrollment = changes.enrollment.newValue || null;
    if (currentEnrollment) {
      fsActive = true; // a new join re-arms the lock after an earlier Finish
      checkPrompt();
    } else {
      fsActive = false;
      hidePrompt();
      try {
        if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
      } catch (_) {}
    }
  });

  // Back on the exam tab (tab switch, window restore) → prompt again.
  document.addEventListener('visibilitychange', checkPrompt);

  // A short Esc while locked in fullscreen prompts instead of exiting.
  document.addEventListener('keydown', (e) => {
    if (enforced() && e.key === 'Escape' && document.fullscreenElement) {
      e.preventDefault();
      showPrompt();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!enforced()) return;
    if (document.fullscreenElement) {
      hidePrompt();
    } else {
      send('FULLSCREEN_EXIT', { url: location.href });
      showPrompt();
    }
  });

  checkPrompt();
}

// ---------- On-page violation warning ----------
//
// The background worker asks the active tab to show this after a counted
// violation (when the exam has "Notify students" on). Drawn in the page, so it
// is visible even when the operating system suppresses desktop notifications.

let warnBanner = null;
let warnTimer = null;

function showWarning(text) {
  if (!warnBanner) {
    warnBanner = document.createElement('div');
    warnBanner.id = '__proctor_warning';
    warnBanner.setAttribute(
      'style',
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
        'max-width:min(560px,calc(100vw - 32px));padding:14px 20px;border-radius:10px;' +
        'background:#b91c1c;color:#fff;font:600 16px/1.4 system-ui,-apple-system,sans-serif;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.35);text-align:center;pointer-events:none;',
    );
    (document.body || document.documentElement).appendChild(warnBanner);
  }
  warnBanner.textContent = text;
  warnBanner.style.display = 'block';
  clearTimeout(warnTimer);
  warnTimer = setTimeout(() => (warnBanner.style.display = 'none'), 8000);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === '__proctor_warning') {
    showWarning(msg.text);
    sendResponse({ shown: true });
  }
  return false;
});

// document_start can run before <body>; wait for the DOM if needed.
if (document.body) initFullscreenLock();
else document.addEventListener('DOMContentLoaded', initFullscreenLock);
