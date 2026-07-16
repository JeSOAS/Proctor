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

Result: `https://proctor.jesoas.org` → the backend, with **no open ports** on the
VM. This is the URL the extension calls.

### 2.1 Make sure the domain is on Cloudflare

The tunnel needs `jesoas.org`'s DNS managed by Cloudflare.

- **Already on Cloudflare (our case)** — it already has the `jesoas.org` / `www`
  records in the Cloudflare DNS dashboard. Then there is **nothing to do here**:
  do NOT re-add the domain, do NOT change nameservers. Skip to 2.2. Adding the
  `proctor` subdomain later is a separate new record and does not touch the
  existing ones.
- **Not yet on Cloudflare** — add it (Cloudflare → *Add a site* → Free plan),
  check that Cloudflare imported your existing records (apex/`www` `A`, any `MX`
  email + `TXT`), keep them "DNS only", then set Cloudflare's two nameservers at
  your registrar and wait for the domain to show **Active**.

Note: the `proctor` record created in 2.4 is **proxied** (orange cloud) — the
tunnel requires it. That is isolated to `proctor`; other records are unaffected.

### 2.2 Create the tunnel

1. Cloudflare dashboard → **Zero Trust** → **Networks → Tunnels** → **Create a
   tunnel** → **Cloudflared**.
2. Name it `proctor`, save.
3. On the "Install connector" screen, copy the **tunnel token** — the long string
   after `--token`. (Don't run their install command; we run it in Docker.)

### 2.3 Start cloudflared

```bash
cd ~/Proctor/docker
echo "TUNNEL_TOKEN=<paste the token>" >> .env
docker compose --profile tunnel up -d
docker compose ps        # proctor-cloudflared should be running
docker compose logs cloudflared   # should show "Registered tunnel connection"
```

### 2.4 Route the hostname to the backend

Back in the tunnel (Zero Trust → Tunnels → `proctor` → **Public Hostname** →
**Add a public hostname**):

- **Subdomain:** `proctor`  **Domain:** `jesoas.org`
- **Service:** Type `HTTP`, URL `backend:3000`
- Save. Cloudflare auto-creates the proxied `proctor` DNS record.

### 2.5 Verify from anywhere

```bash
curl https://proctor.jesoas.org/health
# {"status":"ok",...}
```

The extension already points here (`DEFAULT_API_BASE = "https://proctor.jesoas.org"`
in `extension/background.js` and `extension/popup.js`).

### Tearing it down (at handoff)

`docker compose --profile tunnel down` stops everything; delete the tunnel in the
Zero Trust dashboard. To fully hand off, point `jesoas.org`'s nameservers back to
your registrar's defaults (or transfer the Cloudflare account).
