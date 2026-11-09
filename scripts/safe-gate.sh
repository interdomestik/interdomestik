#!/bin/bash
set -e

echo "🔒 Starting CI-Parity Gate..."

echo "1. Cleaning state..."
docker compose down -v

echo "2. Building & Booting stack..."
docker compose up -d --build

echo "3. Hydrating dependencies (Linux)..."
./scripts/docker-run.sh pnpm install

echo "4. Migrating Database..."
./scripts/docker-run.sh pnpm db:migrate

echo "5. Seeding Golden Data..."
SEED_TARGET_CONFIRM="${SEED_TARGET_CONFIRM:-plan070:host.docker.internal}" ./scripts/docker-run.sh pnpm --filter @interdomestik/database seed:e2e -- --reset
SEED_TARGET_CONFIRM="${SEED_TARGET_CONFIRM:-plan070:host.docker.internal}" ./scripts/docker-run.sh pnpm --filter @interdomestik/database seed:assert-e2e

echo "6. Running Smoke Tests..."
./scripts/docker-run.sh pnpm test:smoke

echo "✅ Gate Passed! Safe to merge."
