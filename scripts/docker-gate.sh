#!/usr/bin/env bash
set -euo pipefail

echo "🔒 Starting Parity Gate..."

if [[ ! -f ".env" ]]; then
  echo "⚠️  Missing .env; creating from .env.example for local Docker runs."
  cp .env.example .env
fi

if [[ ! -f "docker/.env" ]]; then
  echo "⚠️  Missing docker/.env; creating from docker/.env.example."
  cp docker/.env.example docker/.env
fi

# Normalize local defaults for container networking and auth requirements.
if grep -Eq '^DATABASE_URL=postgresql://postgres:postgres@(localhost|127\.0\.0\.1):54322/postgres$' .env; then
  sed -i.bak \
    's#^DATABASE_URL=.*#DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres#' \
    .env
  rm -f .env.bak
fi

if grep -Eq '^BETTER_AUTH_SECRET=$' .env || \
  grep -Eq '^BETTER_AUTH_SECRET=your-random-secret-key-min-32-chars$' .env; then
  sed -i.bak \
    's#^BETTER_AUTH_SECRET=.*#BETTER_AUTH_SECRET=local-docker-dev-secret-32chars-minimum#' \
    .env
  rm -f .env.bak
fi

# 1. Clean previous gate containers (fresh run)
echo "1. Ensuring gate containers are fresh..."
docker compose --profile gate down

# 2. Boot Gate profile (builds Web + Playwright)
echo "2. Building & booting gate stack..."
docker compose --profile gate up -d --build

# 3. Run checks in a single Playwright container session so dependency hydration
# and generated artifacts remain available for subsequent commands.
echo "3. Running gate checks in Linux container..."
./scripts/docker-run.sh "\
pnpm install && \
pnpm db:migrate && \
pnpm --filter @interdomestik/database seed:e2e -- --reset && \
pnpm --filter @interdomestik/database seed:assert-e2e && \
SKIP_NODE_GUARD=1 pnpm --filter @interdomestik/web test:smoke"

echo "✅ Gate Passed!"
