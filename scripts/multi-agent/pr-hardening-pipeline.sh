#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

RUN_ID="pr-hardening-$(date -u +%Y%m%dT%H%M%SZ)-$(random_suffix)"
RUN_ROOT=""
RUN_ROOT_REL=""
PR_REF=""
RUN_FINALIZER=0
WATCH_CI=0
CI_INTERVAL=20
ALLOW_NODE_BYPASS=0
DRY_RUN=0
AUTO_REMEDIATE=1
MAX_REMEDIATION_ATTEMPTS=2
PUBLISH_SCRIBE_PR_COMMENT=1
MARKETING_STRICT=0
MARKETING_MIN_SCORE=85
AGENT_TIMEOUT_SECONDS=900

BASE_COMMIT=""
MAIN_COUNT=0
ORIGIN_COUNT=0
AUTHORITATIVE_COUNT=0
UI_TOUCHED="no"
MARKETING_TOUCHED="no"
RISK_CLASS="normal"

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/pr-hardening-pipeline.sh [options]

Options:
  --run-id <id>                    Override run id (default: pr-hardening-<UTC>)
  --pr <number|url|branch>         PR selector for optional finalizer + scribe PR comment
  --finalize                       Run finalizer-agent after scribe pass
  --watch-ci                       Keep CI monitor running in finalizer mode
  --ci-interval <seconds>          CI watch interval (default: 20)
  --allow-node-bypass              Explicitly allow bypassing node guard (sets SKIP_NODE_GUARD=1)
  --dry-run                        Prepare manifest/contracts/dispatch plan, then exit (no agents)
  --no-auto-remediate              Disable automatic remediation loop on NO-GO
  --max-remediation-attempts <n>   Maximum remediation loops (default: 2)
  --no-publish-scribe-pr-comment   Disable scribe PR comment publishing
  --marketing-strict               Fail marketing lane when score < --marketing-min-score
  --marketing-min-score <0-100>    Minimum score for strict marketing lane (default: 85)
  --agent-timeout-seconds <n>      Max wall-clock runtime per role before forced timeout (default: 900)
  -h, --help                       Show this help
USAGE
}

fail() {
  printf '[pr-hardening-pipeline] FAIL: %s\n' "$1" >&2
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "fail" "error" "0" "$1"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-id)
      [[ $# -ge 2 ]] || fail 'missing value for --run-id'
      RUN_ID="$2"
      shift 2
      ;;
    --pr)
      [[ $# -ge 2 ]] || fail 'missing value for --pr'
      PR_REF="$2"
      shift 2
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
    --allow-node-bypass)
      ALLOW_NODE_BYPASS=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --no-auto-remediate)
      AUTO_REMEDIATE=0
      shift
      ;;
    --max-remediation-attempts)
      [[ $# -ge 2 ]] || fail 'missing value for --max-remediation-attempts'
      MAX_REMEDIATION_ATTEMPTS="$2"
      shift 2
      ;;
    --no-publish-scribe-pr-comment)
      PUBLISH_SCRIBE_PR_COMMENT=0
      shift
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
    --agent-timeout-seconds)
      [[ $# -ge 2 ]] || fail 'missing value for --agent-timeout-seconds'
      AGENT_TIMEOUT_SECONDS="$2"
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

if ! [[ "$MAX_REMEDIATION_ATTEMPTS" =~ ^[0-9]+$ ]]; then
  fail '--max-remediation-attempts must be a non-negative integer'
fi

if ! [[ "$MARKETING_MIN_SCORE" =~ ^[0-9]+$ ]] || [[ "$MARKETING_MIN_SCORE" -gt 100 ]]; then
  fail '--marketing-min-score must be an integer between 0 and 100'
fi

if ! [[ "$AGENT_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || [[ "$AGENT_TIMEOUT_SECONDS" -lt 1 ]]; then
  fail '--agent-timeout-seconds must be a positive integer'
fi

RUN_ROOT="$ROOT_DIR/tmp/multi-agent/master/$RUN_ID"
RUN_ROOT_REL="tmp/multi-agent/master/$RUN_ID"
mkdir -p "$RUN_ROOT/evidence" "$RUN_ROOT/prompts" "$RUN_ROOT/remediation"

publish_ci_outputs() {
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "pr_hardening_run_id=$RUN_ID"
      echo "pr_hardening_run_root=$RUN_ROOT"
    } >>"$GITHUB_OUTPUT"
  fi

  if [[ -n "${GITHUB_ENV:-}" ]]; then
    {
      echo "PR_HARDENING_RUN_ID=$RUN_ID"
      echo "PR_HARDENING_RUN_ROOT=$RUN_ROOT"
    } >>"$GITHUB_ENV"
  fi
}

publish_ci_outputs

normalize_environment() {
  assert_node_bypass_policy "pr-hardening-pipeline" "$ALLOW_NODE_BYPASS"

  if [[ "${ALLOW_NODE_BYPASS}" -eq 1 ]]; then
    export SKIP_NODE_GUARD=1
    printf '[pr-hardening-pipeline] node-guard bypass explicitly enabled\n'
  fi

  if [[ "${SKIP_NODE_GUARD:-}" != "1" ]]; then
    bash "$ROOT_DIR/scripts/node-guard.sh"
  else
    printf '[pr-hardening-pipeline] SKIP_NODE_GUARD=1 (explicit bypass)\n'
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    printf '[pr-hardening-pipeline] DATABASE_URL not set; defaulted to local deterministic URL\n'
  fi
}

bootstrap_scope() {
  git -C "$ROOT_DIR" fetch origin --prune >/dev/null 2>&1 || true

  BASE_COMMIT="$(git -C "$ROOT_DIR" merge-base HEAD origin/main)"
  MAIN_COUNT="$(git -C "$ROOT_DIR" diff --name-only main...HEAD | wc -l | tr -d ' ')"
  ORIGIN_COUNT="$(git -C "$ROOT_DIR" diff --name-only origin/main...HEAD | wc -l | tr -d ' ')"
  AUTHORITATIVE_COUNT="$(git -C "$ROOT_DIR" diff --name-only "$BASE_COMMIT"...HEAD | wc -l | tr -d ' ')"

  if git -C "$ROOT_DIR" diff --name-only "$BASE_COMMIT"...HEAD | rg -q '^apps/web/src/(app|components|features)/'; then
    UI_TOUCHED="yes"
  fi

  if git -C "$ROOT_DIR" diff --name-only "$BASE_COMMIT"...HEAD \
    | rg -q '(^apps/web/src/app/\[locale\]/page\.tsx$|^apps/web/src/app/\[locale\]/components/home/|^apps/web/src/components/dashboard/member-dashboard-v2\.tsx$|^apps/web/src/messages/|seo|sitemap|robots\.txt|funnel|marketing)'; then
    MARKETING_TOUCHED="yes"
  fi

  if [[ "$MAIN_COUNT" -eq 0 && "$ORIGIN_COUNT" -gt 0 ]]; then
    RISK_CLASS="boundary"
  fi
}

write_manifest() {
  cat >"$RUN_ROOT/run-manifest.md" <<EOF
# A22 PR Hardening Run Manifest

- run_id: \`$RUN_ID\`
- generated_utc: \`$(iso_utc)\`
- branch: \`$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)\`
- phase: \`A22 / Phase C\`
- execution_mode: \`$( [[ "$DRY_RUN" -eq 1 ]] && printf 'dry-run' || printf 'full' )\`
- merge_gate_scope: \`full-pr-hardening\`
- base_scope_reference: \`main...HEAD\`
- base_scope_file_count: \`$MAIN_COUNT\`
- secondary_scope_reference: \`origin/main...HEAD\`
- secondary_scope_file_count: \`$ORIGIN_COUNT\`
- risk_classification: \`$RISK_CLASS\`
- authoritative_base_ref: \`merge-base(HEAD,origin/main)\`
- authoritative_base_commit: \`$BASE_COMMIT\`
- authoritative_changed_file_count: \`$AUTHORITATIVE_COUNT\`
- ui_touched: \`$UI_TOUCHED\`
- marketing_touched: \`$MARKETING_TOUCHED\`
EOF
}

write_contract() {
  local role="$1"
  local objective="$2"
  local extra="$3"
  cat >"$RUN_ROOT/${role}-contract.md" <<EOF
# ${role^} Contract

- run_id: \`$RUN_ID\`
- risk_class: \`$RISK_CLASS\`

## Objective
$objective

## Allowed Paths
- Read-only: entire repository.
- Write-only: \`$RUN_ROOT/evidence/$role/*\`

## Forbidden Paths
- \`apps/web/src/proxy.ts\`
- Any product source edits

## Output Requirements
- one-line status: \`${role^^}_STATUS: PASS\` or \`${role^^}_STATUS: FAIL\`
- machine-readable status file: \`$RUN_ROOT/evidence/$role/$role.status.json\`

$extra
EOF
}

write_prompt() {
  local role="$1"
  cat >"$RUN_ROOT/prompts/${role}.md" <<EOF
# ${role^} Prompt (Copy/Paste)

You are **${role^}** for Interdomestik A22 PR hardening run \`$RUN_ID\`.

Read and execute this contract exactly:
\`$RUN_ROOT/${role}-contract.md\`

Hard constraints:
- Phase C constraints are mandatory.
- \`apps/web/src/proxy.ts\` is read-only.
- No routing/auth/tenant architecture refactors.
- Output status line and status.json are required.
EOF
}

write_dispatch_order() {
  cat >"$RUN_ROOT/dispatch-order.md" <<EOF
# Dispatch Order And Dependencies

1. Wave 1A (parallel): \`atlas\` + \`sentinel\` + \`breaker\`$( [[ "$UI_TOUCHED" == "yes" ]] && printf ' + `pixel`' )$( [[ "$MARKETING_TOUCHED" == "yes" ]] && printf ' + `marketing`' )
2. Wave 1B (blocking): \`forge\` (starts only after \`atlas\` PASS)
3. Wave 2 (blocking): \`gatekeeper\` (blocks on all required Wave 1 status + evidence)
4. Wave 3 (blocking): \`scribe\` (blocks on gatekeeper output)
5. Optional remediation loop: auto-retry via \`verification-agent\` when final recommendation is NO-GO
EOF
}

generate_contracts_and_prompts() {
  write_contract "atlas" \
    "Produce authoritative branch-surface mapping, base alignment, and boundary-risk recommendation." \
    "- write: base-alignment, base-reconcile, path-sensitivity, risk recommendation"
  write_contract "forge" \
    "Run functional verification stack for release hardening." \
    "- run: pnpm test:release-gate, pnpm check:fast, pnpm pr:verify"
  write_contract "sentinel" \
    "Run security/policy scans and sensitive path checks." \
    "- run: pnpm security:guard + secret/path scans"
  write_contract "breaker" \
    "Stress release-gate change surface for fragility and regression risk." \
    "- run: diff/help/test/pattern scans for scripts/release-gate/*"
  write_contract "gatekeeper" \
    "Run mandatory gates and issue final GO/NO-GO verdict." \
    "- run: pnpm pr:verify, pnpm security:guard, pnpm e2e:gate"
  write_contract "scribe" \
    "Synthesize commander-ready summary from all evidence artifacts." \
    "- write: executive-summary, findings-register, decision-log"

  write_prompt "atlas"
  write_prompt "forge"
  write_prompt "sentinel"
  write_prompt "breaker"
  write_prompt "gatekeeper"
  write_prompt "scribe"

  if [[ "$UI_TOUCHED" == "yes" ]]; then
    write_contract "pixel" \
      "Audit UI touched paths for clarity markers, accessibility and visual-risk notes." \
      "- run: UI changed-path inventory + marker/a11y scans"
    write_prompt "pixel"
  fi

  if [[ "$MARKETING_TOUCHED" == "yes" ]]; then
    write_contract "marketing" \
      "Run deterministic marketing/SEO/CRO audits for touched growth surfaces." \
      "- run: scripts/multi-agent/marketing-agent.sh in run-root mode with scorecard output"
    write_prompt "marketing"
  fi

  write_dispatch_order
}

capture_tracked_paths() {
  {
    git -C "$ROOT_DIR" diff --name-only
    git -C "$ROOT_DIR" diff --name-only --cached
  } | sed '/^$/d' | sort -u
}

capture_untracked_paths() {
  git -C "$ROOT_DIR" ls-files --others --exclude-standard | sed '/^$/d' | sort -u
}

file_sha256_or_missing() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    printf 'MISSING'
    return 0
  fi

  shasum -a 256 "$path" | awk '{print $1}'
}

assert_required_agent_scripts() {
  local -a roles=("atlas" "sentinel" "breaker" "forge" "gatekeeper" "scribe")
  if [[ "$UI_TOUCHED" == "yes" ]]; then
    roles+=("pixel")
  fi
  if [[ "$MARKETING_TOUCHED" == "yes" ]]; then
    roles+=("marketing")
  fi

  local -a missing=()
  local role
  for role in "${roles[@]}"; do
    local script="$ROOT_DIR/scripts/multi-agent/${role}-agent.sh"
    if [[ ! -x "$script" ]]; then
      missing+=("${role}-agent.sh")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    fail "agent script missing or not executable: ${missing[*]}"
  fi
}

enforce_role_contract_writes() {
  local role="$1"
  local tracked_before_file="$2"
  local untracked_before_file="$3"
  local proxy_hash_before="$4"
  local contract_report="$RUN_ROOT/evidence/$role/${role}.contract-enforcement.md"

  local tracked_after_file
  local untracked_after_file
  local tracked_delta_file
  local untracked_delta_file
  tracked_after_file="$(mktemp)"
  untracked_after_file="$(mktemp)"
  tracked_delta_file="$(mktemp)"
  untracked_delta_file="$(mktemp)"

  capture_tracked_paths >"$tracked_after_file"
  capture_untracked_paths >"$untracked_after_file"
  comm -13 "$tracked_before_file" "$tracked_after_file" >"$tracked_delta_file" || true
  comm -13 "$untracked_before_file" "$untracked_after_file" >"$untracked_delta_file" || true

  local proxy_hash_after
  proxy_hash_after="$(file_sha256_or_missing "$ROOT_DIR/apps/web/src/proxy.ts")"

  local -a violations=()
  declare -A seen=()
  local path

  add_violation() {
    local candidate="$1"
    if [[ -n "${seen[$candidate]:-}" ]]; then
      return 0
    fi
    seen["$candidate"]=1
    violations+=("$candidate")
  }

  if [[ "$proxy_hash_before" != "$proxy_hash_after" ]]; then
    add_violation "apps/web/src/proxy.ts"
  fi

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if [[ "$path" == "$RUN_ROOT_REL/"* ]]; then
      continue
    fi
    add_violation "$path"
  done <"$tracked_delta_file"

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if [[ "$path" == "apps/web/src/proxy.ts" ]]; then
      add_violation "$path"
      continue
    fi
    if [[ "$path" == apps/*/src/* || "$path" == apps/*/app/* || "$path" == packages/*/src/* ]]; then
      add_violation "$path"
    fi
  done <"$untracked_delta_file"

  if [[ "${#violations[@]}" -eq 0 ]]; then
    cat >"$contract_report" <<EOF
# Contract Enforcement

- role: \`$role\`
- status: \`PASS\`
- checked_utc: \`$(iso_utc)\`
- tracked_delta_count: \`$(wc -l <"$tracked_delta_file" | tr -d ' ')\`
- untracked_delta_count: \`$(wc -l <"$untracked_delta_file" | tr -d ' ')\`
- forbidden_path_violations: \`0\`
EOF
    rm -f "$tracked_after_file" "$untracked_after_file" "$tracked_delta_file" "$untracked_delta_file"
    return 0
  fi

  {
    echo "# Contract Enforcement"
    echo
    echo "- role: \`$role\`"
    echo "- status: \`FAIL\`"
    echo "- checked_utc: \`$(iso_utc)\`"
    echo "- forbidden_path_violations: \`${#violations[@]}\`"
    echo
    echo "## Violations"
    local violation
    for violation in "${violations[@]}"; do
      echo "- \`$violation\`"
    done
  } >"$contract_report"

  local details
  details="forbidden path write(s): ${violations[*]}"
  write_role_status "$role" "$RUN_ROOT" "FAIL" "contract-forbidden-path-write" "$details"
  rm -f "$tracked_after_file" "$untracked_after_file" "$tracked_delta_file" "$untracked_delta_file"
  return 65
}

run_role() {
  local role="$1"
  local script="$2"
  shift 2
  local log_file="$RUN_ROOT/evidence/$role/${role}.orchestrator.log"
  local timeout_file="$RUN_ROOT/evidence/$role/${role}.timeout"
  local started_ms ended_ms latency_ms
  local tracked_before_file="$RUN_ROOT/evidence/$role/${role}.tracked.before"
  local untracked_before_file="$RUN_ROOT/evidence/$role/${role}.untracked.before"
  local proxy_hash_before=""
  local contract_rc=0
  local final_status=0
  mkdir -p "$(dirname "$log_file")"
  rm -f "$timeout_file"
  capture_tracked_paths >"$tracked_before_file"
  capture_untracked_paths >"$untracked_before_file"
  proxy_hash_before="$(file_sha256_or_missing "$ROOT_DIR/apps/web/src/proxy.ts")"

  started_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "$role" "start" "started" "0" "$script"

  set +e
  (
    set -o pipefail
    node -e '
const { spawn } = require("node:child_process");
const timeoutSeconds = Number(process.argv[1]);
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  process.stderr.write("[timeout-wrapper] invalid timeout\n");
  process.exit(2);
}
const cmd = process.argv[2];
const args = process.argv.slice(3);
const child = spawn(cmd, args, { stdio: "inherit" });
let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 5000);
}, timeoutSeconds * 1000);

child.on("exit", code => {
  clearTimeout(timeout);
  if (timedOut) process.exit(124);
  if (typeof code === "number") process.exit(code);
  process.exit(1);
});
' "$AGENT_TIMEOUT_SECONDS" bash "$ROOT_DIR/scripts/multi-agent/$script" --run-root "$RUN_ROOT" "$@" \
      2>&1 | redact_stream | tee "$log_file"
    exit "${PIPESTATUS[0]}"
  )
  local status=$?
  set -e
  ended_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  latency_ms="$((ended_ms - started_ms))"
  final_status="$status"

  if [[ "$status" -eq 124 ]]; then
    printf 'timed_out_after=%s\n' "$AGENT_TIMEOUT_SECONDS" >"$timeout_file"
    write_role_status "$role" "$RUN_ROOT" "FAIL" "timeout after ${AGENT_TIMEOUT_SECONDS}s" "orchestrator timeout"
    final_status=124
  fi

  if ! enforce_role_contract_writes "$role" "$tracked_before_file" "$untracked_before_file" "$proxy_hash_before"; then
    contract_rc=$?
    if [[ "$final_status" -eq 0 ]]; then
      final_status="$contract_rc"
    fi
    emit_trace_event "$RUN_ROOT" "$RUN_ID" "$role" "contract-enforcement" "fail" "$latency_ms" "forbidden path write"
  fi

  if [[ "$status" -eq 124 ]]; then
    emit_trace_event "$RUN_ROOT" "$RUN_ID" "$role" "end" "timeout" "$latency_ms" "timeout_seconds=$AGENT_TIMEOUT_SECONDS"
    return "$final_status"
  fi

  emit_trace_event "$RUN_ROOT" "$RUN_ID" "$role" "end" "$final_status" "$latency_ms" "$script"
  return "$final_status"
}

read_role_status() {
  local role="$1"
  local status_file="$RUN_ROOT/evidence/$role/${role}.status"
  if [[ ! -f "$status_file" ]]; then
    printf 'MISSING'
    return 0
  fi
  cat "$status_file"
}

read_gatekeeper_verdict() {
  local verdict_file="$RUN_ROOT/evidence/gatekeeper/gatekeeper-verdict.md"
  if [[ ! -f "$verdict_file" ]]; then
    printf 'MISSING'
    return 0
  fi
  if rg -q '^- final_verdict: `GO`$' "$verdict_file"; then
    printf 'GO'
  else
    printf 'NO-GO'
  fi
}

read_scribe_recommendation() {
  local decision_file="$RUN_ROOT/evidence/scribe/decision-log.md"
  if [[ ! -f "$decision_file" ]]; then
    printf 'MISSING'
    return 0
  fi
  rg --no-line-number "^- final_recommendation: " "$decision_file" \
    | sed -E 's/^- final_recommendation: `([^`]+)`$/\1/' \
    | tail -n 1
}

assert_roles_pass() {
  local -a roles=("$@")
  local failures=0
  local role
  for role in "${roles[@]}"; do
    local status_file="$RUN_ROOT/evidence/$role/${role}.status"
    local status_json="$RUN_ROOT/evidence/$role/${role}.status.json"
    if [[ ! -f "$status_file" || ! -f "$status_json" ]]; then
      failures=$((failures + 1))
      continue
    fi
    if [[ "$(cat "$status_file")" != "PASS" ]]; then
      failures=$((failures + 1))
    fi
  done

  if [[ "$failures" -gt 0 ]]; then
    fail "role contract failures detected: $failures role(s)"
  fi
}

run_roles_parallel() {
  local -a roles=("$@")
  declare -A pid_to_role=()
  declare -A role_fail_reasons=()
  local role
  for role in "${roles[@]}"; do
    local script="${role}-agent.sh"
    if [[ "$role" == "marketing" ]]; then
      (
        if [[ "$MARKETING_STRICT" -eq 1 ]]; then
          run_role "$role" "$script" --surface both --strict --min-score "$MARKETING_MIN_SCORE"
        else
          run_role "$role" "$script" --surface both --min-score "$MARKETING_MIN_SCORE"
        fi
      ) &
    else
      (
        run_role "$role" "$script"
      ) &
    fi
    pid_to_role["$!"]="$role"
  done

  local failures=0
  local -a failed_roles=()
  local pid
  for pid in "${!pid_to_role[@]}"; do
    if ! wait "$pid"; then
      failures=$((failures + 1))
      role="${pid_to_role[$pid]}"
      failed_roles+=("$role")
      status_file="$RUN_ROOT/evidence/$role/${role}.status"
      timeout_file="$RUN_ROOT/evidence/$role/${role}.timeout"
      if [[ -f "$timeout_file" ]]; then
        role_fail_reasons["$role"]="timeout"
      elif [[ -f "$status_file" ]]; then
        role_fail_reasons["$role"]="status=$(cat "$status_file")"
      else
        role_fail_reasons["$role"]="missing-status"
      fi
    fi
  done

  if [[ "$failures" -gt 0 ]]; then
    local -a failure_details=()
    for role in "${failed_roles[@]}"; do
      failure_details+=("$role(${role_fail_reasons[$role]:-unknown})")
    done
    fail "parallel wave failures: ${failure_details[*]}"
  fi
}

run_blocking_role() {
  local role="$1"
  local script="$2"
  shift 2

  run_role "$role" "$script" "$@"

  local status_file="$RUN_ROOT/evidence/$role/${role}.status"
  local status_json="$RUN_ROOT/evidence/$role/${role}.status.json"

  [[ -f "$status_file" ]] || fail "$role did not write status file"
  [[ -f "$status_json" ]] || fail "$role did not write status.json"
  [[ "$(cat "$status_file")" == "PASS" ]] || fail "$role reported FAIL"
}

run_wave1_phased() {
  local -a wave1a_roles=("atlas" "sentinel" "breaker")
  if [[ "$UI_TOUCHED" == "yes" ]]; then
    wave1a_roles+=("pixel")
  fi
  if [[ "$MARKETING_TOUCHED" == "yes" ]]; then
    wave1a_roles+=("marketing")
  fi

  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "wave1a-start" "started" "0" "${wave1a_roles[*]}"
  run_roles_parallel "${wave1a_roles[@]}"
  assert_roles_pass "${wave1a_roles[@]}"
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "wave1a-end" "pass" "0" "${wave1a_roles[*]}"

  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "wave1b-start" "started" "0" "forge"
  run_blocking_role "forge" "forge-agent.sh"
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "wave1b-end" "pass" "0" "forge"
}

run_gatekeeper_and_scribe_nonblocking() {
  local -a scribe_args=()
  if [[ "$PUBLISH_SCRIBE_PR_COMMENT" -eq 1 && -n "$PR_REF" ]]; then
    scribe_args+=(--publish-pr-comment)
    scribe_args+=(--pr "$PR_REF")
  fi

  set +e
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "wave2-start" "started" "0" "gatekeeper"
  run_role "gatekeeper" "gatekeeper-agent.sh"
  local gate_rc=$?
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "wave2-end" "$gate_rc" "0" "gatekeeper"
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "wave3-start" "started" "0" "scribe"
  run_role "scribe" "scribe-agent.sh" "${scribe_args[@]}"
  local scribe_rc=$?
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "wave3-end" "$scribe_rc" "0" "scribe"
  set -e

  local gate_status
  local gate_verdict
  local scribe_status
  local scribe_recommendation
  gate_status="$(read_role_status gatekeeper)"
  gate_verdict="$(read_gatekeeper_verdict)"
  scribe_status="$(read_role_status scribe)"
  scribe_recommendation="$(read_scribe_recommendation)"

  {
    echo "# Cycle Verdict"
    echo
    echo "- gatekeeper_rc: \`$gate_rc\`"
    echo "- gatekeeper_status: \`$gate_status\`"
    echo "- gatekeeper_verdict: \`$gate_verdict\`"
    echo "- scribe_rc: \`$scribe_rc\`"
    echo "- scribe_status: \`$scribe_status\`"
    echo "- scribe_recommendation: \`$scribe_recommendation\`"
  } >"$RUN_ROOT/evidence/scribe/cycle-verdict.md"

  if [[ "$gate_status" == "PASS" && "$gate_verdict" == "GO" && "$scribe_status" == "PASS" ]]; then
    if [[ "$scribe_recommendation" == GO* ]]; then
      return 0
    fi
  fi
  return 1
}

run_remediation_attempt() {
  local attempt="$1"
  local attempt_dir="$RUN_ROOT/remediation/attempt-$attempt"
  mkdir -p "$attempt_dir"

  local log_file="$RUN_ROOT/evidence/scribe/scribe.orchestrator.log"
  if [[ ! -f "$log_file" ]]; then
    log_file="$RUN_ROOT/evidence/gatekeeper/gatekeeper.orchestrator.log"
  fi
  if [[ ! -f "$log_file" ]]; then
    fail "no remediation source log found for attempt $attempt"
  fi

  printf '[pr-hardening-pipeline] remediation attempt %s/%s\n' "$attempt" "$MAX_REMEDIATION_ATTEMPTS"
  printf '[pr-hardening-pipeline] remediation source log: %s\n' "$log_file"
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "remediation-start" "started" "0" "attempt=$attempt"

  local -a remediation_cmd=(
    bash "$ROOT_DIR/scripts/multi-agent/verification-agent.sh"
    --root "$ROOT_DIR" \
    --label "pr-hardening-remediation-$attempt" \
    --log-file "$log_file" \
    --attempt "$attempt" \
    --max-attempts "$MAX_REMEDIATION_ATTEMPTS"
  )
  if [[ "$attempt" -gt 1 ]]; then
    remediation_cmd+=(--previous-attempt-dir "$RUN_ROOT/remediation/attempt-$((attempt - 1))")
  fi

  set +e
  "${remediation_cmd[@]}" >"$attempt_dir/verification-agent.log" 2>&1
  local remediation_rc=$?
  set -e

  if [[ "$remediation_rc" -eq 0 ]]; then
    printf 'status=applied\n' >"$attempt_dir/remediation.status"
    emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "remediation-end" "applied" "0" "attempt=$attempt"
    return 0
  fi

  if [[ "$remediation_rc" -eq 3 ]]; then
    printf 'status=no-deterministic-remediation\n' >"$attempt_dir/remediation.status"
    cat >"$attempt_dir/generative-remediation-prompt.md" <<EOF
# Generative Remediation Request

Run ID: \`$RUN_ID\`
Attempt: \`$attempt\`
Source log: \`$log_file\`

## Context files
- \`$RUN_ROOT/evidence/gatekeeper/gatekeeper-verdict.md\`
- \`$RUN_ROOT/evidence/scribe/executive-summary.md\`
- \`$RUN_ROOT/evidence/scribe/findings-register.md\`
- \`$RUN_ROOT/evidence/scribe/decision-log.md\`

## Task
Produce a minimal, deterministic code fix plan and patch set that can move this run from NO-GO to GO.
Prioritize failing gate steps and preserve hard constraints (no proxy.ts edits, no auth/tenant architecture refactors).
EOF
    emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "remediation-end" "no-deterministic-remediation" "0" "attempt=$attempt"
    return 3
  fi

  printf 'status=failed\n' >"$attempt_dir/remediation.status"
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "remediation-end" "failed" "0" "attempt=$attempt rc=$remediation_rc"
  return "$remediation_rc"
}

write_dry_run_plan() {
  cat >"$RUN_ROOT/dry-run-plan.md" <<EOF
# PR Hardening Dry Run Plan

- run_id: \`$RUN_ID\`
- run_root: \`$RUN_ROOT\`
- generated_utc: \`$(iso_utc)\`
- risk_classification: \`$RISK_CLASS\`
- ui_touched: \`$UI_TOUCHED\`
- marketing_touched: \`$MARKETING_TOUCHED\`

## Contracts
- atlas, forge, sentinel, breaker, gatekeeper, scribe$( [[ "$UI_TOUCHED" == "yes" ]] && printf ', pixel' )$( [[ "$MARKETING_TOUCHED" == "yes" ]] && printf ', marketing' )

## Dispatch
$(cat "$RUN_ROOT/dispatch-order.md")
EOF
}

run_pipeline() {
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "start" "started" "0" "pr-hardening"
  normalize_environment
  local bootstrap_started bootstrap_ended bootstrap_latency
  bootstrap_started="$(node -e 'process.stdout.write(String(Date.now()))')"
  bootstrap_scope
  write_manifest
  generate_contracts_and_prompts
  assert_required_agent_scripts
  bootstrap_ended="$(node -e 'process.stdout.write(String(Date.now()))')"
  bootstrap_latency="$((bootstrap_ended - bootstrap_started))"
  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "bootstrap-end" "pass" "$bootstrap_latency" "manifest/contracts/prompts ready"

  printf '[pr-hardening-pipeline] run_id=%s\n' "$RUN_ID"
  printf '[pr-hardening-pipeline] run_root=%s\n' "$RUN_ROOT"
  printf '[pr-hardening-pipeline] risk_class=%s ui_touched=%s marketing_touched=%s\n' "$RISK_CLASS" "$UI_TOUCHED" "$MARKETING_TOUCHED"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    write_dry_run_plan
    printf '[pr-hardening-pipeline] DRY RUN: prepared artifacts only (no agents executed)\n'
    printf '[pr-hardening-pipeline] dispatch plan:\n'
    cat "$RUN_ROOT/dispatch-order.md"
    emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "dry-run" "pass" "0" "no agents executed"
    validate_trace_ndjson_file "$RUN_ROOT/trace.ndjson"
    return 0
  fi

  local attempt=0
  while true; do
    run_wave1_phased

    if run_gatekeeper_and_scribe_nonblocking; then
      break
    fi

    if [[ "$AUTO_REMEDIATE" -ne 1 ]]; then
      fail 'pipeline ended NO-GO and auto-remediation is disabled'
    fi

    if [[ "$attempt" -ge "$MAX_REMEDIATION_ATTEMPTS" ]]; then
      fail "pipeline remained NO-GO after $MAX_REMEDIATION_ATTEMPTS remediation attempt(s)"
    fi

    attempt=$((attempt + 1))
    set +e
    run_remediation_attempt "$attempt"
    remediation_rc=$?
    set -e

    if [[ "$remediation_rc" -eq 0 ]]; then
      continue
    fi

    if [[ "$remediation_rc" -eq 3 ]]; then
      fail "no deterministic remediation found; see $RUN_ROOT/remediation/attempt-$attempt/generative-remediation-prompt.md"
    fi

    fail "remediation attempt failed with exit code $remediation_rc"
  done

  if [[ "$RUN_FINALIZER" -eq 1 ]]; then
    finalizer_cmd=(bash "$ROOT_DIR/scripts/multi-agent/finalizer-agent.sh")
    if [[ -n "$PR_REF" ]]; then
      finalizer_cmd+=(--pr "$PR_REF")
    fi
    if [[ "$WATCH_CI" -eq 1 ]]; then
      finalizer_cmd+=(--watch-ci --ci-interval "$CI_INTERVAL")
    fi
    "${finalizer_cmd[@]}"
  fi

  emit_trace_event "$RUN_ROOT" "$RUN_ID" "pipeline" "end" "pass" "0" "pr-hardening"
  validate_trace_ndjson_file "$RUN_ROOT/trace.ndjson"
  printf '[pr-hardening-pipeline] PASS\n'
}

run_pipeline
