# Proctor — Exam Monitoring Chrome Extension

Chrome extension for monitoring student behaviour during online exams, with a
NestJS backend and a React instructor dashboard. Senior Project 2.

## Project Structure

```
proctor/
├── extension/       # Chrome Extension (MV3) — see extension/README.md
├── backend/         # NestJS API + Prisma (PostgreSQL) — serves the dashboard
├── dashboard/       # React (Vite) instructor dashboard — served at /dashboard
├── docker/          # docker-compose (PostgreSQL + Cloudflare tunnel) for the VM
├── deploy.sh        # one-shot VM deploy (pull + rebuild + health check)
├── integrations/    # Google Forms Apps Script (submission webhook)
└── docs/            # MONITORING, DECISIONS, DEPLOYMENT, TESTING-COMMANDS,
                     # MOCK-EXAM-TEST-PLAN, FUTURE-AUTH
```

**How it fits together:** the extension reports events → the backend classifies
them and serves the dashboard → teachers watch live at `/dashboard`. The
monitoring model, every flag, the tuning knobs, and the known limitations are
documented in **[docs/MONITORING.md](docs/MONITORING.md)** — start there.

Production runs with Docker Compose on an Oracle Cloud Ubuntu VM behind a
Cloudflare Tunnel at `https://proctor.jesoas.org` (the root redirects to the
dashboard at `/dashboard`). Data is in **PostgreSQL** via Prisma. Deploy with
`./deploy.sh` on the VM; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Prerequisites

- Node.js 22 LTS (minimum 20.11)
- PostgreSQL 16 (or Docker, which runs it for you)
- Chrome

## Quick Start (local)

```bash
# 1. Backend + database (Docker) — see backend/README.md for running without Docker
cd docker && cp .env.example .env    # set POSTGRES_PASSWORD, ADMIN_TOKEN, JWT_SECRET
docker compose up -d --build         # http://127.0.0.1:3000, dashboard at /dashboard

# 2. Create a teacher, then sign in at /dashboard and create a course + exam
curl -X POST http://127.0.0.1:3000/auth/register -H "x-admin-token: <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" -d '{"email":"t@au.edu","name":"Teacher","password":"changeme123"}'

# 3. Load the extension: chrome://extensions → Developer mode → Load unpacked →
#    extension/ → Details → "Allow in Incognito". Point it at the local backend
#    from its service-worker console:  chrome.storage.local.set({ apiBase: 'http://127.0.0.1:3000' })
#    Then join from the popup with the exam's join code.
```

## Team

- Aleksandr Romanov (6530338)
- Mya Wut Ye Phoo (6530232)
