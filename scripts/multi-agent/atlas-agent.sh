#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

RUN_ROOT=""
ROLE="atlas"
FIRST_FAILING_COMMAND="none"

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/atlas-agent.sh --run-root <path>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-root)
      [[ $# -ge 2 ]] || { echo "[atlas-agent] missing value for --run-root" >&2; exit 1; }
      RUN_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[atlas-agent] unknown argument: $1" >&2
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

BASE_ALIGNMENT_FILE="$EVIDENCE_DIR/base-alignment.md"
BASE_RECONCILE_FILE="$EVIDENCE_DIR/base-reconcile.md"
MAIN_DIFF_FILE="$EVIDENCE_DIR/diff-main-name-status.txt"
ORIGIN_DIFF_FILE="$EVIDENCE_DIR/diff-origin-main-name-status.txt"
AUTHORITATIVE_DIFF_FILE="$EVIDENCE_DIR/diff-authoritative-name-status.txt"
PATH_SENSITIVITY_FILE="$EVIDENCE_DIR/path-sensitivity-check.txt"
RISK_FILE="$EVIDENCE_DIR/risk-recommendation.md"
MAIN_SCOPE_REFERENCE="main...HEAD"

cmd() {
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

REV_PARSE_LOG="$EVIDENCE_DIR/atlas-required-cmd1.log"
REV_LIST_MAIN_LOG="$EVIDENCE_DIR/atlas-required-cmd2.log"
REV_LIST_ORIGIN_LOG="$EVIDENCE_DIR/atlas-required-cmd3.log"
DIFF_MAIN_LOG="$EVIDENCE_DIR/atlas-required-cmd4.log"
DIFF_ORIGIN_LOG="$EVIDENCE_DIR/atlas-required-cmd5.log"
WEB_PATHS_LOG="$EVIDENCE_DIR/atlas-required-cmd6.log"
SENSITIVE_PATHS_LOG="$EVIDENCE_DIR/atlas-required-cmd7.log"

cmd 'git rev-parse --abbrev-ref HEAD && git rev-parse HEAD origin/main && (git rev-parse main || echo "missing refs/heads/main")' "$REV_PARSE_LOG" || true
cmd 'if git show-ref --verify --quiet refs/heads/main; then git rev-list --left-right --count main...HEAD; else echo "missing refs/heads/main"; fi' "$REV_LIST_MAIN_LOG" || true
cmd 'git rev-list --left-right --count origin/main...HEAD' "$REV_LIST_ORIGIN_LOG" || true
cmd 'if git show-ref --verify --quiet refs/heads/main; then git diff --name-status main...HEAD; else echo "missing refs/heads/main"; fi' "$DIFF_MAIN_LOG" || true
cmd 'git diff --name-status origin/main...HEAD' "$DIFF_ORIGIN_LOG" || true
cmd "git diff --name-only origin/main...HEAD | rg '^apps/web/' || true" "$WEB_PATHS_LOG" || true
cmd "git diff --name-only origin/main...HEAD | rg 'apps/web/src/proxy.ts|/member|/agent|/staff|/admin|tenant|auth' || true" "$SENSITIVE_PATHS_LOG" || true

cp "$DIFF_MAIN_LOG" "$MAIN_DIFF_FILE"
cp "$DIFF_ORIGIN_LOG" "$ORIGIN_DIFF_FILE"

set +e
run_redacted "$AUTHORITATIVE_DIFF_FILE" bash -lc "cd '$ROOT_DIR' && git diff --name-status '$BASE_COMMIT'...HEAD"
AUTHORITATIVE_STATUS=$?
set -e
if [[ "$AUTHORITATIVE_STATUS" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
  FIRST_FAILING_COMMAND="git diff --name-status ${BASE_COMMIT}...HEAD"
fi

if git -C "$ROOT_DIR" show-ref --verify --quiet refs/heads/main; then
  MAIN_SCOPE_REFERENCE="main...HEAD"
  MAIN_COUNT="$(git -C "$ROOT_DIR" diff --name-only main...HEAD | wc -l | tr -d ' ')"
else
  MAIN_SCOPE_REFERENCE="(missing refs/heads/main)"
  MAIN_COUNT=0
fi
ORIGIN_COUNT="$(git -C "$ROOT_DIR" diff --name-only origin/main...HEAD | wc -l | tr -d ' ')"
AUTHORITATIVE_COUNT="$(git -C "$ROOT_DIR" diff --name-only "$BASE_COMMIT"...HEAD | wc -l | tr -d ' ')"
UI_TOUCHED="no"
if git -C "$ROOT_DIR" diff --name-only "$BASE_COMMIT"...HEAD | rg -q '^apps/web/src/(app|components|features)/'; then
  UI_TOUCHED="yes"
fi

{
  echo "# Base Alignment"
  echo
  echo "- generated_utc: \`$(iso_utc)\`"
  echo "- base_scope_reference: \`$MAIN_SCOPE_REFERENCE\`"
  echo "- base_scope_main_count: \`$MAIN_COUNT\`"
  echo "- base_scope_origin_main_count: \`$ORIGIN_COUNT\`"
  echo "- authoritative_base_ref: \`merge-base(HEAD,origin/main)\`"
  echo "- authoritative_base_commit: \`$BASE_COMMIT\`"
  echo "- authoritative_changed_file_count: \`$AUTHORITATIVE_COUNT\`"
  echo "- ui_touched: \`$UI_TOUCHED\`"
} >"$BASE_ALIGNMENT_FILE"

{
  echo "# Base Reconcile Evidence"
  echo
  echo "generated_utc: $(iso_utc)"
  echo "authoritative_base_ref: merge-base(HEAD,origin/main)"
  echo "base_commit: $BASE_COMMIT"
  echo "ui_touched: $UI_TOUCHED"
  echo "authoritative_changed_file_count: $AUTHORITATIVE_COUNT"
} >"$BASE_RECONCILE_FILE"

{
  echo "# Path Sensitivity Check"
  echo
  echo "Sensitive path scan against origin/main...HEAD:"
  cat "$SENSITIVE_PATHS_LOG"
} >"$PATH_SENSITIVITY_FILE"

RISK_CLASS="normal"
RISK_REASON="no boundary condition detected"
if [[ "$MAIN_COUNT" -eq 0 && "$ORIGIN_COUNT" -gt 0 ]]; then
  RISK_CLASS="boundary"
  if [[ "$MAIN_SCOPE_REFERENCE" == "(missing refs/heads/main)" ]]; then
    RISK_REASON="local refs/heads/main missing while origin/main...HEAD diverges"
  else
    RISK_REASON="main...HEAD empty while origin/main...HEAD diverges"
  fi
fi

{
  echo "# Risk Recommendation"
  echo
  echo "- risk_classification: \`$RISK_CLASS\`"
  echo "- rationale: $RISK_REASON"
  echo "- recommendation: use authoritative base \`merge-base(HEAD,origin/main)\` for hardening scope."
} >"$RISK_FILE"

STATUS="PASS"
if [[ "$FIRST_FAILING_COMMAND" != "none" ]]; then
  STATUS="FAIL"
fi

write_role_status "$ROLE" "$RUN_ROOT" "$STATUS" "$FIRST_FAILING_COMMAND" "atlas completed"

if [[ "$STATUS" == "PASS" ]]; then
  echo "ATLAS_STATUS: PASS"
else
  echo "ATLAS_STATUS: FAIL"
  echo "FIRST_FAILING_COMMAND: $FIRST_FAILING_COMMAND"
  exit 1
fi
