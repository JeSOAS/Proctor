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
└── docs/            # DEPLOYMENT, DECISIONS, MONITORING, TESTING-COMMANDS
```

**How it fits together:** the extension reports events → the backend classifies
them and serves the dashboard → teachers watch live at `/dashboard`. The
monitoring model, every flag, the tuning knobs, and the known limitations are
documented in **[docs/MONITORING.md](docs/MONITORING.md)** — start there.

Deployment is on an Oracle Linux VM via Cloudflare Tunnel at
`https://proctor.jesoas.org` (dashboard at `/dashboard`). Both the backend and
the dashboard use **PostgreSQL** (via Prisma); run the compose stack locally if
you want a full environment.

## Prerequisites

- Node.js 22 LTS (minimum 20.11)
- Chrome

## Quick Start

```bash
# 1. Start the backend (creates the SQLite database on first run)
cd backend
npm install
cp .env.example .env
npm run prisma:migrate
npm run start:dev        # http://localhost:3000

# 2. Load the extension
#    chrome://extensions → Developer mode → Load unpacked → select extension/
#    The extension creates a session automatically and starts reporting events.
```

## Team

- Aleksandr Romanov (6530338)
- Mya Wut Ye Phoo (6530232)
