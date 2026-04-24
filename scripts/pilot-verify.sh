#!/usr/bin/env bash
set -euo pipefail

print_ranked_flow() {
  cat <<'EOF'
Canonical ranked pilot-entry flow

1. Pre-launch readiness
   pnpm pilot:check

2. Production gate proof + pilot-entry artifacts
   pnpm release:gate:prod -- --pilotId <pilot-id>

3. Launch-day and daily operating row
   pnpm pilot:evidence:record -- --pilotId <pilot-id> --day <n> --date <YYYY-MM-DD> --owner "<owner>" --status <green|amber|red> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --decision <continue|pause|hotfix|stop> --bundlePath <path|n/a>

4. Launch-day and daily observability row
   pnpm pilot:observability:record -- --pilotId <pilot-id> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult <clear|expected-noise|action-required> --functionalErrorCount <n> --expectedAuthDenyCount <n> --kpiCondition <within-threshold|watch|breach> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --notes <text|n/a>

5. Launch-day and daily decision row
   pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType <daily|weekly> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --decision <continue|pause|hotfix|stop> [--rollbackTag <pilot-ready-YYYYMMDD|n/a>] [--observabilityRef <day-<n>|week-<n>>]

Conditional commands
- Rollback tag discipline: pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>
- Resume / re-entry cadence: pnpm pilot:cadence:check -- --pilotId <pilot-id>
EOF
  return 0
}

if [[ "${1:-}" == "--print-ranked-flow" ]]; then
  print_ranked_flow
  exit 0
fi

print_header() {
  printf '\n==================================================\n'
  printf '%s\n' "$1"
  printf '==================================================\n'
}

fail_with_next_steps() {
  local step="$1"
  local code="$2"
  printf '\n[FAIL] Step failed: %s (exit code: %s)\n' "$step" "$code" >&2
  printf '[NEXT] Fix the failing step, then re-run: pnpm pilot:check\n' >&2
  printf '[NEXT] For the ranked operator path use: pnpm pilot:flow\n' >&2
  printf '[NEXT] This command is local pre-launch verification only; it does not create release reports or pilot-entry artifacts.\n' >&2
  printf '[NEXT] For production release proof use: pnpm release:gate:prod\n' >&2
  printf '[NEXT] For pilot entry artifact generation use: pnpm release:gate:prod -- --pilotId <pilot-id>\n' >&2
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
printf 'Canonical authority: `pnpm pilot:check` is the operator command for this local pre-launch verification pack.\n'
printf 'This script is the shell-native implementation path and does not replace `pnpm release:gate:prod` for production proof.\n'

run_step "1/5 Check required environment variables" bash -c '
  : "${DATABASE_URL:?DATABASE_URL is required}"
  : "${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET is required}"
  echo "Environment variables present."
'

run_step "2/5 Enforce repo Node version" bash scripts/node-guard.sh

run_step "3/5 Run pnpm pr:verify" pnpm pr:verify
run_step "4/5 Run pnpm security:guard" pnpm security:guard
run_step "5/5 Run gatekeeper + e2e gate" bash -c 'bash scripts/m4-gatekeeper.sh && pnpm e2e:gate'

print_header "Pilot Verification Complete"
printf '[PASS] All pilot readiness checks succeeded.\n'
printf '[NEXT] Continue with the ranked operator path via: pnpm pilot:flow\n'
