#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

RUN_ROOT=""
ROLE="sentinel"
FIRST_FAILING_COMMAND="none"

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/sentinel-agent.sh --run-root <path>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-root)
      [[ $# -ge 2 ]] || { echo "[sentinel-agent] missing value for --run-root" >&2; exit 1; }
      RUN_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[sentinel-agent] unknown argument: $1" >&2
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

run_cmd 'pnpm security:guard' "$EVIDENCE_DIR/security-guard.log" || true

set +e
run_redacted "$EVIDENCE_DIR/sensitive-path-scan.txt" bash -lc \
  "cd '$ROOT_DIR' && git diff --name-only '$BASE_COMMIT'...HEAD | rg -n 'apps/web/src/proxy.ts|apps/web/src/.*(auth|tenant|proxy)|packages/.*/(auth|tenant)' || true"
SCAN_STATUS=$?
set -e
if [[ "$SCAN_STATUS" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
  FIRST_FAILING_COMMAND="sensitive path scan"
fi

SECRET_HITS=0
SECRET_SCAN_RAW="$EVIDENCE_DIR/secret-pattern-scan.raw"
{
  echo "# Secret Pattern Scan"
  echo
  while IFS= read -r changed_file; do
    [[ -n "$changed_file" ]] || continue
    [[ -f "$ROOT_DIR/$changed_file" ]] || continue
    if rg -n "(BEGIN [A-Z ]*PRIVATE KEY|sk_live_|AKIA[0-9A-Z]{16}|SUPABASE_SERVICE_ROLE_KEY)" "$ROOT_DIR/$changed_file"; then
      SECRET_HITS=$((SECRET_HITS + 1))
    fi
  done < <(git -C "$ROOT_DIR" diff --name-only "$BASE_COMMIT"...HEAD)
} >"$SECRET_SCAN_RAW"

redact_stream <"$SECRET_SCAN_RAW" >"$EVIDENCE_DIR/secret-pattern-scan.txt"
rm -f "$SECRET_SCAN_RAW"

STATUS="PASS"
if [[ "$FIRST_FAILING_COMMAND" != "none" || "$SECRET_HITS" -gt 0 ]]; then
  STATUS="FAIL"
fi

{
  echo "# Sentinel Summary"
  echo
  echo "- status: \`$STATUS\`"
  echo "- first_failing_command: \`$FIRST_FAILING_COMMAND\`"
  echo "- secret_hits: \`$SECRET_HITS\`"
  if [[ "$SECRET_HITS" -gt 0 ]]; then
    echo "- action: investigate and rotate any exposed keys before merge."
  fi
} >"$EVIDENCE_DIR/sentinel-summary.md"

write_role_status "$ROLE" "$RUN_ROOT" "$STATUS" "$FIRST_FAILING_COMMAND" "secret_hits=$SECRET_HITS"

if [[ "$STATUS" == "PASS" ]]; then
  echo "SENTINEL_STATUS: PASS"
else
  echo "SENTINEL_STATUS: FAIL"
  echo "FIRST_FAILING_COMMAND: $FIRST_FAILING_COMMAND"
  exit 1
fi
