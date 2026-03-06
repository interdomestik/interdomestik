#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/docker-env-bootstrap.sh
source "${SCRIPT_DIR}/docker-env-bootstrap.sh"

echo "🔒 Starting Parity Gate..."
prepare_docker_env

DOCKER_GATE_REBUILD="${DOCKER_GATE_REBUILD:-0}"
DOCKER_GATE_KEEP_RUNNING="${DOCKER_GATE_KEEP_RUNNING:-0}"
DOCKER_GATE_RECLAIM="${DOCKER_GATE_RECLAIM:-1}"

cleanup_gate_stack() {
  if [[ "${DOCKER_GATE_KEEP_RUNNING}" == "1" ]]; then
    echo "4. Leaving gate stack running (DOCKER_GATE_KEEP_RUNNING=1)."
  else
    echo "4. Stopping gate stack..."
    docker compose --profile gate down --remove-orphans >/dev/null 2>&1 || true
    if [[ "${DOCKER_GATE_RECLAIM}" == "1" ]]; then
      echo "5. Reclaiming Docker disk (gate mode)..."
      bash scripts/docker-reclaim.sh gate
    fi
  fi

  if [[ "${DOCKER_GATE_KEEP_RUNNING}" == "1" && "${DOCKER_GATE_RECLAIM}" == "1" ]]; then
    echo "5. Skipping reclaim because gate stack is kept running."
  fi
}

trap cleanup_gate_stack EXIT

# 1. Clean previous gate containers (fresh run)
echo "1. Ensuring gate containers are fresh..."
docker compose --profile gate down --remove-orphans

# 2. Boot Gate profile (builds Web + Playwright)
echo "2. Building & booting gate stack..."
if [[ "${DOCKER_GATE_REBUILD}" == "1" ]]; then
  docker compose --profile gate up -d --build
else
  docker compose --profile gate up -d
fi

# 3. Run checks in a single Playwright container session so dependency hydration
# and generated artifacts remain available for subsequent commands.
echo "3. Running gate checks in Linux container..."
./scripts/docker-run.sh --raw "\
pnpm install && \
pnpm db:migrate && \
pnpm --filter @interdomestik/database seed:e2e -- --reset && \
pnpm --filter @interdomestik/database seed:assert-e2e && \
SENTRY_AUTH_TOKEN= \
SENTRY_ORG= \
SENTRY_PROJECT= \
SENTRY_DSN= \
NEXT_PUBLIC_SENTRY_DSN= \
SKIP_NODE_GUARD=1 pnpm --filter @interdomestik/web test:smoke"

echo "✅ Gate Passed!"
