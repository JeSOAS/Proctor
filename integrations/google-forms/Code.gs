/**
 * Proctor — Google Forms submission webhook (auto-sync).
 *
 * A STANDALONE Apps Script that runs in a teacher's Google account. It keeps
 * itself in sync with Proctor: it asks the backend which forms to watch (derived
 * from the exams' "Exam link"), finds those among the teacher's own forms, and
 * installs a submit trigger on them automatically. On each submission it reports
 * the student id + form to Proctor, which records an authoritative "submitted"
 * event for the matching monitored session.
 *
 * ADMIN SETUP (once per teacher, no per-exam work afterwards):
 *   1. In the teacher's Google account: script.google.com → New project → paste
 *      this file. Set BACKEND_URL and WEBHOOK_SECRET below (secret must match
 *      the backend's WEBHOOK_SECRET env var).
 *   2. Choose the function "installAutoSync" in the toolbar dropdown and Run.
 *      Authorize when prompted. That's it — it now re-syncs every 10 minutes.
 *
 * TEACHER, per exam (2 pages only):
 *   - Build the Google Form (in this same account). Turn ON "Collect email
 *     addresses" OR add a "Student ID" question.
 *   - On the Proctor dashboard, set that form's URL as the exam's "Exam link".
 *   Within ~10 minutes the script picks it up and starts confirming submissions.
 */

const BACKEND_URL = 'https://proctor.jesoas.org';
const WEBHOOK_SECRET = 'PASTE_THE_SAME_SECRET_AS_THE_BACKEND';

/** Run once (admin) to start the 10-minute auto-sync. Safe to re-run. */
function installAutoSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncForms') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncForms').timeBased().everyMinutes(10).create();
  syncForms(); // run immediately too
}

/** Ask Proctor which forms to watch, then (un)install submit triggers to match. */
function syncForms() {
  const wanted = fetchWatchedTokens();
  if (wanted === null) return; // backend unreachable — keep current triggers

  const existing = {}; // formId -> the onFormSubmit trigger
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmit') existing[t.getTriggerSourceId()] = t;
  });

  const keep = {};
  const files = DriveApp.getFilesByType(MimeType.GOOGLE_FORMS);
  while (files.hasNext()) {
    const file = files.next();
    let form;
    try {
      form = FormApp.openById(file.getId());
    } catch (e) {
      continue; // not openable (e.g. shared read-only) — skip
    }
    const token = extractToken(form.getPublishedUrl());
    if (token && wanted[token]) {
      keep[file.getId()] = true;
      if (!existing[file.getId()]) {
        ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
      }
    }
  }

  // Drop triggers for forms no longer linked to an exam.
  Object.keys(existing).forEach(function (id) {
    if (!keep[id]) ScriptApp.deleteTrigger(existing[id]);
  });
}

/** Fired by the installed trigger on every submission of a watched form. */
function onFormSubmit(e) {
  const form = e.source;
  const resp = e.response;

  let studentId = findAnswer(resp, /student\s*id/i);
  if (!studentId) {
    const email = resp.getRespondentEmail(); // needs "Collect email addresses"
    const m = email && email.split('@')[0].match(/\d+/);
    if (m) studentId = m[0];
  }

  UrlFetchApp.fetch(BACKEND_URL + '/webhooks/form-submit', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    payload: JSON.stringify({
      formId: form.getId(),
      publishedUrl: form.getPublishedUrl(),
      studentId: studentId || null,
      submittedAt: (resp.getTimestamp() || new Date()).toISOString(),
    }),
    muteHttpExceptions: true,
  });
}

/** GET the set of form tokens Proctor wants watched. Returns a lookup, or null on error. */
function fetchWatchedTokens() {
  try {
    const res = UrlFetchApp.fetch(BACKEND_URL + '/webhooks/forms', {
      headers: { 'x-webhook-secret': WEBHOOK_SECRET },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) return null;
    const forms = (JSON.parse(res.getContentText()).forms) || [];
    const set = {};
    forms.forEach(function (t) { set[t] = true; });
    return set;
  } catch (err) {
    return null;
  }
}

/** The published token from a form URL: /forms/d/e/<TOKEN>/… */
function extractToken(url) {
  const m = url && url.match(/\/forms\/d\/e\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/** First answer whose question title matches `re`. */
function findAnswer(resp, re) {
  const items = resp.getItemResponses();
  for (let i = 0; i < items.length; i++) {
    if (re.test(items[i].getItem().getTitle())) {
      return String(items[i].getResponse()).trim();
    }
  }
  return null;
}
