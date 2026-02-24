#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STEP_LABEL=""
LOG_FILE=""
ATTEMPT=1
MAX_ATTEMPTS=3

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/verification-agent.sh [options]

Deterministic failure triage + bounded auto-remediation.

Options:
  --root <path>            Repository root (default: inferred)
  --label <text>           Failed step label
  --log-file <path>        Failed step log file
  --attempt <integer>      Current retry attempt number
  --max-attempts <integer> Maximum allowed retries for this step
  -h, --help               Show this help

Exit codes:
  0  remediation applied successfully
  3  no deterministic remediation found
  4  remediation was selected but failed
  2  invalid invocation
USAGE
}

fail() {
  printf '[verification-agent] FAIL: %s\n' "$1" >&2
  exit 2
}

match_pattern() {
  local pattern="$1"
  local value="$2"
  if command -v rg >/dev/null 2>&1; then
    printf '%s' "$value" | rg -qi -- "$pattern"
    return $?
  fi

  printf '%s' "$value" | grep -Eqi -- "$pattern"
}

run_fix() {
  local fix_name="$1"
  shift
  printf '[verification-agent] remediation=%s\n' "$fix_name"
  if "$@"; then
    printf '[verification-agent] remediation=%s status=applied\n' "$fix_name"
    return 0
  fi

  printf '[verification-agent] remediation=%s status=failed\n' "$fix_name" >&2
  return 4
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --root)
      [[ $# -ge 2 ]] || fail 'missing value for --root'
      ROOT_DIR="$2"
      shift 2
      ;;
    --label)
      [[ $# -ge 2 ]] || fail 'missing value for --label'
      STEP_LABEL="$2"
      shift 2
      ;;
    --log-file)
      [[ $# -ge 2 ]] || fail 'missing value for --log-file'
      LOG_FILE="$2"
      shift 2
      ;;
    --attempt)
      [[ $# -ge 2 ]] || fail 'missing value for --attempt'
      ATTEMPT="$2"
      shift 2
      ;;
    --max-attempts)
      [[ $# -ge 2 ]] || fail 'missing value for --max-attempts'
      MAX_ATTEMPTS="$2"
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

[[ -n "$STEP_LABEL" ]] || fail '--label is required'
[[ -n "$LOG_FILE" ]] || fail '--log-file is required'
[[ -f "$LOG_FILE" ]] || fail "log file does not exist: $LOG_FILE"

if ! [[ "$ATTEMPT" =~ ^[0-9]+$ && "$MAX_ATTEMPTS" =~ ^[0-9]+$ ]]; then
  fail '--attempt and --max-attempts must be integers'
fi

printf '[verification-agent] label=%s attempt=%s/%s\n' "$STEP_LABEL" "$ATTEMPT" "$MAX_ATTEMPTS"
log_excerpt="$(tail -n 500 "$LOG_FILE" 2>/dev/null || true)"

if match_pattern 'EADDRINUSE|address already in use|Port 3000|port 3000' "$log_excerpt"; then
  run_fix "clear-port-3000" bash -lc "if lsof -ti :3000 >/dev/null 2>&1; then lsof -ti :3000 | xargs kill -9; fi"
  exit $?
fi

if match_pattern 'ECONNREFUSED|connection refused|postgres.*ready|database.*unreachable|could not connect' "$log_excerpt"; then
  run_fix "db-migrate-refresh" bash -lc "cd '$ROOT_DIR' && pnpm db:migrate"
  exit $?
fi

if match_pattern 'playwright|storage state|state file|setup\.state' "$log_excerpt"; then
  run_fix "refresh-playwright-state" bash -lc "cd '$ROOT_DIR' && pnpm --filter @interdomestik/web test:e2e -- e2e/setup.state.spec.ts --project=setup-ks --project=setup-mk"
  exit $?
fi

if match_pattern 'Cannot find module|ERR_MODULE_NOT_FOUND|ERR_PNPM_OUTDATED_LOCKFILE|command not found' "$log_excerpt"; then
  run_fix "pnpm-install-frozen-lockfile" bash -lc "cd '$ROOT_DIR' && pnpm install --frozen-lockfile"
  exit $?
fi

printf '[verification-agent] no deterministic remediation for %s\n' "$STEP_LABEL"
exit 3
