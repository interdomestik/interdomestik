#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

RUN_ROOT=""
ROLE="breaker"
FIRST_FAILING_COMMAND="none"

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/breaker-agent.sh --run-root <path>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-root)
      [[ $# -ge 2 ]] || { echo "[breaker-agent] missing value for --run-root" >&2; exit 1; }
      RUN_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[breaker-agent] unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

require_run_root "$RUN_ROOT"
EVIDENCE_DIR="$RUN_ROOT/evidence/$ROLE"
mkdir -p "$EVIDENCE_DIR"

BASE_COMMIT="$(read_manifest_value "$RUN_ROOT" "authoritative_base_commit")"
if [[ -z "$BASE_COMMIT" ]]; then
  BASE_COMMIT="$(git -C "$ROOT_DIR" merge-base HEAD origin/main)"
fi

run_cmd() {
  local command="$1"
  local log_file="$2"
  set +e
  run_redacted "$log_file" bash -lc "cd '$ROOT_DIR' && $command"
  local status=$?
  set -e
  if [[ "$status" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
    FIRST_FAILING_COMMAND="$command"
  fi
  return "$status"
}

run_cmd "git diff --unified=0 '$BASE_COMMIT'...HEAD -- scripts/release-gate/run.ts scripts/release-gate/shared.ts" \
  "$EVIDENCE_DIR/release-gate-diff.txt" || true
run_cmd 'pnpm release:gate:raw --help' "$EVIDENCE_DIR/release-gate-help.log" || true
run_cmd 'pnpm test:release-gate' "$EVIDENCE_DIR/test-release-gate.log" || true
run_cmd 'rg -n "parseRetryAfterSeconds|computeRetryDelayMs|login-attempt|retry-after|Math\.random|Date\.now" scripts/release-gate/run.ts scripts/release-gate/shared.ts' \
  "$EVIDENCE_DIR/release-gate-pattern-scan.log" || true

STATUS="PASS"
if [[ "$FIRST_FAILING_COMMAND" != "none" ]]; then
  STATUS="FAIL"
fi

{
  echo "# Breaker Findings"
  echo
  echo "- status: \`$STATUS\`"
  echo "- first_failing_command: \`$FIRST_FAILING_COMMAND\`"
  echo
  echo "## Attack Scenarios"
  echo "1. Retry-delay parsing edge cases: covered by release gate unit tests."
  echo "2. Randomized retry behavior drift: monitored through pattern scan and test:release-gate."
  echo "3. CLI argument hardening: checked via --help run."
} >"$EVIDENCE_DIR/breaker-findings.md"

write_role_status "$ROLE" "$RUN_ROOT" "$STATUS" "$FIRST_FAILING_COMMAND" "breaker completed"

if [[ "$STATUS" == "PASS" ]]; then
  echo "BREAKER_STATUS: PASS"
else
  echo "BREAKER_STATUS: FAIL"
  echo "FIRST_FAILING_COMMAND: $FIRST_FAILING_COMMAND"
  exit 1
fi
