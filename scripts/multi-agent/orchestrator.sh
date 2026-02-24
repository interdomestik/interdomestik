#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
LOG_ROOT="${ROOT_DIR}/tmp/multi-agent/run-${RUN_ID}"
PR_REF=""
RUN_PREFLIGHT=1
RUN_GATES=1
RUN_FINALIZER=0
WATCH_CI=0
CI_INTERVAL=20

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/orchestrator.sh [options]

Enterprise multi-agent entrypoint with explicit lanes:
  - preflight-agent
  - gate lane (security/rls/pr-verify-hosts/e2e-gate)
  - finalizer-agent (optional)

Options:
  --pr <number|url|branch>  PR selector for CI monitor/finalizer
  --log-root <path>         Override run log root (default: tmp/multi-agent/run-<UTC>)
  --skip-preflight          Skip preflight lane
  --skip-gates              Skip gate lane
  --finalize                Run finalizer-agent at the end
  --watch-ci                Keep CI monitor running in finalizer mode
  --ci-interval <seconds>   CI watch interval (default: 20)
  -h, --help                Show this help
USAGE
}

fail() {
  printf '[orchestrator] FAIL: %s\n' "$1" >&2
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
  log_file="$(printf '%s/%02d-%s.log' "$LOG_ROOT" "$step" "$slug")"

  printf '\n[orchestrator] %s\n' "$label"
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
    --pr)
      [[ $# -ge 2 ]] || fail 'missing value for --pr'
      PR_REF="$2"
      shift 2
      ;;
    --log-root)
      [[ $# -ge 2 ]] || fail 'missing value for --log-root'
      LOG_ROOT="$2"
      shift 2
      ;;
    --skip-preflight)
      RUN_PREFLIGHT=0
      shift
      ;;
    --skip-gates)
      RUN_GATES=0
      shift
      ;;
    --finalize)
      RUN_FINALIZER=1
      shift
      ;;
    --watch-ci)
      WATCH_CI=1
      shift
      ;;
    --ci-interval)
      [[ $# -ge 2 ]] || fail 'missing value for --ci-interval'
      CI_INTERVAL="$2"
      shift 2
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

mkdir -p "$LOG_ROOT"

printf '[orchestrator] run_id=%s\n' "$RUN_ID"
printf '[orchestrator] log_root=%s\n' "$LOG_ROOT"

if [[ "$RUN_PREFLIGHT" -eq 1 ]]; then
  run_step 'preflight-agent' bash "$ROOT_DIR/scripts/multi-agent/preflight-agent.sh" --log-dir "$LOG_ROOT/preflight"
else
  printf '[orchestrator] skip preflight-agent\n'
fi

if [[ "$RUN_GATES" -eq 1 ]]; then
  run_step 'gate-security-guard' bash -lc "cd '$ROOT_DIR' && pnpm security:guard"
  run_step 'gate-rls-required' bash -lc "cd '$ROOT_DIR' && REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test"
  run_step 'gate-pr-verify-hosts' bash -lc "cd '$ROOT_DIR' && pnpm pr:verify:hosts"
  run_step 'gate-e2e-gate' bash -lc "cd '$ROOT_DIR' && pnpm e2e:gate"
else
  printf '[orchestrator] skip gate lane\n'
fi

if [[ "$RUN_FINALIZER" -eq 1 ]]; then
  finalizer_cmd=(bash "$ROOT_DIR/scripts/multi-agent/finalizer-agent.sh")
  if [[ -n "$PR_REF" ]]; then
    finalizer_cmd+=(--pr "$PR_REF")
  fi
  if [[ "$WATCH_CI" -eq 1 ]]; then
    finalizer_cmd+=(--watch-ci --ci-interval "$CI_INTERVAL")
  fi

  run_step 'finalizer-agent' "${finalizer_cmd[@]}"
fi

printf '\n[orchestrator] PASS\n'
printf '[orchestrator] logs: %s\n' "$LOG_ROOT"
