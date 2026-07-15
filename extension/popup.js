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

async function render() {
  const { enrollment } = await chrome.storage.local.get('enrollment');
  if (enrollment) {
    $('a-exam').textContent = enrollment.examTitle;
    $('a-student').textContent = enrollment.studentName;
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
  if (!code) return ($('error').textContent = 'Enter the join code.');

  $('join').disabled = true;
  $('join').textContent = 'Joining…';
  try {
    const base = await apiBase();
    const res = await fetch(`${base}/exams/${code}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, studentId: studentId || undefined }),
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
        studentName,
        joinedAt: Date.now(),
      },
    });
    // Wake the worker so monitoring + heartbeat start right away
    chrome.runtime.sendMessage({ type: '__proctor_enrolled' }).catch(() => {});
    await render();
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
$('code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});
$('leave').addEventListener('click', leave);

render();
