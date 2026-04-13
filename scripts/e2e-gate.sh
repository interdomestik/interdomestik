#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# Load local development env (no secrets committed; file is gitignored)
if [ -f ".env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

# Provide a sane default for local Supabase when DATABASE_URL isn't present.
# This mirrors the value documented in .env.example.
if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres"
  echo "⚠️  [E2E Gate] DATABASE_URL not set; defaulting to ${DATABASE_URL}"
fi

# Build the web app if the standalone server artifact is missing.
STANDALONE_ROOT="${ROOT_DIR}/apps/web/.next/standalone"
LEGACY_STANDALONE_SERVER="${STANDALONE_ROOT}/apps/web/server.js"
FALLBACK_STANDALONE_SERVER="${STANDALONE_ROOT}/server.js"

resolve_standalone_server() {
  if [ -f "${LEGACY_STANDALONE_SERVER}" ]; then
    printf '%s' "${LEGACY_STANDALONE_SERVER}"
    return 0
  fi

  if [ -f "${FALLBACK_STANDALONE_SERVER}" ]; then
    printf '%s' "${FALLBACK_STANDALONE_SERVER}"
    return 0
  fi

  find "${STANDALONE_ROOT}" -path '*/node_modules/*' -prune -o -type f -name server.js -print | sort | head -n 1
}

if [ -z "$(resolve_standalone_server)" ]; then
  echo "🏗️  [E2E Gate] Missing standalone server; building @interdomestik/web..."
  pnpm --filter @interdomestik/web build
fi

# Reset & seed deterministic DB state
./scripts/m4-gatekeeper.sh

# Run the gate tests
pnpm --filter @interdomestik/web exec playwright test e2e/gate "$@" \
  --project=ks-sq \
  --project=mk-mk \
  --max-failures=1 \
  --trace=retain-on-failure \
  --reporter=line
