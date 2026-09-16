#!/usr/bin/env bash
# Proctor — VM deploy script.
# --------------------------------------------------------------------------
# Run this ON the Oracle VM (where the repo is cloned and Docker is installed).
# It pulls the latest code and rebuilds the stack. The backend container applies
# any pending Prisma migrations automatically on start (`prisma migrate deploy`),
# so there is no separate migration step.
#
#   ./deploy.sh            # deploy with the Cloudflare tunnel profile (default)
#   ./deploy.sh direct     # deploy the direct-to-VM profile instead (if used)
#
# Postgres data and the Cloudflare tunnel config live in named volumes / secrets
# and survive a rebuild.
# --------------------------------------------------------------------------
set -euo pipefail

PROFILE="${1:-tunnel}"

# Always operate from the repo root (this script's own directory), whatever the
# current working directory is.
cd "$(dirname "$0")"

echo "==> Proctor deploy (profile: ${PROFILE})"
echo "==> Repo: $(pwd)"

# 1. Get the latest code (fast-forward only — fails loudly if the VM's checkout
#    has diverged, rather than creating a surprise merge).
echo "==> git pull"
git pull --ff-only

# 2. Secrets must exist; docker compose fails hard without them.
if [ ! -f docker/.env ]; then
  echo "!! docker/.env is missing. Copy docker/.env.example to docker/.env and"
  echo "   fill in POSTGRES_PASSWORD, ADMIN_TOKEN, JWT_SECRET (+ TUNNEL_TOKEN for"
  echo "   the tunnel profile). Aborting."
  exit 1
fi

# 3. Build + (re)start. Migrations run inside the backend container on start.
echo "==> docker compose --profile ${PROFILE} up -d --build"
cd docker
docker compose --profile "${PROFILE}" up -d --build

# 4. Wait for the backend to answer on its loopback port (it binds 127.0.0.1:3000).
echo "==> waiting for backend to become healthy…"
healthy=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if [ "${healthy}" = "1" ]; then
  echo "==> healthy: $(curl -fsS http://127.0.0.1:3000/health)"
  echo "==> done. Dashboard: https://proctor.jesoas.org/dashboard/"
else
  echo "!! backend did not become healthy within ~60s. Recent logs:"
  docker compose logs --tail 40 backend
  exit 1
fi
