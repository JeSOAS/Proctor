# Proctor — Exam Monitoring Chrome Extension

## Overview
Lightweight Chrome extension for monitoring student behavior during online exam sessions

## Tech Stack
- Chrome Extension (MV3, TypeScript)
- Backend: NestJS + Prisma + PostgreSQL + Redis
- Dashboard: React 18 + TailwindCSS + shadcn/ui
- Infra: Docker Compose, Nginx, GitHub Actions

## Project Structure
```
proctor/
├── extension/       # Chrome Extension (MV3)
├── dashboard/       # React instructor dashboard
├── backend/         # NestJS API + Socket.IO
└── docker/          # Compose files, Nginx config
```

## Getting Started
### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- Chrome browser

### Running locally
Backend Setup (NestJS)

cd backend
npm install

Run backend:
npm run start:dev

Backend runs at:
http://localhost:3000

## Environment Variables
...

## Team
- Aleksandr Romanov (6530338)
- Mya Wut Ye Phoo (6530232)
