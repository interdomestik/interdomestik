#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/docker-env-bootstrap.sh
source "${SCRIPT_DIR}/docker-env-bootstrap.sh"

echo "🔒 Starting Parity Gate..."
prepare_docker_env

DOCKER_GATE_REBUILD="${DOCKER_GATE_REBUILD:-0}"
DOCKER_GATE_KEEP_RUNNING="${DOCKER_GATE_KEEP_RUNNING:-0}"
DOCKER_GATE_RECLAIM="${DOCKER_GATE_RECLAIM:-1}"
DOCKER_GATE_CACHE_MODE="${DOCKER_GATE_CACHE_MODE:-ephemeral}"
DOCKER_WEB_PORT="${DOCKER_WEB_PORT:-3000}"
GATE_INFRA_SERVICES=(redis mailpit minio)
DOCKER_RUN_ARGS=(--raw)
MAX_WEB_READY_ATTEMPTS="${MAX_WEB_READY_ATTEMPTS:-60}"
WEB_READY_DELAY_SECONDS="${WEB_READY_DELAY_SECONDS:-2}"
GATE_WEB_READY_URL="${GATE_WEB_READY_URL:-http://127.0.0.1:${DOCKER_WEB_PORT}/robots.txt}"

validate_gate_cache_mode() {
  case "${DOCKER_GATE_CACHE_MODE}" in
    ephemeral|warm)
      return 0
      ;;
    *)
      echo "ERROR: DOCKER_GATE_CACHE_MODE must be 'ephemeral' or 'warm'." >&2
      return 1
      ;;
  esac
}

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

  return 0
}

trap cleanup_gate_stack EXIT

build_gate_images() {
  local docker_args=(compose build)
  if [[ "${DOCKER_GATE_REBUILD}" == "1" ]]; then
    docker_args+=(--no-cache)
  fi
  docker_args+=(web playwright)
  docker "${docker_args[@]}"

  return 0
}

wait_for_gate_web() {
  local attempt=1

  while (( attempt <= MAX_WEB_READY_ATTEMPTS )); do
    if curl --fail --silent --output /dev/null "${GATE_WEB_READY_URL}"; then
      return 0
    fi

    sleep "${WEB_READY_DELAY_SECONDS}"
    attempt=$((attempt + 1))
  done

  echo "❌ Timed out waiting for gate web service to become ready." >&2
  docker compose --profile gate ps || true
  docker compose --profile gate logs --tail 200 web || true
  return 1
}

# 1. Clean previous gate containers (fresh run)
echo "1. Ensuring gate containers are fresh..."
validate_gate_cache_mode
docker compose --profile gate down --remove-orphans

# 2. Build gate images once, then start infra services.
echo "2. Building gate images..."
build_gate_images

echo "3. Booting gate infra services..."
printf '   Gate cache mode: "%s"\n' "${DOCKER_GATE_CACHE_MODE}"
docker compose --profile gate up -d "${GATE_INFRA_SERVICES[@]}"
echo "4. Ensuring MinIO bucket exists..."
docker compose --profile gate run --rm --no-deps createbuckets

# 5. Prepare dependencies and deterministic test data in Linux container.
echo "5. Preparing gate runner in Linux container..."
if [[ "${DOCKER_GATE_REBUILD}" == "1" ]]; then
  DOCKER_RUN_ARGS=(--build --raw)
fi

./scripts/docker-run.sh "${DOCKER_RUN_ARGS[@]}" "\
set -euo pipefail && \
cleanup() { pnpm store prune >/dev/null 2>&1 || true; } && \
trap cleanup EXIT && \
pnpm install --frozen-lockfile --prefer-offline && \
pnpm db:migrate && \
pnpm --filter @interdomestik/database seed:e2e -- --reset && \
pnpm --filter @interdomestik/database seed:assert-e2e"

echo "6. Booting gate web service..."
docker compose --profile gate up -d web

echo "7. Waiting for gate web service..."
wait_for_gate_web

echo "8. Running smoke tests in Linux container..."
./scripts/docker-run.sh --raw "\
set -euo pipefail && \
cleanup() { pnpm store prune >/dev/null 2>&1 || true; } && \
trap cleanup EXIT && \
SENTRY_AUTH_TOKEN= \
SENTRY_ORG= \
SENTRY_PROJECT= \
SENTRY_DSN= \
NEXT_PUBLIC_SENTRY_DSN= \
PW_EXTERNAL_SERVER=1 SKIP_NODE_GUARD=1 pnpm --filter @interdomestik/web test:smoke"

echo "✅ Gate Passed!"
