# Testing Commands (Mac / Windows)

Copy-paste API commands for manually testing the backend. Fill the placeholders:

- `<TOKEN>` — the `ADMIN_TOKEN` from `docker/.env`
- `<CODE>` — a join code (from *create exam*)
- `<EXAM_ID>` — an exam id (from *create exam*)
- `<SESSION_ID>` — a session id (from *register* or *list sessions*)

**Only requests with a JSON body (`-d`) differ between shells:** bash/zsh use
single quotes, `cmd.exe` uses escaped double quotes, and PowerShell is cleanest
with `Invoke-RestMethod`. Everything else is identical everywhere.

Instructor/`🔒` routes need the `x-admin-token` header; student routes (register,
heartbeat, violations, end) do not. Swap the base URL for `http://127.0.0.1:3000`
to test on the VM before the tunnel is up.

---

## Mac / Linux / Git Bash (bash or zsh)

```bash
BASE=https://proctor.jesoas.org
TOKEN=<your admin token>

# --- health ---
curl $BASE/health

# --- exams ---
# create (returns joinCode + id)
curl -X POST $BASE/exams -H "Content-Type: application/json" -H "x-admin-token: $TOKEN" -d '{"title":"Live Test Exam"}'
# list all
curl $BASE/exams -H "x-admin-token: $TOKEN"
# get one (with its sessions count)
curl $BASE/exams/<EXAM_ID> -H "x-admin-token: $TOKEN"
# list students in an exam
curl $BASE/exams/<EXAM_ID>/sessions -H "x-admin-token: $TOKEN"
# close (or OPEN / DRAFT)
curl -X POST $BASE/exams/<EXAM_ID>/status -H "Content-Type: application/json" -H "x-admin-token: $TOKEN" -d '{"status":"CLOSED"}'

# --- register a student = CREATE a session (no token) ---
curl -X POST $BASE/exams/<CODE>/register -H "Content-Type: application/json" -d '{"studentName":"Alice Tan","studentId":"6530001"}'

# --- session + student-info CRUD ---
# READ one session (student info, status, exam, counts)
curl $BASE/sessions/<SESSION_ID> -H "x-admin-token: $TOKEN"
# UPDATE student info
curl -X PATCH $BASE/sessions/<SESSION_ID> -H "Content-Type: application/json" -H "x-admin-token: $TOKEN" -d '{"studentName":"Alice B. Tan","studentId":"6530999"}'
# UPDATE status (ACTIVE | ENDED | DISCONNECTED)
curl -X PATCH $BASE/sessions/<SESSION_ID> -H "Content-Type: application/json" -H "x-admin-token: $TOKEN" -d '{"status":"ENDED"}'
# DELETE one session (+ its violations)
curl -X DELETE $BASE/sessions/<SESSION_ID> -H "x-admin-token: $TOKEN"

# --- violations / lifecycle (student-facing, no token) ---
curl $BASE/sessions/<SESSION_ID>/violations
curl -X POST $BASE/sessions/<SESSION_ID>/heartbeat
curl -X POST $BASE/sessions/<SESSION_ID>/end

# --- checks & reset ---
# guard check — must print 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/exams -H "Content-Type: application/json" -d '{"title":"no token"}'
# wipe everything
curl -X DELETE $BASE/exams -H "x-admin-token: $TOKEN"
```

---

## Windows — PowerShell

`Invoke-RestMethod` prints parsed objects; append `| ConvertTo-Json` for raw JSON.

```powershell
$base  = "https://proctor.jesoas.org"
$token = "<your admin token>"
$admin = @{ "x-admin-token" = $token }

# --- health ---
Invoke-RestMethod "$base/health"

# --- exams ---
Invoke-RestMethod -Method Post "$base/exams" -Headers $admin -ContentType "application/json" -Body '{"title":"Live Test Exam"}'
Invoke-RestMethod "$base/exams" -Headers $admin
Invoke-RestMethod "$base/exams/<EXAM_ID>" -Headers $admin
Invoke-RestMethod "$base/exams/<EXAM_ID>/sessions" -Headers $admin
Invoke-RestMethod -Method Post "$base/exams/<EXAM_ID>/status" -Headers $admin -ContentType "application/json" -Body '{"status":"CLOSED"}'

# --- register a student = CREATE a session (no token) ---
Invoke-RestMethod -Method Post "$base/exams/<CODE>/register" -ContentType "application/json" -Body '{"studentName":"Alice Tan","studentId":"6530001"}'

# --- session + student-info CRUD ---
Invoke-RestMethod "$base/sessions/<SESSION_ID>" -Headers $admin
Invoke-RestMethod -Method Patch "$base/sessions/<SESSION_ID>" -Headers $admin -ContentType "application/json" -Body '{"studentName":"Alice B. Tan","studentId":"6530999"}'
Invoke-RestMethod -Method Patch "$base/sessions/<SESSION_ID>" -Headers $admin -ContentType "application/json" -Body '{"status":"ENDED"}'
Invoke-RestMethod -Method Delete "$base/sessions/<SESSION_ID>" -Headers $admin

# --- violations / lifecycle (no token) ---
Invoke-RestMethod "$base/sessions/<SESSION_ID>/violations"
Invoke-RestMethod -Method Post "$base/sessions/<SESSION_ID>/heartbeat"
Invoke-RestMethod -Method Post "$base/sessions/<SESSION_ID>/end"

# --- checks & reset ---
# guard check — should print "HTTP 401"
try { Invoke-RestMethod -Method Post "$base/exams" -ContentType "application/json" -Body '{"title":"no token"}' | Out-Null }
catch { "HTTP " + $_.Exception.Response.StatusCode.value__ }
# wipe everything
Invoke-RestMethod -Method Delete "$base/exams" -Headers $admin
```

---

## Windows — Command Prompt (cmd.exe)

```cmd
set BASE=https://proctor.jesoas.org
set TOKEN=<your admin token>

:: --- health ---
curl %BASE%/health

:: --- exams ---
curl -X POST %BASE%/exams -H "Content-Type: application/json" -H "x-admin-token: %TOKEN%" -d "{\"title\":\"Live Test Exam\"}"
curl %BASE%/exams -H "x-admin-token: %TOKEN%"
curl %BASE%/exams/<EXAM_ID> -H "x-admin-token: %TOKEN%"
curl %BASE%/exams/<EXAM_ID>/sessions -H "x-admin-token: %TOKEN%"
curl -X POST %BASE%/exams/<EXAM_ID>/status -H "Content-Type: application/json" -H "x-admin-token: %TOKEN%" -d "{\"status\":\"CLOSED\"}"

:: --- register a student = CREATE a session (no token) ---
curl -X POST %BASE%/exams/<CODE>/register -H "Content-Type: application/json" -d "{\"studentName\":\"Alice Tan\",\"studentId\":\"6530001\"}"

:: --- session + student-info CRUD ---
curl %BASE%/sessions/<SESSION_ID> -H "x-admin-token: %TOKEN%"
curl -X PATCH %BASE%/sessions/<SESSION_ID> -H "Content-Type: application/json" -H "x-admin-token: %TOKEN%" -d "{\"studentName\":\"Alice B. Tan\",\"studentId\":\"6530999\"}"
curl -X PATCH %BASE%/sessions/<SESSION_ID> -H "Content-Type: application/json" -H "x-admin-token: %TOKEN%" -d "{\"status\":\"ENDED\"}"
curl -X DELETE %BASE%/sessions/<SESSION_ID> -H "x-admin-token: %TOKEN%"

:: --- violations / lifecycle (no token) ---
curl %BASE%/sessions/<SESSION_ID>/violations
curl -X POST %BASE%/sessions/<SESSION_ID>/heartbeat
curl -X POST %BASE%/sessions/<SESSION_ID>/end

:: --- checks & reset ---
curl -s -o NUL -w "%{http_code}\n" -X POST %BASE%/exams -H "Content-Type: application/json" -d "{\"title\":\"no token\"}"
curl -X DELETE %BASE%/exams -H "x-admin-token: %TOKEN%"
```
