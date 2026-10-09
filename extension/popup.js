// Popup logic
// ----------------------------------------------------------------
// Two views: a join form, and an "active" state once the student has joined.
// Joining calls POST /exams/:code/register and stores the returned session in
// chrome.storage.local as `enrollment`; the background worker reads that and
// begins reporting events. Leaving ends the session and clears it.
// ----------------------------------------------------------------

// Production backend. To repoint the extension at a different server, change
// this in BOTH popup.js and background.js, or override at runtime via
// chrome.storage.local.apiBase (see docs/DECISIONS.md #8).
const DEFAULT_API_BASE = 'https://proctor.jesoas.org';

const $ = (id) => document.getElementById(id);

async function apiBase() {
  const { apiBase } = await chrome.storage.local.get('apiBase');
  return apiBase || DEFAULT_API_BASE;
}

// Only open http(s) links the teacher configured as the exam link.
function safeLink(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

function openExam() {
  chrome.storage.local.get('enrollment').then(({ enrollment }) => {
    const link = safeLink(enrollment && enrollment.examLink);
    if (link) chrome.tabs.create({ url: link });
  });
}

async function render() {
  const { enrollment } = await chrome.storage.local.get('enrollment');
  if (enrollment) {
    $('a-exam').textContent = enrollment.examTitle;
    $('a-student').textContent = enrollment.studentName;
    const link = safeLink(enrollment.examLink);
    $('a-link').textContent = link || '';
    $('a-link-row').classList.toggle('hidden', !link);
    $('open-exam').classList.toggle('hidden', !link);
    $('join-view').classList.add('hidden');
    $('active-view').classList.remove('hidden');
  } else {
    $('active-view').classList.add('hidden');
    $('join-view').classList.remove('hidden');
  }
}

async function join() {
  const studentName = $('name').value.trim();
  const studentId = $('studentId').value.trim();
  const code = $('code').value.trim().toUpperCase();
  $('error').textContent = '';

  if (!studentName) return ($('error').textContent = 'Enter your name.');
  if (!studentId) return ($('error').textContent = 'Enter your student ID.');
  if (!code) return ($('error').textContent = 'Enter the join code.');

  // Monitoring must cover incognito windows too, otherwise a student could look
  // things up there unseen. Extensions can't enable this themselves; the
  // student turns on "Allow in Incognito" once.
  let incognitoOk = true;
  try {
    incognitoOk = await chrome.extension.isAllowedIncognitoAccess();
  } catch (_) {}
  $('incognito-help').classList.toggle('hidden', incognitoOk);
  if (!incognitoOk) {
    $('error').textContent = 'Allow Proctor in incognito to join.';
    return;
  }

  $('join').disabled = true;
  $('join').textContent = 'Joining…';
  // Make sure the newest version is running before the exam starts: if Chrome
  // has an update ready, install it now (the extension reloads and this popup
  // closes — the student opens it again and joins).
  try {
    const { status } = await chrome.runtime.requestUpdateCheck();
    if (status === 'update_available') {
      $('error').textContent = 'Updating Proctor… open this window again in a few seconds and join.';
      setTimeout(() => chrome.runtime.reload(), 1500);
      return;
    }
  } catch (_) {
    /* throttled / offline — continue with the installed version */
  }
  try {
    const base = await apiBase();
    const res = await fetch(`${base}/exams/${code}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, studentId, extensionVersion: chrome.runtime.getManifest().version }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Registration failed (${res.status})`);
    }
    await chrome.storage.local.set({
      enrollment: {
        sessionId: data.sessionId,
        examId: data.examId,
        examTitle: data.examTitle,
        maxWarnings: data.maxWarnings,
        // The required exam page; the worker uses it to detect exam start.
        examLink: data.examLink || null,
        studentName,
        joinedAt: Date.now(),
      },
    });
    chrome.storage.session.remove('joinDraft'); // joined — the draft is no longer needed
    // Fresh join → the "exam opened" marker hasn't fired yet this session.
    await chrome.storage.local.remove('examStartedReported');
    // Wake the worker so monitoring + heartbeat start right away
    chrome.runtime.sendMessage({ type: '__proctor_enrolled' }).catch(() => {});
    await render();
    // Take the student straight to the exam (this closes the popup).
    const link = safeLink(data.examLink);
    if (link) chrome.tabs.create({ url: link });
  } catch (err) {
    $('error').textContent = err.message;
  } finally {
    $('join').disabled = false;
    $('join').textContent = 'Join exam';
  }
}

async function leave() {
  const { enrollment } = await chrome.storage.local.get('enrollment');
  if (enrollment) {
    try {
      const base = await apiBase();
      await fetch(`${base}/sessions/${enrollment.sessionId}/end`, { method: 'POST' });
    } catch (_) {
      // Even if the backend is unreachable, clear locally so the student can rejoin
    }
  }
  await chrome.storage.local.remove('enrollment');
  await render();
}

$('join').addEventListener('click', join);

// Keep what the student typed if the popup closes before they join (it closes
// whenever they click elsewhere). Kept in chrome.storage.session, which Chrome
// clears when the browser closes; cleared on a successful join.
const DRAFT_FIELDS = ['name', 'studentId', 'code'];
chrome.storage.session.get('joinDraft').then(({ joinDraft }) => {
  for (const f of DRAFT_FIELDS) if (joinDraft && joinDraft[f] && !$(f).value) $(f).value = joinDraft[f];
});
for (const f of DRAFT_FIELDS) {
  $(f).addEventListener('input', () => {
    const joinDraft = Object.fromEntries(DRAFT_FIELDS.map((k) => [k, $(k).value]));
    chrome.storage.session.set({ joinDraft });
  });
}
$('open-exam').addEventListener('click', openExam);
$('open-settings').addEventListener('click', () =>
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }),
);
$('code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});
$('leave').addEventListener('click', leave);

render();
