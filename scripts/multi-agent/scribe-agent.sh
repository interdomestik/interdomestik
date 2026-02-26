#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

RUN_ROOT=""
ROLE="scribe"
FIRST_FAILING_COMMAND="none"
PR_REF=""
PUBLISH_PR_COMMENT=0
COMMENT_STATUS="skipped"

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/scribe-agent.sh --run-root <path> [--publish-pr-comment] [--pr <number|url|branch>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-root)
      [[ $# -ge 2 ]] || { echo "[scribe-agent] missing value for --run-root" >&2; exit 1; }
      RUN_ROOT="$2"
      shift 2
      ;;
    --pr)
      [[ $# -ge 2 ]] || { echo "[scribe-agent] missing value for --pr" >&2; exit 1; }
      PR_REF="$2"
      shift 2
      ;;
    --publish-pr-comment)
      PUBLISH_PR_COMMENT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[scribe-agent] unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

require_run_root "$RUN_ROOT"
EVIDENCE_DIR="$RUN_ROOT/evidence/$ROLE"
mkdir -p "$EVIDENCE_DIR"

GATEKEEPER_STATUS_FILE="$RUN_ROOT/evidence/gatekeeper/gatekeeper.status"
GATEKEEPER_VERDICT_FILE="$RUN_ROOT/evidence/gatekeeper/gatekeeper-verdict.md"

if [[ ! -f "$GATEKEEPER_STATUS_FILE" || ! -f "$GATEKEEPER_VERDICT_FILE" ]]; then
  FIRST_FAILING_COMMAND="gatekeeper evidence presence check"
fi

GATEKEEPER_STATUS_VALUE=""
if [[ -f "$GATEKEEPER_STATUS_FILE" ]]; then
  GATEKEEPER_STATUS_VALUE="$(cat "$GATEKEEPER_STATUS_FILE")"
  if [[ "$GATEKEEPER_STATUS_VALUE" != "PASS" && "$FIRST_FAILING_COMMAND" == "none" ]]; then
    FIRST_FAILING_COMMAND="gatekeeper status gate"
  fi
fi

set +e
run_redacted "$EVIDENCE_DIR/evidence-file-inventory.log" rg --files "$RUN_ROOT/evidence"
INVENTORY_STATUS=$?
set -e
if [[ "$INVENTORY_STATUS" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
  FIRST_FAILING_COMMAND="rg --files evidence"
fi

set +e
run_redacted "$EVIDENCE_DIR/evidence-wc.log" bash -lc "cd '$ROOT_DIR' && wc -l '$RUN_ROOT'/evidence/*/*.log '$RUN_ROOT'/evidence/*/*.md 2>/dev/null || true"
WC_STATUS=$?
set -e
if [[ "$WC_STATUS" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
  FIRST_FAILING_COMMAND="wc -l evidence"
fi

set +e
run_redacted "$EVIDENCE_DIR/evidence-pattern-scan.log" rg -n "PASS|FAIL|GO|NO-GO|risk|boundary" "$RUN_ROOT/evidence"
PATTERN_STATUS=$?
set -e
if [[ "$PATTERN_STATUS" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
  FIRST_FAILING_COMMAND="rg pattern scan"
fi

GATEKEEPER_VERDICT="NO-GO"
if rg -q '^- final_verdict: `GO`$' "$GATEKEEPER_VERDICT_FILE"; then
  GATEKEEPER_VERDICT="GO"
elif [[ "$FIRST_FAILING_COMMAND" == "none" ]]; then
  FIRST_FAILING_COMMAND="gatekeeper verdict gate"
fi

STATUS="PASS"
if [[ "$FIRST_FAILING_COMMAND" != "none" ]]; then
  STATUS="FAIL"
fi

RECOMMENDATION="NO-GO"
if [[ "$STATUS" == "PASS" && "$GATEKEEPER_VERDICT" == "GO" ]]; then
  RECOMMENDATION="GO (qualified)"
fi

{
  echo "# Executive Summary"
  echo
  echo "- run_root: \`$RUN_ROOT\`"
  echo "- generated_utc: \`$(iso_utc)\`"
  echo "- gatekeeper_status: \`${GATEKEEPER_STATUS_VALUE:-unknown}\`"
  echo "- gatekeeper_verdict: \`$GATEKEEPER_VERDICT\`"
  echo "- recommendation: \`$RECOMMENDATION\`"
} >"$EVIDENCE_DIR/executive-summary.md"

{
  echo "# Findings Register"
  echo
  echo "## Blocking Findings"
  if [[ "$FIRST_FAILING_COMMAND" == "none" ]]; then
    echo "- None."
  else
    echo "- First failing command: \`$FIRST_FAILING_COMMAND\`"
  fi
  echo
  echo "## Residual Watchpoints"
  echo "- Keep monitoring flaky E2E trends and CI host-routed behavior."
} >"$EVIDENCE_DIR/findings-register.md"

{
  echo "# Decision Log"
  echo
  echo "- gatekeeper_verdict: \`$GATEKEEPER_VERDICT\`"
  echo "- scribe_status: \`$STATUS\`"
  echo "- final_recommendation: \`$RECOMMENDATION\`"
} >"$EVIDENCE_DIR/decision-log.md"

if [[ "$PUBLISH_PR_COMMENT" -eq 1 ]]; then
  COMMENT_BODY_FILE="$EVIDENCE_DIR/pr-comment-body.md"
  {
    echo "## Scribe Summary"
    echo
    echo "- Recommendation: \`$RECOMMENDATION\`"
    echo "- Gatekeeper status: \`${GATEKEEPER_STATUS_VALUE:-unknown}\`"
    echo "- Gatekeeper verdict: \`$GATEKEEPER_VERDICT\`"
    echo "- Scribe status: \`$STATUS\`"
    if [[ "$FIRST_FAILING_COMMAND" != "none" ]]; then
      echo "- First failing command: \`$FIRST_FAILING_COMMAND\`"
    fi
    echo
    echo "Artifacts:"
    echo "- \`$EVIDENCE_DIR/executive-summary.md\`"
    echo "- \`$EVIDENCE_DIR/findings-register.md\`"
    echo "- \`$EVIDENCE_DIR/decision-log.md\`"
  } >"$COMMENT_BODY_FILE"

  if ! command -v gh >/dev/null 2>&1; then
    COMMENT_STATUS="skipped-gh-missing"
  else
    set +e
    if [[ -n "$PR_REF" ]]; then
      gh pr comment "$PR_REF" --body-file "$COMMENT_BODY_FILE" >"$EVIDENCE_DIR/gh-pr-comment.log" 2>&1
    else
      gh pr comment --body-file "$COMMENT_BODY_FILE" >"$EVIDENCE_DIR/gh-pr-comment.log" 2>&1
    fi
    COMMENT_RC=$?
    set -e
    if [[ "$COMMENT_RC" -eq 0 ]]; then
      COMMENT_STATUS="posted"
    else
      COMMENT_STATUS="failed"
    fi
  fi
fi

{
  echo "- pr_comment_status: \`$COMMENT_STATUS\`"
} >>"$EVIDENCE_DIR/decision-log.md"

write_role_status "$ROLE" "$RUN_ROOT" "$STATUS" "$FIRST_FAILING_COMMAND" "recommendation=$RECOMMENDATION pr_comment=$COMMENT_STATUS"

if [[ "$STATUS" == "PASS" ]]; then
  echo "SCRIBE_STATUS: PASS"
else
  echo "SCRIBE_STATUS: FAIL"
  echo "FIRST_FAILING_COMMAND: $FIRST_FAILING_COMMAND"
  exit 1
fi
