#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
LOG_ROOT="${ROOT_DIR}/tmp/multi-agent/run-${RUN_ID}"
EVENTS_FILE=""
ROLE_SCORECARD_FILE=""
PR_REF=""
RUN_PREFLIGHT=1
RUN_GATES=1
RUN_FINALIZER=0
WATCH_CI=0
CI_INTERVAL=20
EXECUTION_MODE="auto"
TASK_COMPLEXITY="high"
ESTIMATED_COST_USD="0"
BUDGET_USD="5"
TASK_COUNT=1
REQUIRES_BOUNDARY_REVIEW=0

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/orchestrator.sh [options]

Enterprise multi-agent entrypoint with explicit lanes:
  - preflight-agent
  - gate lane (security/rls/pr-verify-hosts/e2e-gate)
  - finalizer-agent (optional)

Options:
  --pr <number|url|branch>  PR selector for CI monitor/finalizer
  --log-root <path>         Override run log root (default: tmp/multi-agent/run-<UTC>)
  --skip-preflight          Skip preflight lane
  --skip-gates              Skip gate lane
  --finalize                Run finalizer-agent at the end
  --watch-ci                Keep CI monitor running in finalizer mode
  --ci-interval <seconds>   CI watch interval (default: 20)
  --execution-mode <auto|single|multi>     Orchestration mode (default: auto)
  --task-complexity <low|medium|high>      Complexity signal for auto mode (default: high)
  --estimated-cost-usd <number>            Estimated run cost for policy evaluation
  --budget-usd <number>                    Budget cap for policy evaluation (default: 5)
  --task-count <integer>                   Independent task count for policy evaluation
  --requires-boundary-review <bool>        Boundary/security review required (default: false)
  -h, --help                Show this help
USAGE
}

fail() {
  printf '[orchestrator] FAIL: %s\n' "$1" >&2
  exit 1
}

step=0
append_event() {
  local role="$1"
  local label="$2"
  local status="$3"
  local latency_ms="$4"
  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"timestamp":"%s","role":"%s","label":"%s","status":%s,"latencyMs":%s}\n' \
    "$timestamp" "$role" "$label" "$status" "$latency_ms" >>"$EVENTS_FILE"
}

run_role_step() {
  local role="$1"
  local label="$2"
  shift 2

  step=$((step + 1))

  local slug
  slug="$(echo "$label" | tr '[:upper:]' '[:lower:]' | tr ' /' '--' | tr -cd 'a-z0-9._-')"
  local log_file
  log_file="$(printf '%s/%02d-%s.log' "$LOG_ROOT" "$step" "$slug")"
  local started_ms
  local ended_ms
  local latency_ms
  local cmd_status

  started_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  printf '\n[orchestrator] [%s] %s\n' "$role" "$label"
  set +e
  (
    set -x
    "$@"
  ) 2>&1 | tee "$log_file"
  cmd_status=${PIPESTATUS[0]}
  set -e
  ended_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  latency_ms="$((ended_ms - started_ms))"
  append_event "$role" "$label" "$cmd_status" "$latency_ms"

  if [[ "$cmd_status" -ne 0 ]]; then
    printf '[orchestrator] step failed: role=%s label=%s status=%s\n' "$role" "$label" "$cmd_status" >&2
    return "$cmd_status"
  fi
}

materialize_role_metrics() {
  if [[ ! -f "$EVENTS_FILE" ]]; then
    return 0
  fi

  if node "$ROOT_DIR/scripts/multi-agent/metrics-lane.mjs" --events "$EVENTS_FILE" --out "$ROLE_SCORECARD_FILE" >/dev/null 2>&1; then
    printf '[orchestrator] role_scorecard=%s\n' "$ROLE_SCORECARD_FILE"
  else
    printf '[orchestrator] WARN: role metrics generation failed\n' >&2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --pr)
      [[ $# -ge 2 ]] || fail 'missing value for --pr'
      PR_REF="$2"
      shift 2
      ;;
    --log-root)
      [[ $# -ge 2 ]] || fail 'missing value for --log-root'
      LOG_ROOT="$2"
      shift 2
      ;;
    --skip-preflight)
      RUN_PREFLIGHT=0
      shift
      ;;
    --skip-gates)
      RUN_GATES=0
      shift
      ;;
    --finalize)
      RUN_FINALIZER=1
      shift
      ;;
    --watch-ci)
      WATCH_CI=1
      shift
      ;;
    --ci-interval)
      [[ $# -ge 2 ]] || fail 'missing value for --ci-interval'
      CI_INTERVAL="$2"
      shift 2
      ;;
    --execution-mode)
      [[ $# -ge 2 ]] || fail 'missing value for --execution-mode'
      EXECUTION_MODE="$2"
      shift 2
      ;;
    --task-complexity)
      [[ $# -ge 2 ]] || fail 'missing value for --task-complexity'
      TASK_COMPLEXITY="$2"
      shift 2
      ;;
    --estimated-cost-usd)
      [[ $# -ge 2 ]] || fail 'missing value for --estimated-cost-usd'
      ESTIMATED_COST_USD="$2"
      shift 2
      ;;
    --budget-usd)
      [[ $# -ge 2 ]] || fail 'missing value for --budget-usd'
      BUDGET_USD="$2"
      shift 2
      ;;
    --task-count)
      [[ $# -ge 2 ]] || fail 'missing value for --task-count'
      TASK_COUNT="$2"
      shift 2
      ;;
    --requires-boundary-review)
      [[ $# -ge 2 ]] || fail 'missing value for --requires-boundary-review'
      REQUIRES_BOUNDARY_REVIEW="$2"
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

EVENTS_FILE="${LOG_ROOT}/events.ndjson"
ROLE_SCORECARD_FILE="${LOG_ROOT}/role-scorecard.json"
mkdir -p "$LOG_ROOT"
: >"$EVENTS_FILE"
trap materialize_role_metrics EXIT

POLICY_JSON="$(
  node "$ROOT_DIR/scripts/multi-agent/orchestrator-policy.mjs" \
    --mode "$EXECUTION_MODE" \
    --complexity "$TASK_COMPLEXITY" \
    --estimated-cost-usd "$ESTIMATED_COST_USD" \
    --budget-usd "$BUDGET_USD" \
    --task-count "$TASK_COUNT" \
    --requires-boundary-review "$REQUIRES_BOUNDARY_REVIEW" \
    --format json
)"
SELECTED_MODE="$(
  node "$ROOT_DIR/scripts/multi-agent/orchestrator-policy.mjs" \
    --mode "$EXECUTION_MODE" \
    --complexity "$TASK_COMPLEXITY" \
    --estimated-cost-usd "$ESTIMATED_COST_USD" \
    --budget-usd "$BUDGET_USD" \
    --task-count "$TASK_COUNT" \
    --requires-boundary-review "$REQUIRES_BOUNDARY_REVIEW" \
    --format mode
)"

printf '[orchestrator] run_id=%s\n' "$RUN_ID"
printf '[orchestrator] log_root=%s\n' "$LOG_ROOT"
printf '[orchestrator] requested_mode=%s selected_mode=%s\n' "$EXECUTION_MODE" "$SELECTED_MODE"
printf '[orchestrator] policy=%s\n' "$POLICY_JSON"
append_event "orchestrator" "policy-decision" "0" "0"

if [[ "$SELECTED_MODE" == "single" ]]; then
  if [[ "$RUN_PREFLIGHT" -eq 1 ]]; then
    run_role_step "single-agent" "single-agent-preflight" bash "$ROOT_DIR/scripts/multi-agent/preflight-agent.sh" --log-dir "$LOG_ROOT/preflight"
  else
    printf '[orchestrator] skip preflight-agent\n'
  fi

  if [[ "$RUN_GATES" -eq 1 ]]; then
    run_role_step "single-agent" "single-agent-gate-pack" bash -lc "cd '$ROOT_DIR' && pnpm security:guard && REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test && pnpm pr:verify:hosts && pnpm e2e:gate"
  else
    printf '[orchestrator] skip gate lane\n'
  fi
else
  if [[ "$RUN_PREFLIGHT" -eq 1 ]]; then
    run_role_step "preflight-agent" "preflight-agent" bash "$ROOT_DIR/scripts/multi-agent/preflight-agent.sh" --log-dir "$LOG_ROOT/preflight"
  else
    printf '[orchestrator] skip preflight-agent\n'
  fi

  if [[ "$RUN_GATES" -eq 1 ]]; then
    run_role_step "gatekeeper" "gate-security-guard" bash -lc "cd '$ROOT_DIR' && pnpm security:guard"
    run_role_step "gatekeeper" "gate-rls-required" bash -lc "cd '$ROOT_DIR' && REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test"
    run_role_step "gatekeeper" "gate-pr-verify-hosts" bash -lc "cd '$ROOT_DIR' && pnpm pr:verify:hosts"
    run_role_step "gatekeeper" "gate-e2e-gate" bash -lc "cd '$ROOT_DIR' && pnpm e2e:gate"
  else
    printf '[orchestrator] skip gate lane\n'
  fi
fi

if [[ "$RUN_FINALIZER" -eq 1 ]]; then
  finalizer_cmd=(bash "$ROOT_DIR/scripts/multi-agent/finalizer-agent.sh")
  if [[ -n "$PR_REF" ]]; then
    finalizer_cmd+=(--pr "$PR_REF")
  fi
  if [[ "$WATCH_CI" -eq 1 ]]; then
    finalizer_cmd+=(--watch-ci --ci-interval "$CI_INTERVAL")
  fi

  run_role_step "finalizer-agent" "finalizer-agent" "${finalizer_cmd[@]}"
fi

printf '\n[orchestrator] PASS\n'
printf '[orchestrator] logs: %s\n' "$LOG_ROOT"
