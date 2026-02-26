#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

RUN_ROOT=""
ROLE="pixel"
FIRST_FAILING_COMMAND="none"

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/pixel-agent.sh --run-root <path>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-root)
      [[ $# -ge 2 ]] || { echo "[pixel-agent] missing value for --run-root" >&2; exit 1; }
      RUN_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[pixel-agent] unknown argument: $1" >&2
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

set +e
run_redacted "$EVIDENCE_DIR/ui-changed-path-inventory.txt" bash -lc \
  "cd '$ROOT_DIR' && git diff --name-only '$BASE_COMMIT'...HEAD | rg '^apps/web/src/(app|components|features)/' || true"
UI_INVENTORY_STATUS=$?
set -e
if [[ "$UI_INVENTORY_STATUS" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
  FIRST_FAILING_COMMAND="ui-changed-path-inventory"
fi

set +e
run_redacted "$EVIDENCE_DIR/clarity-marker-scan.txt" bash -lc \
  "cd '$ROOT_DIR' && rg -n 'page-ready|legacy-banner|data-testid' apps/web/src/components apps/web/src/features apps/web/src/app || true"
MARKER_STATUS=$?
set -e
if [[ "$MARKER_STATUS" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
  FIRST_FAILING_COMMAND="clarity-marker-scan"
fi

set +e
run_redacted "$EVIDENCE_DIR/accessibility-visual-consistency.md" bash -lc \
  "cd '$ROOT_DIR' && rg -n 'aria-|role=|alt=|label' apps/web/src/components apps/web/src/features apps/web/src/app || true"
A11Y_STATUS=$?
set -e
if [[ "$A11Y_STATUS" -ne 0 && "$FIRST_FAILING_COMMAND" == "none" ]]; then
  FIRST_FAILING_COMMAND="accessibility-visual-consistency"
fi

{
  echo "# Pixel Risk Notes"
  echo
  echo "- first_failing_command: \`$FIRST_FAILING_COMMAND\`"
  echo "- check_focus: UI touched-path inventory, clarity markers, accessibility signal scan."
  echo "- recommendation: run visual + a11y regression pass if release includes UI deltas."
} >"$EVIDENCE_DIR/risk-notes.md"

STATUS="PASS"
if [[ "$FIRST_FAILING_COMMAND" != "none" ]]; then
  STATUS="FAIL"
fi

write_role_status "$ROLE" "$RUN_ROOT" "$STATUS" "$FIRST_FAILING_COMMAND" "pixel completed"

if [[ "$STATUS" == "PASS" ]]; then
  echo "PIXEL_STATUS: PASS"
else
  echo "PIXEL_STATUS: FAIL"
  echo "FIRST_FAILING_COMMAND: $FIRST_FAILING_COMMAND"
  exit 1
fi
