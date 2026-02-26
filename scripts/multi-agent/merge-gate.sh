#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

RUN_ROOT=""
REQUIRE_TRACE_END_PASS=1

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/merge-gate.sh [options]

Machine-enforced merge gate for PR-hardening artifacts.

Options:
  --run-root <path>             Explicit run root (default: latest tmp/multi-agent/master/pr-hardening-*)
  --no-trace-end-pass-check     Skip pipeline end=pass check in trace.ndjson
  -h, --help                    Show this help
USAGE
}

fail() {
  printf '[merge-gate] FAIL: %s\n' "$1" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --run-root)
      [[ $# -ge 2 ]] || fail 'missing value for --run-root'
      RUN_ROOT="$2"
      shift 2
      ;;
    --no-trace-end-pass-check)
      REQUIRE_TRACE_END_PASS=0
      shift
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

if [[ -z "$RUN_ROOT" ]]; then
  RUN_ROOT="$(ls -dt "$ROOT_DIR"/tmp/multi-agent/master/pr-hardening-* 2>/dev/null | head -n1 || true)"
fi

[[ -n "$RUN_ROOT" ]] || fail 'no pr-hardening run root found'
[[ -d "$RUN_ROOT" ]] || fail "run root not found: $RUN_ROOT"

MANIFEST="$RUN_ROOT/run-manifest.md"
[[ -f "$MANIFEST" ]] || fail "run manifest missing: $MANIFEST"

execution_mode="$(read_manifest_value "$RUN_ROOT" execution_mode)"
merge_gate_scope="$(read_manifest_value "$RUN_ROOT" merge_gate_scope)"
ui_touched="$(read_manifest_value "$RUN_ROOT" ui_touched)"
marketing_touched="$(read_manifest_value "$RUN_ROOT" marketing_touched)"

[[ "$execution_mode" == "full" ]] || fail "merge requires execution_mode=full (found: ${execution_mode:-missing})"
[[ "$merge_gate_scope" == "full-pr-hardening" ]] || fail "merge requires merge_gate_scope=full-pr-hardening (found: ${merge_gate_scope:-missing})"

gatekeeper_verdict="$RUN_ROOT/evidence/gatekeeper/gatekeeper-verdict.md"
[[ -f "$gatekeeper_verdict" ]] || fail "missing gatekeeper verdict: $gatekeeper_verdict"
rg -q '^- final_verdict: `GO`$' "$gatekeeper_verdict" || fail 'gatekeeper verdict is not GO'

scribe_decision="$RUN_ROOT/evidence/scribe/decision-log.md"
[[ -f "$scribe_decision" ]] || fail "missing scribe decision log: $scribe_decision"
rg -q '^- final_recommendation: `GO' "$scribe_decision" || fail 'scribe recommendation is not GO*'

if [[ "$REQUIRE_TRACE_END_PASS" -eq 1 ]]; then
  trace_file="$RUN_ROOT/trace.ndjson"
  validate_trace_ndjson_file "$trace_file" || fail "trace schema validation failed: $trace_file"
  rg -q '"role":"pipeline".*"phase":"end".*"status":"pass"' "$trace_file" || fail 'trace missing pipeline end=pass event'
fi

required_roles=("atlas" "sentinel" "breaker" "forge" "gatekeeper" "scribe")
if [[ "$ui_touched" == "yes" ]]; then
  required_roles+=("pixel")
fi
if [[ "$marketing_touched" == "yes" ]]; then
  required_roles+=("marketing")
fi

for role in "${required_roles[@]}"; do
  status_file="$RUN_ROOT/evidence/$role/${role}.status"
  status_json="$RUN_ROOT/evidence/$role/${role}.status.json"
  contract_file="$RUN_ROOT/evidence/$role/${role}.contract-enforcement.md"

  [[ -f "$status_file" ]] || fail "missing status file for role=$role"
  [[ "$(cat "$status_file")" == "PASS" ]] || fail "role status is not PASS for role=$role"

  [[ -f "$status_json" ]] || fail "missing status json for role=$role"
  validate_status_json_file "$status_json" || fail "invalid status json for role=$role"

  [[ -f "$contract_file" ]] || fail "missing contract enforcement report for role=$role"
  rg -q '^- status: `PASS`$' "$contract_file" || fail "contract enforcement failed for role=$role"
done

printf '[merge-gate] PASS\n'
printf '[merge-gate] run_root=%s\n' "$RUN_ROOT"
