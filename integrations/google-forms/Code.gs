/**
 * Proctor — Google Forms submission webhook.
 *
 * A single STANDALONE Apps Script (not bound to one form). On each submission it
 * reports the student id + form to the Proctor backend, which records an
 * authoritative "submitted" event for the matching monitored session.
 *
 * SETUP (one time):
 *   1. script.google.com → New project → paste this file.
 *   2. Fill in BACKEND_URL and WEBHOOK_SECRET below (secret must match the
 *      backend's WEBHOOK_SECRET env var).
 *   3. Make sure each exam form either has a "Student ID" question OR has
 *      "Collect email addresses" ON (AU emails are u<id>@au.edu).
 *
 * PER NEW FORM (~30 seconds, no code changes):
 *   1. Add the form's id to the FORM_IDS list below. The id is the long part of
 *      the form's EDIT url:  https://docs.google.com/forms/d/<FORM_ID>/edit
 *   2. In the editor's toolbar, choose the function "setup" from the dropdown
 *      (next to Run), then click Run. Authorize when prompted (first time only).
 *      This installs the submit trigger on every form in FORM_IDS.
 *   3. On the dashboard, set that form's URL as the exam's "Exam link" (that's
 *      how the backend matches the form to the exam).
 *   Re-run "setup" whenever you add another form.
 */

const BACKEND_URL = 'https://proctor.jesoas.org';
const WEBHOOK_SECRET = 'PASTE_THE_SAME_SECRET_AS_THE_BACKEND';

// The exam form(s) to watch. Put each form's id here (from its edit URL), e.g.
//   const FORM_IDS = ['1AbCd...xyz', '1EfGh...uvw'];
const FORM_IDS = [
  // 'PASTE_A_FORM_ID_HERE',
];

/**
 * Run THIS function (pick "setup" in the toolbar dropdown, click Run) to install
 * the submit trigger on every form in FORM_IDS. Safe to re-run.
 */
function setup() {
  if (!FORM_IDS.length) {
    throw new Error('Add at least one form id to FORM_IDS at the top, then run setup again.');
  }
  FORM_IDS.forEach(function (id) {
    registerForm(id);
  });
  Logger.log('Done — watching ' + FORM_IDS.length + ' form(s).');
}

/** Fired by the installable trigger on every form submission. */
function onFormSubmit(e) {
  const form = e.source;
  const resp = e.response;

  // Prefer an explicit "Student ID" answer; else derive from the AU email.
  let studentId = findAnswer(resp, /student\s*id/i);
  if (!studentId) {
    const email = resp.getRespondentEmail(); // needs "Collect email addresses"
    const m = email && email.split('@')[0].match(/\d+/);
    if (m) studentId = m[0];
  }

  const payload = {
    formId: form.getId(),
    publishedUrl: form.getPublishedUrl(),
    studentId: studentId || null,
    submittedAt: (resp.getTimestamp() || new Date()).toISOString(),
  };

  UrlFetchApp.fetch(BACKEND_URL + '/webhooks/form-submit', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

/** Read the first answer whose question title matches `re`. */
function findAnswer(resp, re) {
  const items = resp.getItemResponses();
  for (let i = 0; i < items.length; i++) {
    if (re.test(items[i].getItem().getTitle())) {
      return String(items[i].getResponse()).trim();
    }
  }
  return null;
}

/** Run once per form to install the onFormSubmit trigger (dedupes first). */
function registerForm(formId) {
  const form = FormApp.openById(formId);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmit' && t.getTriggerSourceId() === formId) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  Logger.log('Registered: ' + form.getTitle());
  return 'registered ' + form.getTitle();
}

/** Optional helper: list forms this script currently watches. */
function listRegisteredForms() {
  return ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'onFormSubmit'; })
    .map(function (t) { return t.getTriggerSourceId(); });
}
