#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/docker-env-bootstrap.sh
source "${SCRIPT_DIR}/docker-env-bootstrap.sh"

echo "🔒 Starting Parity Gate..."
prepare_docker_env

# 1. Clean previous gate containers (fresh run)
echo "1. Ensuring gate containers are fresh..."
docker compose --profile gate down

# 2. Boot Gate profile (builds Web + Playwright)
echo "2. Building & booting gate stack..."
docker compose --profile gate up -d --build

# 3. Run checks in a single Playwright container session so dependency hydration
# and generated artifacts remain available for subsequent commands.
echo "3. Running gate checks in Linux container..."
./scripts/docker-run.sh --raw "\
pnpm install && \
pnpm db:migrate && \
pnpm --filter @interdomestik/database seed:e2e -- --reset && \
pnpm --filter @interdomestik/database seed:assert-e2e && \
SKIP_NODE_GUARD=1 pnpm --filter @interdomestik/web test:smoke"

echo "✅ Gate Passed!"
