// Content script
// ----------------------------------------------------------------
// Runs in every web page (per host_permissions), but only acts while the student
// has joined an exam: forwards in-page events the background worker can't see
// (clipboard use, Google Forms submission, leaving fullscreen) and enforces the
// fullscreen lock on the exam page. All backend calls happen in background.js;
// tab switches and window focus are handled there too.
//
// Pages open before an extension reload keep the old (disconnected) script until
// refreshed; warnings still reach them because background.js injects the banner.
// ----------------------------------------------------------------

// The current enrollment, kept up to date. Nothing is reported unless the student
// has joined an exam, so this script stays silent on every other page.
let currentEnrollment = null;

function send(type, payload = {}) {
  if (!currentEnrollment) return;
  try {
    chrome.runtime.sendMessage({ type, payload });
  } catch (_) {
    /* worker unavailable (extension reloaded) — nothing to do */
  }
}

// ---------- Clipboard ----------

for (const type of ['copy', 'paste', 'cut']) {
  document.addEventListener(type, () => send(type.toUpperCase()));
}

// ---------- Exam submission (Google Forms) ----------
//
// After a successful submit, Google Forms navigates to a ".../formResponse"
// page ("Your response has been recorded."), a reliable "the student finished"
// signal. Checked once the enrollment is known (see init below).

function detectGoogleFormSubmit() {
  if (location.hostname === 'docs.google.com' && location.pathname.includes('/formResponse')) {
    send('EXAM_SUBMITTED', { url: location.href });
  }
}

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

// The lock follows the enrollment, so it also works on an exam tab opened BEFORE
// the student joined, and re-prompts when they come back to the exam tab
// (switching tabs exits fullscreen).
function enforced() {
  return fsActive && !!currentEnrollment && onExamPage(currentEnrollment.examLink);
}

function checkPrompt() {
  if (enforced() && !document.fullscreenElement && document.visibilityState === 'visible') showPrompt();
}

async function init() {
  try {
    const store = await chrome.storage.local.get('enrollment');
    currentEnrollment = store.enrollment || null;
  } catch (_) {
    return;
  }
  detectGoogleFormSubmit();

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

// document_start can run before <body>; wait for the DOM if needed.
if (document.body) init();
else document.addEventListener('DOMContentLoaded', init);
