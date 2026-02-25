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
RUN_MARKETING=0
RUN_TESTING=0
RUN_FINALIZER=0
WATCH_CI=0
CI_INTERVAL=20
MARKETING_SURFACE="both"
MARKETING_STRICT=0
MARKETING_MIN_SCORE=85
TESTING_RUNS=10
TESTING_SUITE="gate-fast"
TESTING_COMMAND=""
TESTING_STRICT=0
TESTING_REWRITE=0
TESTING_RESET_EACH_RUN=0
EXECUTION_MODE="auto"
TASK_COMPLEXITY="high"
ESTIMATED_COST_USD="0"
BUDGET_USD="5"
TASK_COUNT=1
REQUIRES_BOUNDARY_REVIEW=0
AUTO_RETRY_MAX=3
AUTO_RETRY_ENABLED=1
ENABLE_CDD_CONTEXT=1
REQUIRE_CDD_CONTEXT=0
LAST_STEP_LOG=""
LAST_STEP_STATUS=0
declare -a USER_CONTEXT_FILES=()

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/orchestrator.sh [options]

Enterprise multi-agent entrypoint with explicit lanes:
  - preflight-agent
  - marketing-agent (optional UX/CRO scorecard)
  - testing-agent (optional flaky test audit)
  - gate lane (security/rls/pr-verify-hosts/e2e-gate)
  - finalizer-agent (optional)

Options:
  --pr <number|url|branch>  PR selector for CI monitor/finalizer
  --log-root <path>         Override run log root (default: tmp/multi-agent/run-<UTC>)
  --skip-preflight          Skip preflight lane
  --skip-gates              Skip gate lane
  --marketing               Run marketing-agent lane
  --marketing-surface <member-dashboard|landing-hero|both>  Marketing lane target (default: both)
  --marketing-strict        Fail marketing lane when score is below threshold
  --marketing-min-score <0-100>  Minimum score for --marketing-strict (default: 85)
  --testing                 Run testing-agent lane
  --testing-runs <integer>  Number of repeated test runs for flake detection (default: 10)
  --testing-suite <gate-fast|gate|custom>  Testing lane suite preset (default: gate-fast)
  --testing-command "<cmd>" Custom test command when --testing-suite custom
  --testing-strict          Fail when flaky tests are detected
  --testing-rewrite         Rewrite flaky sleep-based waits to deterministic marker waits
  --testing-reset-each-run  Run m4-gatekeeper before each repeated run
  --finalize                Run finalizer-agent at the end
  --watch-ci                Keep CI monitor running in finalizer mode
  --ci-interval <seconds>   CI watch interval (default: 20)
  --execution-mode <auto|single|multi>     Orchestration mode (default: auto)
  --task-complexity <low|medium|high>      Complexity signal for auto mode (default: high)
  --estimated-cost-usd <number>            Estimated run cost for policy evaluation
  --budget-usd <number>                    Budget cap for policy evaluation (default: 5)
  --task-count <integer>                   Independent task count for policy evaluation
  --requires-boundary-review <bool>        Boundary/security review required (default: false)
  --auto-retry-max <integer>               Verification auto-repair retries per failed step (default: 3)
  --no-auto-retry                          Disable verification auto-repair loop
  --context-file <path>                    Explicit CDD context file (repeatable)
  --require-cdd-context                    Fail if no CDD context artifacts are found
  --no-cdd-context                         Disable CDD context provisioning
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
  LAST_STEP_LOG="$log_file"
  LAST_STEP_STATUS="$cmd_status"
  append_event "$role" "$label" "$cmd_status" "$latency_ms"

  if [[ "$cmd_status" -ne 0 ]]; then
    printf '[orchestrator] step failed: role=%s label=%s status=%s\n' "$role" "$label" "$cmd_status" >&2
    return "$cmd_status"
  fi
}

run_verification_agent() {
  local failed_label="$1"
  local log_file="$2"
  local attempt_number="$3"
  local started_ms
  local ended_ms
  local latency_ms
  local status

  started_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  printf '[orchestrator] [verification-agent] attempt=%s/%s label=%s\n' \
    "$attempt_number" "$AUTO_RETRY_MAX" "$failed_label"
  set +e
  bash "$ROOT_DIR/scripts/multi-agent/verification-agent.sh" \
    --root "$ROOT_DIR" \
    --label "$failed_label" \
    --log-file "$log_file" \
    --attempt "$attempt_number" \
    --max-attempts "$AUTO_RETRY_MAX"
  status=$?
  set -e
  ended_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  latency_ms="$((ended_ms - started_ms))"
  append_event "verification-agent" "auto-repair-${failed_label}" "$status" "$latency_ms"
  return "$status"
}

run_role_step_with_retries() {
  local role="$1"
  local label="$2"
  shift 2
  local -a cmd=("$@")
  local retry_count=0

  while true; do
    local attempt_label="$label"
    if [[ "$retry_count" -gt 0 ]]; then
      attempt_label="$label (retry $retry_count/$AUTO_RETRY_MAX)"
    fi

    if run_role_step "$role" "$attempt_label" "${cmd[@]}"; then
      return 0
    fi

    if [[ "$AUTO_RETRY_ENABLED" -eq 0 ]]; then
      printf '[orchestrator] auto-retry disabled; escalating failure to human owner\n' >&2
      return "$LAST_STEP_STATUS"
    fi

    if [[ "$retry_count" -ge "$AUTO_RETRY_MAX" ]]; then
      printf '[orchestrator] auto-retry exhausted after %s attempts; escalating failure to human owner\n' "$AUTO_RETRY_MAX" >&2
      return "$LAST_STEP_STATUS"
    fi

    local next_attempt
    next_attempt=$((retry_count + 1))
    if run_verification_agent "$label" "$LAST_STEP_LOG" "$next_attempt"; then
      retry_count="$next_attempt"
      continue
    fi

    local remediation_status=$?
    if [[ "$remediation_status" -eq 3 ]]; then
      printf '[orchestrator] verification-agent found no deterministic remediation; escalating failure to human owner\n' >&2
      return "$LAST_STEP_STATUS"
    fi

    printf '[orchestrator] verification-agent failed with status=%s; escalating failure to human owner\n' "$remediation_status" >&2
    return "$LAST_STEP_STATUS"
  done
}

build_cdd_context_bundle() {
  if [[ "$ENABLE_CDD_CONTEXT" -ne 1 ]]; then
    printf '[orchestrator] cdd-context disabled\n'
    append_event "context-agent" "cdd-context-disabled" "0" "0"
    return 0
  fi

  local -a candidates=()
  local -a found_files=()
  local context_bundle

  if [[ "${#USER_CONTEXT_FILES[@]}" -gt 0 ]]; then
    candidates=("${USER_CONTEXT_FILES[@]}")
  else
    candidates=(
      "$ROOT_DIR/product.md"
      "$ROOT_DIR/tech-stack.md"
      "$ROOT_DIR/workflow.md"
      "$ROOT_DIR/context/product.md"
      "$ROOT_DIR/context/tech-stack.md"
      "$ROOT_DIR/context/workflow.md"
      "$ROOT_DIR/docs/context/product.md"
      "$ROOT_DIR/docs/context/tech-stack.md"
      "$ROOT_DIR/docs/context/workflow.md"
    )
  fi

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      found_files+=("$candidate")
    fi
  done

  if [[ "${#found_files[@]}" -eq 0 ]]; then
    if [[ "$REQUIRE_CDD_CONTEXT" -eq 1 ]]; then
      fail 'CDD context required but no context files were found'
    fi
    printf '[orchestrator] cdd-context not found; continuing without context bundle\n'
    append_event "context-agent" "cdd-context-missing" "3" "0"
    return 0
  fi

  context_bundle="$LOG_ROOT/context-bundle.md"
  {
    printf '# Multi-Agent Context Bundle\n\n'
    printf 'Generated: %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    local context_file
    for context_file in "${found_files[@]}"; do
      printf '## %s\n\n' "$context_file"
      cat "$context_file"
      printf '\n\n'
    done
  } >"$context_bundle"

  export MULTI_AGENT_CONTEXT_BUNDLE="$context_bundle"
  export MULTI_AGENT_CONTEXT_FILES="$(IFS=,; printf '%s' "${found_files[*]}")"
  printf '[orchestrator] cdd-context-bundle=%s\n' "$MULTI_AGENT_CONTEXT_BUNDLE"
  printf '[orchestrator] cdd-context-files=%s\n' "$MULTI_AGENT_CONTEXT_FILES"
  append_event "context-agent" "cdd-context-ready" "0" "0"
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
    --marketing)
      RUN_MARKETING=1
      shift
      ;;
    --marketing-surface)
      [[ $# -ge 2 ]] || fail 'missing value for --marketing-surface'
      MARKETING_SURFACE="$2"
      shift 2
      ;;
    --marketing-strict)
      MARKETING_STRICT=1
      shift
      ;;
    --marketing-min-score)
      [[ $# -ge 2 ]] || fail 'missing value for --marketing-min-score'
      MARKETING_MIN_SCORE="$2"
      shift 2
      ;;
    --testing)
      RUN_TESTING=1
      shift
      ;;
    --testing-runs)
      [[ $# -ge 2 ]] || fail 'missing value for --testing-runs'
      TESTING_RUNS="$2"
      shift 2
      ;;
    --testing-suite)
      [[ $# -ge 2 ]] || fail 'missing value for --testing-suite'
      TESTING_SUITE="$2"
      shift 2
      ;;
    --testing-command)
      [[ $# -ge 2 ]] || fail 'missing value for --testing-command'
      TESTING_COMMAND="$2"
      shift 2
      ;;
    --testing-strict)
      TESTING_STRICT=1
      shift
      ;;
    --testing-rewrite)
      TESTING_REWRITE=1
      shift
      ;;
    --testing-reset-each-run)
      TESTING_RESET_EACH_RUN=1
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
    --auto-retry-max)
      [[ $# -ge 2 ]] || fail 'missing value for --auto-retry-max'
      AUTO_RETRY_MAX="$2"
      shift 2
      ;;
    --no-auto-retry)
      AUTO_RETRY_ENABLED=0
      shift
      ;;
    --context-file)
      [[ $# -ge 2 ]] || fail 'missing value for --context-file'
      USER_CONTEXT_FILES+=("$2")
      shift 2
      ;;
    --require-cdd-context)
      REQUIRE_CDD_CONTEXT=1
      shift
      ;;
    --no-cdd-context)
      ENABLE_CDD_CONTEXT=0
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

if ! [[ "$AUTO_RETRY_MAX" =~ ^[0-9]+$ ]]; then
  fail '--auto-retry-max must be a non-negative integer'
fi

if ! [[ "$MARKETING_MIN_SCORE" =~ ^[0-9]+$ ]] || [[ "$MARKETING_MIN_SCORE" -gt 100 ]]; then
  fail '--marketing-min-score must be an integer between 0 and 100'
fi

case "$MARKETING_SURFACE" in
  member-dashboard|landing-hero|both) ;;
  *)
    fail '--marketing-surface must be one of: member-dashboard, landing-hero, both'
    ;;
esac

if ! [[ "$TESTING_RUNS" =~ ^[0-9]+$ ]] || [[ "$TESTING_RUNS" -lt 1 ]]; then
  fail '--testing-runs must be a positive integer'
fi

case "$TESTING_SUITE" in
  gate-fast|gate|custom) ;;
  *)
    fail '--testing-suite must be one of: gate-fast, gate, custom'
    ;;
esac

if [[ "$TESTING_SUITE" == "custom" && -z "$TESTING_COMMAND" ]]; then
  fail '--testing-command is required when --testing-suite custom'
fi

EVENTS_FILE="${LOG_ROOT}/events.ndjson"
ROLE_SCORECARD_FILE="${LOG_ROOT}/role-scorecard.json"
mkdir -p "$LOG_ROOT"
: >"$EVENTS_FILE"
trap materialize_role_metrics EXIT
build_cdd_context_bundle

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
  printf '%s\n' "$POLICY_JSON" | node -e "const fs=require('node:fs'); const policy=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(policy.selectedMode || 'single'));"
)"

printf '[orchestrator] run_id=%s\n' "$RUN_ID"
printf '[orchestrator] log_root=%s\n' "$LOG_ROOT"
printf '[orchestrator] requested_mode=%s selected_mode=%s\n' "$EXECUTION_MODE" "$SELECTED_MODE"
printf '[orchestrator] policy=%s\n' "$POLICY_JSON"
append_event "orchestrator" "policy-decision" "0" "0"

if [[ "$SELECTED_MODE" == "single" ]]; then
  if [[ "$RUN_PREFLIGHT" -eq 1 ]]; then
    run_role_step_with_retries "single-agent" "single-agent-preflight" bash "$ROOT_DIR/scripts/multi-agent/preflight-agent.sh" --log-dir "$LOG_ROOT/preflight"
  else
    printf '[orchestrator] skip preflight-agent\n'
  fi

  if [[ "$RUN_GATES" -eq 1 ]]; then
    run_role_step_with_retries "single-agent" "single-agent-gate-pack" bash -lc "cd '$ROOT_DIR' && pnpm security:guard && REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test && pnpm pr:verify:hosts && pnpm e2e:gate"
  else
    printf '[orchestrator] skip gate lane\n'
  fi

  if [[ "$RUN_MARKETING" -eq 1 ]]; then
    marketing_cmd=(bash "$ROOT_DIR/scripts/multi-agent/marketing-agent.sh" --log-dir "$LOG_ROOT/marketing" --surface "$MARKETING_SURFACE" --min-score "$MARKETING_MIN_SCORE")
    if [[ "$MARKETING_STRICT" -eq 1 ]]; then
      marketing_cmd+=(--strict)
    fi
    run_role_step_with_retries "single-agent" "single-agent-marketing" "${marketing_cmd[@]}"
  else
    printf '[orchestrator] skip marketing-agent\n'
  fi

  if [[ "$RUN_TESTING" -eq 1 ]]; then
    testing_cmd=(bash "$ROOT_DIR/scripts/multi-agent/testing-agent.sh" --log-dir "$LOG_ROOT/testing" --runs "$TESTING_RUNS" --suite "$TESTING_SUITE")
    if [[ "$TESTING_SUITE" == "custom" ]]; then
      testing_cmd+=(--command "$TESTING_COMMAND")
    fi
    if [[ "$TESTING_STRICT" -eq 1 ]]; then
      testing_cmd+=(--strict)
    fi
    if [[ "$TESTING_REWRITE" -eq 1 ]]; then
      testing_cmd+=(--rewrite-deterministic)
    fi
    if [[ "$TESTING_RESET_EACH_RUN" -eq 1 ]]; then
      testing_cmd+=(--reset-each-run)
    fi
    run_role_step_with_retries "single-agent" "single-agent-testing" "${testing_cmd[@]}"
  else
    printf '[orchestrator] skip testing-agent\n'
  fi
else
  if [[ "$RUN_PREFLIGHT" -eq 1 ]]; then
    run_role_step_with_retries "preflight-agent" "preflight-agent" bash "$ROOT_DIR/scripts/multi-agent/preflight-agent.sh" --log-dir "$LOG_ROOT/preflight"
  else
    printf '[orchestrator] skip preflight-agent\n'
  fi

  if [[ "$RUN_GATES" -eq 1 ]]; then
    run_role_step_with_retries "gatekeeper" "gate-security-guard" bash -lc "cd '$ROOT_DIR' && pnpm security:guard"
    run_role_step_with_retries "gatekeeper" "gate-rls-required" bash -lc "cd '$ROOT_DIR' && REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test"
    run_role_step_with_retries "gatekeeper" "gate-pr-verify-hosts" bash -lc "cd '$ROOT_DIR' && pnpm pr:verify:hosts"
    run_role_step_with_retries "gatekeeper" "gate-e2e-gate" bash -lc "cd '$ROOT_DIR' && pnpm e2e:gate"
  else
    printf '[orchestrator] skip gate lane\n'
  fi

  if [[ "$RUN_MARKETING" -eq 1 ]]; then
    marketing_cmd=(bash "$ROOT_DIR/scripts/multi-agent/marketing-agent.sh" --log-dir "$LOG_ROOT/marketing" --surface "$MARKETING_SURFACE" --min-score "$MARKETING_MIN_SCORE")
    if [[ "$MARKETING_STRICT" -eq 1 ]]; then
      marketing_cmd+=(--strict)
    fi
    run_role_step_with_retries "marketing-agent" "marketing-agent" "${marketing_cmd[@]}"
  else
    printf '[orchestrator] skip marketing-agent\n'
  fi

  if [[ "$RUN_TESTING" -eq 1 ]]; then
    testing_cmd=(bash "$ROOT_DIR/scripts/multi-agent/testing-agent.sh" --log-dir "$LOG_ROOT/testing" --runs "$TESTING_RUNS" --suite "$TESTING_SUITE")
    if [[ "$TESTING_SUITE" == "custom" ]]; then
      testing_cmd+=(--command "$TESTING_COMMAND")
    fi
    if [[ "$TESTING_STRICT" -eq 1 ]]; then
      testing_cmd+=(--strict)
    fi
    if [[ "$TESTING_REWRITE" -eq 1 ]]; then
      testing_cmd+=(--rewrite-deterministic)
    fi
    if [[ "$TESTING_RESET_EACH_RUN" -eq 1 ]]; then
      testing_cmd+=(--reset-each-run)
    fi
    run_role_step_with_retries "testing-agent" "testing-agent" "${testing_cmd[@]}"
  else
    printf '[orchestrator] skip testing-agent\n'
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

  run_role_step_with_retries "finalizer-agent" "finalizer-agent" "${finalizer_cmd[@]}"
fi

printf '\n[orchestrator] PASS\n'
printf '[orchestrator] logs: %s\n' "$LOG_ROOT"
