#!/bin/bash
set -e

echo "🔒 Starting Parity Gate..."

# 1. Clean previous gate containers (but preserve volumes unless requested)
# This prevents 'web' logic overlaps
echo "1. Ensuring gate containers are fresh..."
docker compose --profile gate down

# 2. Boot Gate Profile (builds Web + Playwright)
echo "2. Building & Booting Gate Stack..."
docker compose --profile gate up -d --build

# 3. Validation Logic (via safe-gate.sh or direct steps)
# We can re-use the logic from safe-gate.sh but ensure it targets the right container
echo "3. Running Checks..."

# Hydrate deps inside Linux container
./scripts/docker-run.sh pnpm install

# Migrate & Seed
./scripts/docker-run.sh pnpm db:migrate
./scripts/docker-run.sh pnpm --filter @interdomestik/database seed:e2e -- --reset
./scripts/docker-run.sh pnpm --filter @interdomestik/database seed:assert-e2e

# Check
./scripts/docker-run.sh pnpm test:smoke

echo "✅ Gate Passed!"
