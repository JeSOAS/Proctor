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

## Admin setup (once per teacher — no per-exam work afterwards)

1. Set `WEBHOOK_SECRET` in `docker/.env` on the VM to a long random value and
   redeploy (it's already wired into docker-compose + the backend).
2. In the **teacher's** Google account: https://script.google.com → **New
   project** → paste `Code.gs`.
3. Set `BACKEND_URL` and `WEBHOOK_SECRET` at the top (secret must match step 1).
4. In the toolbar dropdown choose **`installAutoSync`**, click **Run**, and
   authorize. Done — the script now re-syncs every 10 minutes.

## Teacher, per exam — 2 pages only

1. **Exam platform:** build the Google Form in this account, and turn ON
   **Collect email addresses** (Settings → Responses) **or** add a **"Student
   ID"** question.
2. **Proctor:** set that form's URL as the exam's **Exam link**.

Within ~10 minutes the script auto-installs the submit trigger on the form and
starts confirming submissions. Nothing else to do — no per-form scripting.

> How it stays in sync: the script asks the backend (`GET /webhooks/forms`)
> which form tokens to watch — derived from the exams' Exam links — then finds
> those among the teacher's own forms and installs/removes triggers to match.

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
