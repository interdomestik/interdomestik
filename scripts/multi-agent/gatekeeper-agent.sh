#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

RUN_ROOT=""
ROLE="gatekeeper"
FIRST_FAILING_COMMAND="none"
VERDICT="NO-GO"

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/gatekeeper-agent.sh --run-root <path>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-root)
      [[ $# -ge 2 ]] || { echo "[gatekeeper-agent] missing value for --run-root" >&2; exit 1; }
      RUN_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[gatekeeper-agent] unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

require_run_root "$RUN_ROOT"
EVIDENCE_DIR="$RUN_ROOT/evidence/$ROLE"
mkdir -p "$EVIDENCE_DIR"

UI_TOUCHED="$(read_manifest_value "$RUN_ROOT" "ui_touched")"
if [[ -z "$UI_TOUCHED" ]]; then
  UI_TOUCHED="no"
fi

MARKETING_TOUCHED="$(read_manifest_value "$RUN_ROOT" "marketing_touched")"
if [[ -z "$MARKETING_TOUCHED" ]]; then
  MARKETING_TOUCHED="no"
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

wave1_roles=(atlas forge sentinel breaker)
if [[ "$UI_TOUCHED" == "yes" ]]; then
  wave1_roles+=(pixel)
fi
if [[ "$MARKETING_TOUCHED" == "yes" ]]; then
  wave1_roles+=(marketing)
fi

upstream_failures=0
{
  echo "# Upstream Dependency Check"
  echo
  for role_name in "${wave1_roles[@]}"; do
    status_file="$RUN_ROOT/evidence/$role_name/${role_name}.status"
    status_json_file="$RUN_ROOT/evidence/$role_name/${role_name}.status.json"
    case "$role_name" in
      atlas) evidence_file="$RUN_ROOT/evidence/atlas/risk-recommendation.md" ;;
      forge) evidence_file="$RUN_ROOT/evidence/forge/forge-summary.md" ;;
      sentinel) evidence_file="$RUN_ROOT/evidence/sentinel/sentinel-summary.md" ;;
      breaker) evidence_file="$RUN_ROOT/evidence/breaker/breaker-findings.md" ;;
      pixel) evidence_file="$RUN_ROOT/evidence/pixel/risk-notes.md" ;;
      marketing) evidence_file="$RUN_ROOT/evidence/marketing/marketing-summary.md" ;;
      *) evidence_file="" ;;
    esac

    if [[ ! -f "$status_file" ]]; then
      upstream_failures=$((upstream_failures + 1))
      echo "- $role_name status: missing ($status_file)"
    elif [[ "$(cat "$status_file")" != "PASS" ]]; then
      upstream_failures=$((upstream_failures + 1))
      echo "- $role_name status: FAIL"
    else
      echo "- $role_name status: PASS"
    fi

    if [[ ! -f "$status_json_file" ]]; then
      upstream_failures=$((upstream_failures + 1))
      echo "- $role_name status.json: missing ($status_json_file)"
    else
      echo "- $role_name status.json: present"
    fi

    if [[ -n "$evidence_file" ]]; then
      if [[ ! -f "$evidence_file" ]]; then
        upstream_failures=$((upstream_failures + 1))
        echo "- $role_name evidence: missing ($evidence_file)"
      else
        echo "- $role_name evidence: present"
      fi
    fi
  done
} >"$EVIDENCE_DIR/upstream-dependency-check.md"

if [[ "$upstream_failures" -eq 0 ]]; then
  run_cmd 'pnpm pr:verify' "$EVIDENCE_DIR/pr-verify.log" || true
  run_cmd 'pnpm security:guard' "$EVIDENCE_DIR/security-guard.log" || true
  run_cmd 'pnpm e2e:gate' "$EVIDENCE_DIR/e2e-gate.log" || true
else
  FIRST_FAILING_COMMAND="wave1 dependency contract check"
fi

STATUS="PASS"
if [[ "$FIRST_FAILING_COMMAND" != "none" ]]; then
  STATUS="FAIL"
fi

if [[ "$STATUS" == "PASS" ]]; then
  VERDICT="GO"
fi

{
  echo "# Gatekeeper Verdict"
  echo
  echo "- run_root: \`$RUN_ROOT\`"
  echo "- gatekeeper_status: \`$STATUS\`"
  echo "- final_verdict: \`$VERDICT\`"
  echo "- ui_touched: \`$UI_TOUCHED\`"
  echo "- marketing_touched: \`$MARKETING_TOUCHED\`"
  echo "- upstream_failure_count: \`$upstream_failures\`"
  echo
  echo "## Upstream Evidence Checks"
  cat "$EVIDENCE_DIR/upstream-dependency-check.md"
  echo
  echo "## Decision"
  echo "$VERDICT"
} >"$EVIDENCE_DIR/gatekeeper-verdict.md"

write_role_status "$ROLE" "$RUN_ROOT" "$STATUS" "$FIRST_FAILING_COMMAND" "verdict=$VERDICT"

if [[ "$STATUS" == "PASS" ]]; then
  echo "GATEKEEPER_STATUS: PASS"
  echo "VERDICT: $VERDICT"
else
  echo "GATEKEEPER_STATUS: FAIL"
  echo "VERDICT: $VERDICT"
  echo "FIRST_FAILING_COMMAND: $FIRST_FAILING_COMMAND"
  exit 1
fi
