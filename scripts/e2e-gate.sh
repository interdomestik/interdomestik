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

discover_standalone_server() {
  local standalone_root="${ROOT_DIR}/apps/web/.next/standalone"
  local default_server="${standalone_root}/apps/web/server.js"
  local fallback_server="${standalone_root}/server.js"
  local discovered_server=""

  if [ -f "${default_server}" ]; then
    printf '%s' "${default_server}"
    return 0
  fi

  if [ -f "${fallback_server}" ]; then
    printf '%s' "${fallback_server}"
    return 0
  fi

  if [ -d "${standalone_root}" ]; then
    discovered_server="$(find "${standalone_root}" -path '*/apps/web/server.js' -print -quit 2>/dev/null || true)"
    if [ -n "${discovered_server}" ]; then
      printf '%s' "${discovered_server}"
      return 0
    fi
  fi

  return 1
}

# Build the web app if the standalone server artifact is missing.
STANDALONE_ROOT="${ROOT_DIR}/apps/web/.next/standalone"
LEGACY_STANDALONE_SERVER="${STANDALONE_ROOT}/apps/web/server.js"
FALLBACK_STANDALONE_SERVER="${STANDALONE_ROOT}/server.js"

resolve_standalone_server() {
  local discovered_server=""

  if [ -f "${LEGACY_STANDALONE_SERVER}" ]; then
    printf '%s' "${LEGACY_STANDALONE_SERVER}"
    return 0
  fi

  if [ -f "${FALLBACK_STANDALONE_SERVER}" ]; then
    printf '%s' "${FALLBACK_STANDALONE_SERVER}"
    return 0
  fi

  [[ ! -d "${STANDALONE_ROOT}" ]] && return 1

  discovered_server="$(
    find "${STANDALONE_ROOT}" -path '*/node_modules/*' -prune -o -type f -name server.js -print | sort | head -n 1
  )"
  [[ -n "${discovered_server}" ]] || return 1

  printf '%s' "${discovered_server}"
}

if ! resolve_standalone_server >/dev/null; then
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
