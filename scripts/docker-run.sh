#!/usr/bin/env bash
set -euo pipefail

# Helper to run commands inside the Docker Playwright service.
# The service entrypoint is /bin/bash, so commands must be passed via -lc.

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 <command...>"
  echo "Example: $0 pnpm --filter @interdomestik/web test:smoke"
  exit 1
fi

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

echo "🐳 Running in Docker (playwright): $*"
docker compose run --rm playwright -lc "$*"
