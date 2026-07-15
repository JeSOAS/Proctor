# Deployment Runbook — Oracle Ubuntu 22.04 VM

Deploys the Proctor backend (NestJS + PostgreSQL) with Docker Compose, then
exposes it over HTTPS with a Cloudflare Tunnel (no open ports on the VM).

Run these commands **on the VM** over your own SSH session.

---

## Step 1 — Backend + database (this step)

### 1.0 Prerequisites

- The repository is pushed to GitHub and reachable from the VM.
- You can SSH into the VM as `ubuntu`.

### 1.1 Install Docker (once)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in so the group change takes effect, then verify:
docker --version && docker compose version
```

### 1.2 Get the code

```bash
git clone https://github.com/JeSOAS/Proctor.git
cd Proctor
git checkout week7-session-management   # until it is merged to main
```

### 1.3 Configure secrets

```bash
cp docker/.env.example docker/.env
# generate strong values:
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" 
echo "ADMIN_TOKEN=$(openssl rand -hex 24)"
# edit docker/.env and paste those in (keep ADMIN_TOKEN — you need it below)
nano docker/.env
```

### 1.4 Build and start

```bash
cd docker
docker compose up -d --build      # first build takes a few minutes
docker compose ps                 # db healthy, backend running
docker compose logs -f backend    # should show migrations applied + "listening on ...:3000"
```

### 1.5 Verify locally on the VM

The backend is bound to `127.0.0.1:3000` (not public yet), so test from the VM:

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok",...}

# smoke test — creating an exam needs the admin token:
TOKEN=$(grep ADMIN_TOKEN docker/.env | cut -d= -f2)
CODE=$(curl -s -X POST http://127.0.0.1:3000/exams \
  -H "Content-Type: application/json" -H "x-admin-token: $TOKEN" \
  -d '{"title":"Deploy Smoke Test"}' | grep -o '"joinCode":"[^"]*"')
echo "$CODE"
# registering a student needs NO token (the extension is unauthenticated):
# curl -s -X POST http://127.0.0.1:3000/exams/<CODE>/register \
#   -H "Content-Type: application/json" -d '{"studentName":"Test"}'
```

Confirm that creating an exam **without** the token is rejected:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/exams \
  -H "Content-Type: application/json" -d '{"title":"no token"}'
# 401
```

### Updating later

```bash
cd ~/Proctor && git pull
cd docker && docker compose up -d --build
```

Migrations apply automatically on backend startup (`prisma migrate deploy`).

---

## Step 2 — Public HTTPS via Cloudflare Tunnel

_Added in the next step. Summary: add a subdomain to a Cloudflare account, run
`cloudflared` as a compose service that connects out and proxies to
`backend:3000`; the extension's `DEFAULT_API_BASE` is then set to
`https://proctor.<yourdomain>`._
