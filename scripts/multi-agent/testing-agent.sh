#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="${ROOT_DIR}/tmp/multi-agent/testing"
RUNS=10
SUITE="gate-fast"
CUSTOM_COMMAND=""
RESET_EACH_RUN=0
STRICT=0
REWRITE_DETERMINISTIC=0
PREPARE_STATE=1
PATH_WITH_NODE="$PATH"

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/testing-agent.sh [options]

Runs repeated Playwright executions to detect flakiness and optionally rewrites
flaky sleep-based waits to deterministic data-testid waits.

Options:
  --runs <integer>                           Number of runs (default: 10)
  --suite <gate-fast|gate|custom>            Suite preset (default: gate-fast)
  --command "<cmd>"                          Custom command for --suite custom
  --log-dir <path>                           Output directory for run artifacts
  --reset-each-run                           Run m4-gatekeeper before each run
  --no-prepare-state                         Skip setup.state generation when gate-fast states are missing
  --rewrite-deterministic                    Rewrite flaky spec waitForTimeout -> waitForAnyReadyMarker
  --strict                                   Exit non-zero when flaky tests are detected
  -h, --help                                 Show this help
USAGE
}

fail() {
  printf '[testing-agent] FAIL: %s\n' "$1" >&2
  exit 1
}

if [[ -n "${NVM_BIN:-}" && -d "${NVM_BIN:-}" ]]; then
  PATH_WITH_NODE="${NVM_BIN}:$PATH_WITH_NODE"
fi

print_context() {
  if [[ -n "${MULTI_AGENT_CONTEXT_BUNDLE:-}" && -f "${MULTI_AGENT_CONTEXT_BUNDLE:-}" ]]; then
    printf '[testing-agent] context-bundle=%s\n' "$MULTI_AGENT_CONTEXT_BUNDLE"
    printf '[testing-agent] context-files=%s\n' "${MULTI_AGENT_CONTEXT_FILES:-unknown}"
  else
    printf '[testing-agent] context-bundle=none\n'
  fi
}

resolve_command() {
  case "$SUITE" in
    gate-fast)
      printf "%s" "pnpm --filter @interdomestik/web exec playwright test e2e/gate --project=gate-ks-sq --project=gate-mk-mk --workers=1"
      ;;
    gate)
      printf "%s" "pnpm --filter @interdomestik/web exec playwright test e2e/gate --project=ks-sq --project=mk-mk --workers=1"
      ;;
    custom)
      [[ -n "$CUSTOM_COMMAND" ]] || fail '--command is required when --suite custom'
      printf "%s" "$CUSTOM_COMMAND"
      ;;
    *)
      fail '--suite must be one of: gate-fast, gate, custom'
      ;;
  esac
}

ensure_gate_state() {
  local ks_state="$ROOT_DIR/apps/web/.playwright/state/ks.json"
  local mk_state="$ROOT_DIR/apps/web/.playwright/state/mk.json"

  if [[ -f "$ks_state" && -f "$mk_state" ]]; then
    printf '[testing-agent] state files ready: %s and %s\n' "$ks_state" "$mk_state"
    return 0
  fi

  if [[ "$PREPARE_STATE" -eq 0 ]]; then
    fail "missing gate-fast storage state files; run setup.state or omit --no-prepare-state"
  fi

  printf '[testing-agent] preparing missing gate-fast storage state files...\n'
  (
    cd "$ROOT_DIR"
    PATH="$PATH_WITH_NODE"
    SKIP_NODE_GUARD=1 pnpm --filter @interdomestik/web test:e2e -- e2e/setup.state.spec.ts --project=setup-ks --project=setup-mk
  )
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --runs)
      [[ $# -ge 2 ]] || fail 'missing value for --runs'
      RUNS="$2"
      shift 2
      ;;
    --suite)
      [[ $# -ge 2 ]] || fail 'missing value for --suite'
      SUITE="$2"
      shift 2
      ;;
    --command)
      [[ $# -ge 2 ]] || fail 'missing value for --command'
      CUSTOM_COMMAND="$2"
      shift 2
      ;;
    --log-dir)
      [[ $# -ge 2 ]] || fail 'missing value for --log-dir'
      LOG_DIR="$2"
      shift 2
      ;;
    --reset-each-run)
      RESET_EACH_RUN=1
      shift
      ;;
    --no-prepare-state)
      PREPARE_STATE=0
      shift
      ;;
    --rewrite-deterministic)
      REWRITE_DETERMINISTIC=1
      shift
      ;;
    --strict)
      STRICT=1
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

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
  fail '--runs must be a positive integer'
fi

if [[ "$SUITE" == "gate-fast" ]]; then
  ensure_gate_state
fi

RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
RUN_ROOT="$LOG_DIR/run-$RUN_ID"
RUNS_DIR="$RUN_ROOT/runs"
ANALYSIS_DIR="$RUN_ROOT/analysis"
mkdir -p "$RUNS_DIR" "$ANALYSIS_DIR"

COMMAND="$(resolve_command)"
ACTIVE_NODE_BIN="$(PATH="$PATH_WITH_NODE" command -v node || true)"
ACTIVE_NODE_VERSION="$(PATH="$PATH_WITH_NODE" node -v 2>/dev/null || printf 'unknown')"

print_context
printf '[testing-agent] suite=%s runs=%s\n' "$SUITE" "$RUNS"
printf '[testing-agent] command=%s\n' "$COMMAND"
printf '[testing-agent] node=%s (%s)\n' "$ACTIVE_NODE_VERSION" "${ACTIVE_NODE_BIN:-unknown}"
printf '[testing-agent] node-guard-bypass=SKIP_NODE_GUARD=1\n'
printf '[testing-agent] run-root=%s\n' "$RUN_ROOT"

if [[ "$SUITE" != "custom" && "$RESET_EACH_RUN" -eq 0 ]]; then
  printf '[testing-agent] preparing deterministic test state via m4-gatekeeper (once)\n'
  (
    cd "$ROOT_DIR"
    PATH="$PATH_WITH_NODE"
    SKIP_NODE_GUARD=1 ./scripts/m4-gatekeeper.sh
  )
fi

for ((i = 1; i <= RUNS; i++)); do
  run_name="$(printf 'run-%02d' "$i")"
  run_log="$RUNS_DIR/${run_name}.log"
  run_report="$RUNS_DIR/${run_name}.report.json"
  run_status_file="$RUNS_DIR/${run_name}.status"

  printf '\n[testing-agent] (%s/%s) %s\n' "$i" "$RUNS" "$run_name"

  if [[ "$RESET_EACH_RUN" -eq 1 ]]; then
    printf '[testing-agent] (%s) resetting deterministic state via m4-gatekeeper\n' "$run_name"
    (
      cd "$ROOT_DIR"
      PATH="$PATH_WITH_NODE"
      SKIP_NODE_GUARD=1 ./scripts/m4-gatekeeper.sh
    ) | tee -a "$run_log"
  fi

  rm -f "$ROOT_DIR/apps/web/test-results/report.json"

  set +e
  (
    cd "$ROOT_DIR"
    PATH="$PATH_WITH_NODE"
    SKIP_NODE_GUARD=1 bash -c "$COMMAND"
  ) 2>&1 | tee "$run_log"
  cmd_status=${PIPESTATUS[0]}
  set -e

  printf '%s\n' "$cmd_status" >"$run_status_file"

  if [[ -f "$ROOT_DIR/apps/web/test-results/report.json" ]]; then
    cp "$ROOT_DIR/apps/web/test-results/report.json" "$run_report"
  else
    printf '{"stats":{"expected":0,"unexpected":1,"flaky":0,"skipped":0,"duration":0},"suites":[]}\n' >"$run_report"
  fi

  printf '[testing-agent] (%s) exit-status=%s report=%s\n' "$run_name" "$cmd_status" "$run_report"
done

SUMMARY_JSON="$ANALYSIS_DIR/flake-summary.json"
SUMMARY_MD="$ANALYSIS_DIR/flake-summary.md"
FLAKY_FILES_TXT="$ANALYSIS_DIR/flaky-files.txt"
REWRITE_SUMMARY_JSON="$ANALYSIS_DIR/rewrite-summary.json"

analyze_args=(
  --reports-dir "$RUNS_DIR"
  --out-json "$SUMMARY_JSON"
  --out-md "$SUMMARY_MD"
  --flaky-files-out "$FLAKY_FILES_TXT"
  --repo-root "$ROOT_DIR"
)

if [[ "$REWRITE_DETERMINISTIC" -eq 1 ]]; then
  analyze_args+=(--rewrite --rewrite-summary-out "$REWRITE_SUMMARY_JSON")
fi

node "$ROOT_DIR/scripts/multi-agent/testing-agent-analyze.mjs" "${analyze_args[@]}"

FLAKY_COUNT="$(
  node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(p.totals.flakyTests));" "$SUMMARY_JSON"
)"
CONSISTENT_FAILURES="$(
  node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(p.totals.consistentFailingTests));" "$SUMMARY_JSON"
)"
FAILED_RUNS="$(
  node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(p.totals.failedRuns));" "$SUMMARY_JSON"
)"
OBSERVED_TESTS="$(
  node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(p.totals.observedTests));" "$SUMMARY_JSON"
)"

printf '\n[testing-agent] flaky-tests=%s consistent-failing-tests=%s failed-runs=%s observed-tests=%s\n' \
  "$FLAKY_COUNT" "$CONSISTENT_FAILURES" "$FAILED_RUNS" "$OBSERVED_TESTS"
printf '[testing-agent] summary-json=%s\n' "$SUMMARY_JSON"
printf '[testing-agent] summary-md=%s\n' "$SUMMARY_MD"

if [[ "$REWRITE_DETERMINISTIC" -eq 1 ]]; then
  printf '[testing-agent] rewrite-summary=%s\n' "$REWRITE_SUMMARY_JSON"
fi

if [[ "$OBSERVED_TESTS" -eq 0 ]]; then
  fail "no tests were observed across all runs; audit is invalid. See $SUMMARY_MD"
fi

if [[ "$FAILED_RUNS" -eq "$RUNS" ]]; then
  fail "all repeated runs failed; cannot determine flakiness reliably. See $SUMMARY_MD"
fi

if [[ "$STRICT" -eq 1 && ( "$FLAKY_COUNT" -gt 0 || "$FAILED_RUNS" -gt 0 ) ]]; then
  fail "strict mode detected flaky tests or failed runs (flaky=$FLAKY_COUNT, failed-runs=$FAILED_RUNS). See $SUMMARY_MD"
fi

printf '[testing-agent] PASS\n'
