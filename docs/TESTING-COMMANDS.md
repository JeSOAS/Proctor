# Testing Commands (Mac / Windows)

> **Most instructor actions now live in the dashboard** at `/dashboard` — these
> commands are for testing/automation. The extension flow (register/heartbeat/
> violations) is unaffected and needs no login.

**Auth model:**
- `<ADMIN>` = the `ADMIN_TOKEN` (creates teachers, dev wipe) — header `x-admin-token`.
- `<TOKEN>` = a teacher **login** token from `POST /auth/login` — header
  `Authorization: Bearer <TOKEN>`. Instructor endpoints (courses, exams, session
  reads/edits) use this and are scoped to that teacher.
- Student endpoints (register, heartbeat, violations, end) need no credential.

Placeholders: `<CODE>`/`<COURSE_ID>`/`<EXAM_ID>`/`<SESSION_ID>` come from earlier
responses. Only JSON-body requests differ between shells (bash single quotes /
cmd escaped quotes / PowerShell `Invoke-RestMethod`). Swap the base for
`http://127.0.0.1:3000` to test on the VM.

---

## Mac / Linux / Git Bash

```bash
BASE=https://proctor.jesoas.org
ADMIN=<your admin token>

# --- auth ---
# create a teacher (admin), then log in to get a token
curl -X POST $BASE/auth/register -H "Content-Type: application/json" -H "x-admin-token: $ADMIN" \
  -d '{"email":"teacher@example.com","name":"Teacher","password":"password123"}'
TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"teacher@example.com","password":"password123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "$TOKEN"
AUTH="Authorization: Bearer $TOKEN"

# --- courses (teacher) ---
curl -X POST $BASE/courses -H "Content-Type: application/json" -H "$AUTH" -d '{"name":"CS101","subject":"Computer Science"}'
curl $BASE/courses -H "$AUTH"

# --- exams (teacher) ---
curl -X POST $BASE/exams -H "Content-Type: application/json" -H "$AUTH" -d '{"courseId":"<COURSE_ID>","title":"Midterm"}'
curl $BASE/exams -H "$AUTH"
curl $BASE/exams/<EXAM_ID>/sessions -H "$AUTH"
curl -X POST $BASE/exams/<EXAM_ID>/status -H "Content-Type: application/json" -H "$AUTH" -d '{"status":"CLOSED"}'
curl -X DELETE $BASE/exams/<EXAM_ID> -H "$AUTH"

# --- student joins (open, no token) ---
curl -X POST $BASE/exams/<CODE>/register -H "Content-Type: application/json" -d '{"studentName":"Alice","studentId":"6530001"}'

# --- sessions ---
curl $BASE/sessions/<SESSION_ID> -H "$AUTH"                      # read (teacher)
curl $BASE/sessions/<SESSION_ID>/violations -H "$AUTH"           # events (teacher)
curl -X PATCH $BASE/sessions/<SESSION_ID> -H "Content-Type: application/json" -H "$AUTH" -d '{"status":"ENDED"}'
curl -X DELETE $BASE/sessions/<SESSION_ID> -H "$AUTH"
curl -X POST $BASE/sessions/<SESSION_ID>/end                     # student leave (open)

# --- checks & reset ---
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/exams -H "Content-Type: application/json" -d '{"title":"no token"}'   # 401
curl -X DELETE $BASE/exams -H "x-admin-token: $ADMIN"            # wipe all (admin)
```

---

## Windows — PowerShell

```powershell
$base  = "https://proctor.jesoas.org"
$admin = @{ "x-admin-token" = "<your admin token>" }

# --- auth ---
Invoke-RestMethod -Method Post "$base/auth/register" -Headers $admin -ContentType "application/json" `
  -Body '{"email":"teacher@example.com","name":"Teacher","password":"password123"}'
$login = Invoke-RestMethod -Method Post "$base/auth/login" -ContentType "application/json" `
  -Body '{"email":"teacher@example.com","password":"password123"}'
$auth = @{ Authorization = "Bearer $($login.token)" }

# --- courses / exams (teacher) ---
Invoke-RestMethod -Method Post "$base/courses" -Headers $auth -ContentType "application/json" -Body '{"name":"CS101","subject":"Computer Science"}'
Invoke-RestMethod "$base/courses" -Headers $auth
Invoke-RestMethod -Method Post "$base/exams" -Headers $auth -ContentType "application/json" -Body '{"courseId":"<COURSE_ID>","title":"Midterm"}'
Invoke-RestMethod "$base/exams" -Headers $auth
Invoke-RestMethod "$base/exams/<EXAM_ID>/sessions" -Headers $auth
Invoke-RestMethod -Method Post "$base/exams/<EXAM_ID>/status" -Headers $auth -ContentType "application/json" -Body '{"status":"CLOSED"}'

# --- student joins (open) ---
Invoke-RestMethod -Method Post "$base/exams/<CODE>/register" -ContentType "application/json" -Body '{"studentName":"Alice","studentId":"6530001"}'

# --- sessions ---
Invoke-RestMethod "$base/sessions/<SESSION_ID>" -Headers $auth
Invoke-RestMethod "$base/sessions/<SESSION_ID>/violations" -Headers $auth
Invoke-RestMethod -Method Patch "$base/sessions/<SESSION_ID>" -Headers $auth -ContentType "application/json" -Body '{"status":"ENDED"}'
Invoke-RestMethod -Method Delete "$base/sessions/<SESSION_ID>" -Headers $auth

# --- reset (admin) ---
Invoke-RestMethod -Method Delete "$base/exams" -Headers $admin
```

---

## Windows — Command Prompt (cmd.exe)

Log in first, copy the `token` from the response, then `set TOKEN=<it>`.

```cmd
set BASE=https://proctor.jesoas.org
set ADMIN=<your admin token>

curl -X POST %BASE%/auth/register -H "Content-Type: application/json" -H "x-admin-token: %ADMIN%" -d "{\"email\":\"teacher@example.com\",\"name\":\"Teacher\",\"password\":\"password123\"}"
curl -X POST %BASE%/auth/login -H "Content-Type: application/json" -d "{\"email\":\"teacher@example.com\",\"password\":\"password123\"}"
set TOKEN=<paste the token from the response>

curl -X POST %BASE%/courses -H "Content-Type: application/json" -H "Authorization: Bearer %TOKEN%" -d "{\"name\":\"CS101\",\"subject\":\"Computer Science\"}"
curl %BASE%/exams -H "Authorization: Bearer %TOKEN%"
curl -X POST %BASE%/exams -H "Content-Type: application/json" -H "Authorization: Bearer %TOKEN%" -d "{\"courseId\":\"<COURSE_ID>\",\"title\":\"Midterm\"}"
curl -X POST %BASE%/exams/<CODE>/register -H "Content-Type: application/json" -d "{\"studentName\":\"Alice\",\"studentId\":\"6530001\"}"
curl %BASE%/sessions/<SESSION_ID>/violations -H "Authorization: Bearer %TOKEN%"
curl -X DELETE %BASE%/exams -H "x-admin-token: %ADMIN%"
```
