#!/usr/bin/env bash
set -euo pipefail

print_header() {
  printf '\n==================================================\n'
  printf '%s\n' "$1"
  printf '==================================================\n'
}

fail_with_next_steps() {
  local step="$1"
  local code="$2"
  printf '\n[FAIL] Step failed: %s (exit code: %s)\n' "$step" "$code" >&2
  printf '[NEXT] Fix the failing step, then re-run: ./scripts/pilot-verify.sh\n' >&2
  printf '[NEXT] Required checks: env vars, Node 20.x, pr:verify, security:guard, gatekeeper + e2e:gate\n' >&2
  exit "$code"
}

run_step() {
  local name="$1"
  shift
  print_header "$name"
  set +e
  "$@"
  local code=$?
  set -e
  if [[ $code -ne 0 ]]; then
    fail_with_next_steps "$name" "$code"
  fi
  printf '[PASS] %s\n' "$name"
}

print_header "Pilot Verification (Fail-Fast)"
printf 'This script does not mutate git state (it may generate build/test artifacts).\n'

run_step "1/5 Check required environment variables" bash -c '
  : "${DATABASE_URL:?DATABASE_URL is required}"
  : "${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET is required}"
  echo "Environment variables present."
'

run_step "2/5 Enforce Node 20.x" node -e '
  const v = process.versions.node.split(".").map(Number);
  if (v[0] !== 20) {
    console.error(`Node 20.x required, found ${process.versions.node}`);
    process.exit(1);
  }
  console.log(`Node OK: ${process.versions.node}`);
'

run_step "3/5 Run pnpm pr:verify" pnpm pr:verify
run_step "4/5 Run pnpm security:guard" pnpm security:guard
run_step "5/5 Run gatekeeper + e2e gate" bash -c 'bash scripts/m4-gatekeeper.sh && pnpm e2e:gate'

print_header "Pilot Verification Complete"
printf '[PASS] All pilot readiness checks succeeded.\n'
