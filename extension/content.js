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
