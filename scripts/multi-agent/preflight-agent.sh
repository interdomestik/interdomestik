#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="${ROOT_DIR}/tmp/multi-agent/preflight"
STATE_DIR="${ROOT_DIR}/apps/web/.playwright/state"
SKIP_INSTALL=0
SKIP_STATE=0

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/preflight-agent.sh [options]

Runs deterministic preflight checks for multi-agent runs:
  1) dependency sync
  2) default env bootstrap
  3) Playwright auth state generation (ks/mk)

Options:
  --log-dir <path>    Override log directory (default: tmp/multi-agent/preflight)
  --skip-install      Skip pnpm install
  --skip-state        Skip Playwright storage-state generation
  -h, --help          Show this help
USAGE
}

fail() {
  printf '[preflight-agent] FAIL: %s\n' "$1" >&2
  exit 1
}

step=0
run_step() {
  step=$((step + 1))
  local label="$1"
  shift

  local slug
  slug="$(echo "$label" | tr '[:upper:]' '[:lower:]' | tr ' /' '--' | tr -cd 'a-z0-9._-')"
  local log_file
  log_file="$(printf '%s/%02d-%s.log' "$LOG_DIR" "$step" "$slug")"

  printf '\n[preflight-agent] %s\n' "$label"
  (
    set -x
    "$@"
  ) 2>&1 | tee "$log_file"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --log-dir)
      [[ $# -ge 2 ]] || fail 'missing value for --log-dir'
      LOG_DIR="$2"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --skip-state)
      SKIP_STATE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
  done

mkdir -p "$LOG_DIR"

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-test-secret-for-local-dev-only-32chars-minimum}"

run_step "tooling-check" bash -lc "cd '$ROOT_DIR' && node --version && pnpm --version"

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  run_step "pnpm-install-frozen-lockfile" bash -lc "cd '$ROOT_DIR' && pnpm install --frozen-lockfile"
else
  printf '[preflight-agent] skipped pnpm install\n'
fi

if [[ "$SKIP_STATE" -eq 0 ]]; then
  run_step "playwright-setup-state" bash -lc "cd '$ROOT_DIR' && pnpm --filter @interdomestik/web test:e2e -- e2e/setup.state.spec.ts --project=setup-ks --project=setup-mk"

  [[ -f "$STATE_DIR/ks.json" ]] || fail "missing Playwright state file: $STATE_DIR/ks.json"
  [[ -f "$STATE_DIR/mk.json" ]] || fail "missing Playwright state file: $STATE_DIR/mk.json"
  printf '[preflight-agent] state files ready: %s/ks.json, %s/mk.json\n' "$STATE_DIR" "$STATE_DIR"
else
  printf '[preflight-agent] skipped Playwright storage-state generation\n'
fi

printf '\n[preflight-agent] PASS\n'
printf '[preflight-agent] logs: %s\n' "$LOG_DIR"
