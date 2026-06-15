#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
bash "${SCRIPT_DIR}/node-guard.sh"

echo "🚧 [Gatekeeper] Starting Deterministic Reset..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

INHERITED_DATABASE_URL="${DATABASE_URL:-}"
INHERITED_NEXT_PUBLIC_BILLING_TEST_MODE="${NEXT_PUBLIC_BILLING_TEST_MODE:-}"

if [ -f ".env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

if [ -n "${INHERITED_NEXT_PUBLIC_BILLING_TEST_MODE:-}" ]; then
  export NEXT_PUBLIC_BILLING_TEST_MODE="${INHERITED_NEXT_PUBLIC_BILLING_TEST_MODE}"
fi

if [ -n "${E2E_DATABASE_URL:-}" ]; then
  export DATABASE_URL="${E2E_DATABASE_URL}"
elif [ -n "${INHERITED_DATABASE_URL:-}" ]; then
  export DATABASE_URL="${INHERITED_DATABASE_URL}"
else
  if [ -n "${DATABASE_URL:-}" ]; then
    echo "ℹ️  [Gatekeeper] Ignoring env-file DATABASE_URL for Playwright gate parity"
  fi
  export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  echo "⚠️  [Gatekeeper] Using local default DATABASE_URL=${DATABASE_URL}"
fi

if [ -n "${E2E_DATABASE_URL_RLS:-}" ]; then
  export DATABASE_URL_RLS="${E2E_DATABASE_URL_RLS}"
else
  export DATABASE_URL_RLS="${DATABASE_URL}"
fi

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  export BETTER_AUTH_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")"
  echo "⚠️  [Gatekeeper] BETTER_AUTH_SECRET not set; generated an ephemeral secret for this run"
fi

ensure_disk_space() {
  echo "🧹 [Gatekeeper] Cleaning stale build artifacts..."
  rm -rf apps/web/.next .turbo || true

  local AVAILABLE_KB
  AVAILABLE_KB="$(df -Pk . | awk 'NR==2 { print $4 }')"
  if [ -z "${AVAILABLE_KB}" ]; then
    return 0
  fi

  if [ "${AVAILABLE_KB}" -lt $((6 * 1024 * 1024)) ]; then
    echo "⚠️  [Gatekeeper] Low disk space detected (<6GiB). Pruning pnpm store..."
    pnpm store prune || true
  fi

  AVAILABLE_KB="$(df -Pk . | awk 'NR==2 { print $4 }')"
  if [ "${AVAILABLE_KB}" -lt $((4 * 1024 * 1024)) ]; then
    echo "❌ [Gatekeeper] Not enough free disk space to build reliably (<4GiB)."
    echo "   Tip: free space or run 'pnpm store prune' and re-run."
    exit 1
  fi
}

cleanup_stale_playwright_processes() {
  echo "🧽 [Gatekeeper] Cleaning stale Playwright helper processes..."

  local patterns=(
    '@playwright/test/cli.js test-server -c apps/web/playwright.config.ts'
    'playwright test-server -c apps/web/playwright.config.ts'
  )

  for pattern in "${patterns[@]}"; do
    local stale_pids
    stale_pids="$(pgrep -f "${pattern}" 2>/dev/null || true)"
    if [[ -n "${stale_pids}" ]]; then
      echo "   terminating stale processes for pattern: ${pattern}"
      kill ${stale_pids} 2>/dev/null || true
    fi
  done
}

cleanup_stale_supabase_containers() {
  local stale_supabase_containers
  stale_supabase_containers="$(
    docker ps -a --format '{{.Names}}' | grep '^supabase_.*_interdomestik$' || true
  )"

  if [[ -z "${stale_supabase_containers}" ]]; then
    return 0
  fi

  echo "🧹 [Gatekeeper] Removing stale Supabase containers that may still hold host ports..."
  echo "${stale_supabase_containers}" | xargs docker rm -f >/dev/null 2>&1 || true
}

cleanup_stale_playwright_processes

echo "💀 [Gatekeeper] Killing stale processes on port 3000..."
PIDS="$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PIDS" ]; then
  kill -9 $PIDS 2>/dev/null || true
fi
echo "✅ [Gatekeeper] Port 3000 clear."

ensure_disk_space

ensure_supabase_running() {
  if node - <<'NODE'
const postgres = require('postgres');
const url = process.env.DATABASE_URL;
if (!url) process.exit(1);
const sql = postgres(url, { max: 1, idle_timeout: 2, connect_timeout: 2 });
sql`select 1`.then(() => sql.end({ timeout: 1 }).then(() => process.exit(0))).catch(() => process.exit(1));
NODE
  then
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ [Gatekeeper] Docker is required for local Supabase, but 'docker' is not installed."
    echo "   Tip: install Docker Desktop (or Colima) and re-run."
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "❌ [Gatekeeper] Docker daemon is not running (required for local Supabase)."
    echo "   Tip: start Docker Desktop (or your Docker daemon) and re-run 'pnpm e2e:gate'."
    exit 1
  fi

  if pnpm --filter @interdomestik/database exec supabase status >/dev/null 2>&1; then
    return 0
  fi

  echo "⚠️  [Gatekeeper] Supabase not running. Starting local Supabase..."
  if ! pnpm --filter @interdomestik/database exec supabase start; then
    echo "⚠️  [Gatekeeper] Supabase start failed (likely port already allocated)."
    echo "   Attempting to stop Supabase project 'interdomestik' and retry..."
    pnpm --filter @interdomestik/database exec supabase stop --project-id interdomestik >/dev/null 2>&1 || true
    pnpm --filter @interdomestik/database exec supabase stop >/dev/null 2>&1 || true
    cleanup_stale_supabase_containers
    pnpm --filter @interdomestik/database exec supabase start
  fi
}

wait_for_postgres() {
  echo "🔍 [Gatekeeper] Waiting for Postgres readiness..."
  local MAX_ATTEMPTS=60
  local ATTEMPT=0

  ensure_supabase_running

  until node - <<'NODE'
const postgres = require('postgres');
const url = process.env.DATABASE_URL;
if (!url) process.exit(1);
const sql = postgres(url, { max: 1, idle_timeout: 2, connect_timeout: 2 });
sql`select 1`.then(() => sql.end({ timeout: 1 }).then(() => process.exit(0))).catch(() => process.exit(1));
NODE
  do
    ATTEMPT=$((ATTEMPT+1))
    if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
      echo "❌ [Gatekeeper] Postgres unavailable after ${MAX_ATTEMPTS} attempts."
      echo "   DATABASE_URL=${DATABASE_URL}"
      echo "   Tip: run 'pnpm --filter @interdomestik/database exec supabase start'"
      exit 1
    fi
    echo "   ... waiting for db (${ATTEMPT}/${MAX_ATTEMPTS})"
    sleep 1
  done

  echo "✅ [Gatekeeper] Postgres is READY."
}

echo "🔍 [Gatekeeper] Checking DB connectivity..."
wait_for_postgres

echo "🏗️  [Gatekeeper] Applying Schema (Idempotent Migrate)..."
pnpm db:migrate

echo "🌱 [Gatekeeper] Seeding Deterministic State (Reset Mode)..."
pnpm seed:e2e -- --reset

echo "🏗️  [Gatekeeper] Building production-like standalone web artifact..."
pnpm --filter @interdomestik/web build

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ [Gatekeeper] State Contract Met."
echo "   - Connection: OK"
echo "   - Schema: Synced"
echo "   - Data: Deterministic (Version: E2E-Golden)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "💀 Killing any stale processes on port 3000..."
PIDS="$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PIDS" ]; then
  kill -9 $PIDS 2>/dev/null || true
fi
echo "✅ Port 3000 clear."
