# Google Forms submission webhook

Authoritative "the student actually submitted" signal for Google Forms, to pair
with the extension's fullscreen-finish. Google tells the backend, server-to-
server, when a response is submitted — no heuristics, unspoofable.

## How it correlates

- **Form → exam:** the backend matches the form to an exam by the exam's
  **Exam link** (set it to the form's URL on the dashboard). So there is nothing
  exam-specific to configure in the script.
- **Student → session:** by student id, compared **digits-only**. The script
  reads a "Student ID" question if the form has one, otherwise derives it from
  the AU email (`u1234567@au.edu` → `1234567`). This is why the join id and the
  form id line up even if formatting differs.

## One-time setup

1. Set `WEBHOOK_SECRET` in `docker/.env` on the VM to a long random value and
   redeploy (it's already wired into docker-compose + the backend).
2. Go to https://script.google.com → **New project** → paste `Code.gs`.
3. Set `BACKEND_URL` and `WEBHOOK_SECRET` at the top (secret must match step 1).

## Per new form (~30 seconds, no coding)

1. Build the Google Form as usual. Ensure it **collects email addresses**
   (Settings → Responses) **or** has a **"Student ID"** question.
2. Copy the form's id from its **edit** URL: `.../forms/d/`**`<FORM_ID>`**`/edit`,
   and add it to the `FORM_IDS` list at the top of `Code.gs`, e.g.
   `const FORM_IDS = ['1AbCd...'];`.
3. In the Apps Script editor toolbar, choose the function **`setup`** from the
   dropdown next to **Run**, then click **Run**. Authorize when prompted (first
   time only). This installs the submit trigger on every form in `FORM_IDS`.
4. On the Proctor dashboard, set that form's URL as the exam's **Exam link**.

Re-run `setup` whenever you add a form. Reusing an existing form needs no repeat.

> Note: don't run `onFormSubmit` or `registerForm` directly — `onFormSubmit`
> needs a real submission event, and `registerForm` needs an argument the Run
> button can't pass. Always run **`setup`**.

## Verify it works

- Submit a test response with an id that matches a **joined** session.
- The dashboard session shows a blue **"Submitted the exam"** row at the submit
  time (and *Finished early* if before the end time; later events greyed).
- On the VM: `docker compose logs --tail 20 backend` shows `POST /webhooks/form-submit`.
- Negative checks: a POST without the secret is rejected; a submission whose id
  never joined returns `{ "matched": false }` and changes nothing.

curl smoke test (replace the secret; use a real joined student id + the form URL):

```bash
curl -s -X POST https://proctor.jesoas.org/webhooks/form-submit \
  -H 'content-type: application/json' \
  -H 'x-webhook-secret: YOUR_SECRET' \
  -d '{"publishedUrl":"https://docs.google.com/forms/d/e/XXXX/viewform","studentId":"6530338"}'
# -> {"matched":true,"sessionId":"..."} once the exam link + a joined session exist
```
