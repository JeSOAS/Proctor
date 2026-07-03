# Proctor — Exam Monitoring Chrome Extension

Lightweight Chrome extension for monitoring student behavior during online exam sessions, with a NestJS backend that records monitoring events. Senior Project 2.

## Project Structure

```
proctor/
├── extension/       # Chrome Extension (MV3) — see extension/README.md
├── backend/         # NestJS API + Prisma — see backend/README.md
├── docker/          # docker-compose (PostgreSQL + Redis) for the VM deployment
└── TESTING.md       # manual test checklist for the monitoring logic
```

An instructor dashboard (React) is planned for a later phase. Local development
uses SQLite (no Docker needed); the compose file is for the production Linux VM.

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
