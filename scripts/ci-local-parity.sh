#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

MODE="${1:-pr}"
INSIDE_CONTAINER=0

if [[ "${MODE}" == "--inside" ]]; then
  INSIDE_CONTAINER=1
  MODE="${2:-pr}"
fi

COMPOSE_PROFILE="ci-local"
POSTGRES_SERVICE="ci-postgres"
RUNNER_SERVICE="ci-parity"

usage() {
  cat <<'USAGE'
Usage: scripts/ci-local-parity.sh [quick|pr|full|clean]

Runs GitHub PR CI parity checks in a local Linux Docker runner.

Modes:
  quick  Static/audit/security checks without browser E2E.
  pr     Mirrors the substantive required PR checks, including PR E2E and pilot P0.
  full   Runs pr mode plus the merge-style E2E gate.
  clean  Removes local CI parity containers.

Environment:
  CI_LOCAL_REBUILD=1       Rebuild the runner image.
  CI_LOCAL_KEEP_RUNNING=1  Keep the Postgres service running after the run.
USAGE
}

run() {
  printf '\n==> %s\n' "$*"
  "$@"
}

run_shell() {
  printf '\n==> %s\n' "$*"
  bash -lc "$*"
}

ensure_mode() {
  case "${MODE}" in
    quick|pr|full|clean)
      return 0
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

clean_outer() {
  docker compose --profile "${COMPOSE_PROFILE}" rm -sf "${POSTGRES_SERVICE}" "${RUNNER_SERVICE}" >/dev/null 2>&1 || true
}

cleanup_outer() {
  if [[ "${CI_LOCAL_KEEP_RUNNING:-0}" == "1" ]]; then
    echo "Leaving ${POSTGRES_SERVICE} running (CI_LOCAL_KEEP_RUNNING=1)."
    return 0
  fi

  docker compose --profile "${COMPOSE_PROFILE}" rm -sf "${POSTGRES_SERVICE}" >/dev/null 2>&1 || true
}

run_outer() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required for local CI parity." >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running." >&2
    exit 1
  fi

  if [[ "${MODE}" == "clean" ]]; then
    clean_outer
    return 0
  fi

  run node scripts/ci/reviewer-preflight.mjs

  export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@ci-postgres:5432/interdomestik_test}"
  export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-local-ci-placeholder-anon-key}"
  export CI_LOCAL_GIT_DIR
  export CI_LOCAL_GIT_COMMON_DIR
  CI_LOCAL_GIT_DIR="$(cd "$(git rev-parse --git-dir)" && pwd -P)"
  CI_LOCAL_GIT_COMMON_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"

  trap cleanup_outer EXIT

  local build_args=(compose --profile "${COMPOSE_PROFILE}" build)
  if [[ "${CI_LOCAL_REBUILD:-0}" == "1" ]]; then
    build_args+=(--no-cache)
  fi
  build_args+=("${RUNNER_SERVICE}")

  run docker "${build_args[@]}"
  run docker compose --profile "${COMPOSE_PROFILE}" up -d "${POSTGRES_SERVICE}"
  run docker compose --profile "${COMPOSE_PROFILE}" run --rm "${RUNNER_SERVICE}" \
    bash scripts/ci-local-parity.sh --inside "${MODE}"
}

export_ci_defaults() {
  export CI=1
  export PLAYWRIGHT=1
  export HUSKY=0
  export NEXT_PUBLIC_BILLING_TEST_MODE=1
  export PORT="${PORT:-3000}"
  export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://127.0.0.1:3000}"
  export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://127.0.0.1:3000}"
  export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-test-secret-for-ci-only-do-not-use-in-production}"
  export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@ci-postgres:5432/interdomestik_test}"
  export DATABASE_URL_RLS="${DATABASE_URL_RLS:-${DATABASE_URL}}"
  export E2E_DATABASE_URL="${E2E_DATABASE_URL:-${DATABASE_URL}}"
  export E2E_DATABASE_URL_RLS="${E2E_DATABASE_URL_RLS:-${DATABASE_URL_RLS}}"
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
  export UPSTASH_REDIS_REST_URL="${UPSTASH_REDIS_REST_URL:-http://localhost:8080}"
  export UPSTASH_REDIS_REST_TOKEN="${UPSTASH_REDIS_REST_TOKEN:-dummy-token}"
  export RELEASE_GATE_MEMBER_EMAIL="${RELEASE_GATE_MEMBER_EMAIL:-member.ks.a1@interdomestik.com}"
  export RELEASE_GATE_AGENT_EMAIL="${RELEASE_GATE_AGENT_EMAIL:-agent.ks.a1@interdomestik.com}"
  export RELEASE_GATE_OFFICE_AGENT_EMAIL="${RELEASE_GATE_OFFICE_AGENT_EMAIL:-agent.ks.b1@interdomestik.com}"
  export RELEASE_GATE_STAFF_EMAIL="${RELEASE_GATE_STAFF_EMAIL:-staff.ks@interdomestik.com}"
  export RELEASE_GATE_ADMIN_KS_EMAIL="${RELEASE_GATE_ADMIN_KS_EMAIL:-admin.ks@interdomestik.com}"
  export RELEASE_GATE_ADMIN_MK_EMAIL="${RELEASE_GATE_ADMIN_MK_EMAIL:-admin.mk@interdomestik.com}"
  export RELEASE_GATE_MK_USER_URL="${RELEASE_GATE_MK_USER_URL:-}"
  export RELEASE_GATE_TARGET_USER_URL="${RELEASE_GATE_TARGET_USER_URL:-/admin/users/golden_mk_admin?tenantId=tenant_mk}"
  export RELEASE_GATE_REQUIRE_ROLE_PANEL="${RELEASE_GATE_REQUIRE_ROLE_PANEL:-false}"
  export STAFF_CLAIM_URL="${STAFF_CLAIM_URL:-}"
  export RELEASE_GATE_REQUIRE_STAFF_CLAIM_URL="${RELEASE_GATE_REQUIRE_STAFF_CLAIM_URL:-false}"
  export SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}"
  export SENTRY_ORG="${SENTRY_ORG:-}"
  export SENTRY_PROJECT="${SENTRY_PROJECT:-}"
  export SENTRY_DSN="${SENTRY_DSN:-}"
  export NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-}"
}

wait_for_postgres() {
  local max_attempts=60
  local attempt=1

  until pg_isready -h ci-postgres -p 5432 -U postgres >/dev/null 2>&1; do
    if (( attempt >= max_attempts )); then
      echo "Postgres did not become ready at ci-postgres:5432." >&2
      exit 1
    fi

    sleep 1
    attempt=$((attempt + 1))
  done
}

install_dependencies() {
  run pnpm install --frozen-lockfile --prefer-offline
}

install_playwright_chromium() {
  run pnpm --filter @interdomestik/web exec playwright install chromium
}

load_e2e_credentials() {
  local github_env_file
  github_env_file="$(mktemp)"
  export GITHUB_ENV="${github_env_file}"
  export GITHUB_RUN_ID="${GITHUB_RUN_ID:-local}"
  export GITHUB_RUN_ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"

  run bash scripts/ci/export-e2e-credentials.sh

  set -a
  # shellcheck disable=SC1090
  source "${github_env_file}"
  set +a
  rm -f "${github_env_file}"
  unset GITHUB_ENV
}

run_ci_audit() {
  run node scripts/check-env-ci.mjs
  run pnpm test:ci:contracts
  run pnpm check:e2e-contracts:base
  run pnpm lint:production-warnings
  run pnpm track:audit
  run pnpm plan:audit
  run pnpm purity:audit
  run pnpm db:migrations:check-journal
  run pnpm check:e2e-quarantine-budget
}

run_static_checks() {
  run pnpm -w lint
  run pnpm -w type-check
  run pnpm -w check:entrypoints:strict
  run pnpm -w i18n:check
  run pnpm -w i18n:purity:check --report=tmp/i18n-purity/local-ci-report.json
}

run_unit_checks() {
  run pnpm coverage:gate
  run pnpm test:release-gate
}

run_security_checks() {
  run pnpm security:guard
}

run_strict_e2e_guards() {
  run_shell '! rg "page\\.goto" apps/web/e2e/golden apps/web/e2e/gate -g "*.spec.ts" | rg -v "apps/web/e2e/gate/tenant-resolution.spec.ts"'
  run_shell '! rg -n "/(sq|en|mk|sr|de|hr)/api" apps/web/e2e -g "*.ts"'
}

run_pr_e2e_gate() {
  install_playwright_chromium
  load_e2e_credentials
  run_strict_e2e_guards
  run pnpm e2e:gate:pr
}

run_merge_e2e_gate() {
  install_playwright_chromium
  load_e2e_credentials
  run_strict_e2e_guards
  run pnpm e2e:gate
}

run_pilot_gate_p0() {
  local web_pid=''

  load_e2e_credentials
  run pnpm db:migrate
  run pnpm seed:e2e
  run pnpm seed:assert-e2e
  run pnpm --filter @interdomestik/web run build:ci

  pnpm --filter @interdomestik/web run start:ci > /tmp/interdomestik-local-ci-web.log 2>&1 &
  web_pid="$!"

  cleanup_web() {
    if [[ -n "${web_pid}" ]]; then
      kill "${web_pid}" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup_web RETURN

  for _ in {1..60}; do
    if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
      run pnpm -s release:gate:p0:raw --baseUrl http://127.0.0.1:3000
      return 0
    fi
    sleep 2
  done

  echo "Web server failed to become healthy on 127.0.0.1:3000." >&2
  cat /tmp/interdomestik-local-ci-web.log >&2 || true
  exit 1
}

run_quick_inside() {
  run_ci_audit
  run_static_checks
  run_security_checks
}

run_pr_inside() {
  run_ci_audit
  run_static_checks
  run_unit_checks
  run_pr_e2e_gate
  run_pilot_gate_p0
  run_security_checks
}

run_full_inside() {
  run_pr_inside
  run_merge_e2e_gate
}

run_inside() {
  export_ci_defaults
  wait_for_postgres
  install_dependencies

  case "${MODE}" in
    quick)
      run_quick_inside
      ;;
    pr)
      run_pr_inside
      ;;
    full)
      run_full_inside
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

ensure_mode

if [[ "${INSIDE_CONTAINER}" == "1" ]]; then
  run_inside
else
  run_outer
fi
