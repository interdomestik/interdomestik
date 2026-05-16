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
  echo 'Usage: scripts/ci-local-parity.sh [quick|pr|full|sonar|clean]'
}

run() {
  printf '\n==> %s\n' "$*"
  "$@"
}

run_shell() {
  printf '\n==> %s\n' "$*"
  bash -lc "$*"
}

d() {
  local name="$1"
  shift
  [[ -n "${!name-}" ]] || export "${name}=$*"
}

ensure_mode() {
  case "${MODE}" in
    quick|pr|full|sonar|clean)
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
  export SONAR_HOST_URL="${SONAR_HOST_URL:-http://sonarqube:9000}"
  export SONAR_PROJECT_KEY="${SONAR_PROJECT_KEY:-interdomestik}"
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
  export CI=1 PLAYWRIGHT=1 HUSKY=0 NEXT_PUBLIC_BILLING_TEST_MODE=1
  d PORT 3000
  d NEXT_PUBLIC_APP_URL http://127.0.0.1:3000
  d BETTER_AUTH_URL http://127.0.0.1:3000
  d BETTER_AUTH_SECRET test-secret-for-ci-only-do-not-use-in-production
  d DATABASE_URL postgresql://postgres:postgres@ci-postgres:5432/interdomestik_test
  d DATABASE_URL_RLS "${DATABASE_URL}"
  d E2E_DATABASE_URL "${DATABASE_URL}"
  d E2E_DATABASE_URL_RLS "${DATABASE_URL_RLS}"
  d NODE_OPTIONS --max-old-space-size=4096
  d UPSTASH_REDIS_REST_URL http://localhost:8080
  d UPSTASH_REDIS_REST_TOKEN dummy-token
  d RELEASE_GATE_MEMBER_EMAIL member.ks.a1@interdomestik.com
  d RELEASE_GATE_AGENT_EMAIL agent.ks.a1@interdomestik.com
  d RELEASE_GATE_OFFICE_AGENT_EMAIL agent.ks.b1@interdomestik.com
  d RELEASE_GATE_STAFF_EMAIL staff.ks@interdomestik.com
  d RELEASE_GATE_ADMIN_KS_EMAIL admin.ks@interdomestik.com
  d RELEASE_GATE_ADMIN_MK_EMAIL admin.mk@interdomestik.com
  d RELEASE_GATE_MK_USER_URL ''
  d RELEASE_GATE_TARGET_USER_URL /admin/users/golden_mk_admin?tenantId=tenant_mk
  d RELEASE_GATE_REQUIRE_ROLE_PANEL false
  d STAFF_CLAIM_URL ''
  d RELEASE_GATE_REQUIRE_STAFF_CLAIM_URL false
  d SENTRY_AUTH_TOKEN ''
  d SENTRY_ORG ''
  d SENTRY_PROJECT ''
  d SENTRY_DSN ''
  d NEXT_PUBLIC_SENTRY_DSN ''
}

wait_for_postgres() {
  for _ in {1..60}; do
    pg_isready -h ci-postgres -p 5432 -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done

  echo "Postgres did not become ready at ci-postgres:5432." >&2
  exit 1
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

run_rls_integration_gate() {
  run pnpm db:rls:test:required
}

run_security_checks() {
  run pnpm security:guard
  run_shell '
    attempt() {
      pnpm audit --prod --audit-level=high --json > /tmp/pnpm-audit.json || true
      node scripts/pnpm-audit-gate.mjs /tmp/pnpm-audit.json
    }

    for i in 1 2 3; do
      if attempt; then
        exit 0
      fi
      echo "pnpm audit gate failed (attempt ${i}/3). Retrying..." >&2
      sleep $((i * 5))
    done

    echo "pnpm audit gate failed after retries." >&2
    exit 1
  '
}

ensure_sonar_server_ready() {
  if [[ "${SONAR_HOST_URL}" == *"sonarcloud.io"* ]]; then
    return 0
  fi

  local status_url="${SONAR_HOST_URL%/}/api/system/status"
  if curl -fsS --connect-timeout 5 --max-time 10 "${status_url}" >/dev/null; then
    return 0
  fi

  echo "SonarQube unreachable at ${SONAR_HOST_URL}; run pnpm sonar:start." >&2
  exit 2
}

run_sonar_checks() {
  if [[ -z "${SONAR_TOKEN:-}" ]]; then
    echo "SONAR_TOKEN required; run pnpm ci:local:sonar." >&2
    exit 2
  fi

  export SONAR_HOST_URL="${SONAR_HOST_URL:-http://sonarqube:9000}"
  export SONAR_PROJECT_KEY="${SONAR_PROJECT_KEY:-interdomestik}"
  export SONAR_SCANNER_FORCE_NATIVE="${SONAR_SCANNER_FORCE_NATIVE:-true}"
  export SONAR_RUN_COVERAGE="${SONAR_RUN_COVERAGE:-true}"
  ensure_sonar_server_ready

  if [[ "${SONAR_RUN_COVERAGE}" == "true" ]]; then
    export NEXT_PUBLIC_BILLING_TEST_MODE=0
  fi

  run pnpm sonar:gate
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
  run_rls_integration_gate
  run_pr_e2e_gate
  run_pilot_gate_p0
  run_security_checks
}

run_full_inside() {
  run_pr_inside
  run_merge_e2e_gate
}

run_sonar_inside() {
  run_sonar_checks
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
    sonar)
      run_sonar_inside
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
