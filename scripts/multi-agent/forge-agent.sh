#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

RUN_ROOT=""
ROLE="forge"
FIRST_FAILING_COMMAND="none"
STARTED_AT="$(iso_utc)"

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/forge-agent.sh --run-root <path>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-root)
      [[ $# -ge 2 ]] || { echo "[forge-agent] missing value for --run-root" >&2; exit 1; }
      RUN_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[forge-agent] unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

require_run_root "$RUN_ROOT"
EVIDENCE_DIR="$RUN_ROOT/evidence/$ROLE"
mkdir -p "$EVIDENCE_DIR"

run_cmd() {
  local command="$1"
  local log_file="$2"
  set +e
  run_redacted "$log_file" bash -lc "cd '$ROOT_DIR' && $command"
  local status=$?
  set -e
  printf '%s\n' "$status" >"${log_file%.log}.status"
  if [[ "$status" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
    FIRST_FAILING_COMMAND="$command"
  fi
  return "$status"
}

run_cmd 'pnpm test:release-gate' "$EVIDENCE_DIR/test-release-gate.log" || true
run_cmd 'pnpm check:fast' "$EVIDENCE_DIR/check-fast.log" || true
run_cmd 'pnpm pr:verify' "$EVIDENCE_DIR/pr-verify.log" || true

STATUS="PASS"
if [[ "$FIRST_FAILING_COMMAND" != "none" ]]; then
  STATUS="FAIL"
fi

{
  echo "# Forge Summary"
  echo
  echo "- started_utc: \`$STARTED_AT\`"
  echo "- completed_utc: \`$(iso_utc)\`"
  echo "- status: \`$STATUS\`"
  echo "- first_failing_command: \`$FIRST_FAILING_COMMAND\`"
  echo
  echo "## Exit Codes"
  echo "- test:release-gate: \`$(cat "$EVIDENCE_DIR/test-release-gate.status")\`"
  echo "- check:fast: \`$(cat "$EVIDENCE_DIR/check-fast.status")\`"
  echo "- pr:verify: \`$(cat "$EVIDENCE_DIR/pr-verify.status")\`"
} >"$EVIDENCE_DIR/forge-summary.md"

write_role_status "$ROLE" "$RUN_ROOT" "$STATUS" "$FIRST_FAILING_COMMAND" "forge completed"

if [[ "$STATUS" == "PASS" ]]; then
  echo "FORGE_STATUS: PASS"
else
  echo "FORGE_STATUS: FAIL"
  echo "FIRST_FAILING_COMMAND: $FIRST_FAILING_COMMAND"
  exit 1
fi
