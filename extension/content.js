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

  if (!document.fullscreenElement) showPrompt();

  // A short Esc while locked in fullscreen prompts instead of exiting.
  document.addEventListener('keydown', (e) => {
    if (fsActive && e.key === 'Escape' && document.fullscreenElement) {
      e.preventDefault();
      showPrompt();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!fsActive) return;
    if (document.fullscreenElement) {
      hidePrompt();
    } else {
      send('FULLSCREEN_EXIT', { url: location.href });
      showPrompt();
    }
  });
}

// document_start can run before <body>; wait for the DOM if needed.
if (document.body) initFullscreenLock();
else document.addEventListener('DOMContentLoaded', initFullscreenLock);
