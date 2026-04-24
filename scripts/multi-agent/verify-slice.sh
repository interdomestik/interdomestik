#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/multi-agent/pr-hardening-common.sh"

BASE_REF="origin/main"
RUN_ID="verify-slice-$(date -u +%Y%m%dT%H%M%SZ)-$(random_suffix)"
RUN_ROOT=""
ALLOW_MAIN=0
RUN_MCP_PREFLIGHT=0
RUN_STATIC=0
RUN_REQUIRED=0

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/verify-slice.sh [options]

Creates a diff-scoped pre-PR reviewer plan for the current branch.

Options:
  --base <ref>             Base ref for diff classification (default: origin/main)
  --run-id <id>            Override run id
  --run-root <path>        Override output root
  --allow-main             Allow running on main/master
  --mcp-preflight          Run pnpm mcp:preflight before writing the plan
  --static                 Run slice formatting, lint, type-check, and security:guard
  --required-gates         Run pnpm pr:verify, pnpm security:guard, and pnpm e2e:gate
  -h, --help               Show this help

Default behavior writes the reviewer plan and prompts only; no gates are run.
USAGE
  return 0
}

fail() {
  local message="$1"
  printf '[verify-slice] FAIL: %s\n' "$message" >&2
  exit 1
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --base)
      [[ $# -ge 2 ]] || fail 'missing value for --base'
      BASE_REF="$2"
      shift 2
      ;;
    --run-id)
      [[ $# -ge 2 ]] || fail 'missing value for --run-id'
      RUN_ID="$2"
      shift 2
      ;;
    --run-root)
      [[ $# -ge 2 ]] || fail 'missing value for --run-root'
      RUN_ROOT="$2"
      shift 2
      ;;
    --allow-main)
      ALLOW_MAIN=1
      shift
      ;;
    --mcp-preflight)
      RUN_MCP_PREFLIGHT=1
      shift
      ;;
    --static)
      RUN_STATIC=1
      shift
      ;;
    --required-gates)
      RUN_REQUIRED=1
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
  RUN_ROOT="$ROOT_DIR/tmp/multi-agent/verify-slice/$RUN_ID"
fi

mkdir -p "$RUN_ROOT/prompts" "$RUN_ROOT/evidence/gates"

branch="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
if [[ "$ALLOW_MAIN" -ne 1 && ( "$branch" == "main" || "$branch" == "master" ) ]]; then
  fail 'refusing to run slice verification on main/master; create or switch to a slice branch'
fi

git -C "$ROOT_DIR" fetch origin --prune >/dev/null 2>&1 || true

if ! git -C "$ROOT_DIR" rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  fail "base ref not found: $BASE_REF"
fi

BASE_COMMIT="$(git -C "$ROOT_DIR" merge-base HEAD "$BASE_REF")"
CHANGED_FILES="$RUN_ROOT/changed-files.txt"
DIFF_STAT="$RUN_ROOT/diff-stat.txt"
COMMITTED_CHANGED_FILES="$RUN_ROOT/changed-files.committed.txt"
WORKTREE_CHANGED_FILES="$RUN_ROOT/changed-files.worktree.txt"
UNTRACKED_FILES="$RUN_ROOT/changed-files.untracked.txt"

git -C "$ROOT_DIR" diff --name-only "$BASE_COMMIT"...HEAD | sort -u >"$COMMITTED_CHANGED_FILES"
{
  git -C "$ROOT_DIR" diff --name-only
  git -C "$ROOT_DIR" diff --name-only --cached
} | sed '/^$/d' | sort -u >"$WORKTREE_CHANGED_FILES"
git -C "$ROOT_DIR" ls-files --others --exclude-standard | sort -u >"$UNTRACKED_FILES"
cat "$COMMITTED_CHANGED_FILES" "$WORKTREE_CHANGED_FILES" "$UNTRACKED_FILES" | sed '/^$/d' | sort -u >"$CHANGED_FILES"
{
  echo "# Committed Diff Stat"
  git -C "$ROOT_DIR" diff --stat "$BASE_COMMIT"...HEAD
  echo
  echo "# Working Tree Diff Stat"
  git -C "$ROOT_DIR" diff --stat
  echo
  echo "# Staged Diff Stat"
  git -C "$ROOT_DIR" diff --cached --stat
} >"$DIFF_STAT"

changed_count="$(wc -l <"$CHANGED_FILES" | tr -d ' ')"
committed_changed_count="$(wc -l <"$COMMITTED_CHANGED_FILES" | tr -d ' ')"
worktree_changed_count="$(wc -l <"$WORKTREE_CHANGED_FILES" | tr -d ' ')"
untracked_count="$(wc -l <"$UNTRACKED_FILES" | tr -d ' ')"
ui_touched="no"
performance_touched="no"
contracts_touched="no"
accessibility_touched="no"
boundary_touched="no"

if rg -q '^apps/web/src/(app|components|features)/' "$CHANGED_FILES"; then
  ui_touched="yes"
fi

if rg -q '(^apps/web/src/(app/api|server)/|^packages/database/|/db/|/query|queries|repository|cache|performance|middleware|instrumentation|route\.ts$)' "$CHANGED_FILES"; then
  performance_touched="yes"
fi

if rg -q '(^apps/web/src/app/api/|^apps/web/src/messages/|schema\.ts$|types\.ts$|package\.json$|pnpm-lock\.yaml$|turbo\.json$|\.github/workflows/|^scripts/|\.env\.example$|config|contract)' "$CHANGED_FILES"; then
  contracts_touched="yes"
fi

if rg -q '(^apps/web/src/(app|components|features)/|^apps/web/src/messages/|i18n|locale|routing|page-ready|aria-|accessibility)' "$CHANGED_FILES"; then
  accessibility_touched="yes"
fi

if rg -q '(^apps/web/src/proxy\.ts$|auth|tenant|packages/shared-auth|packages/database|^apps/web/src/app/api/)' "$CHANGED_FILES"; then
  boundary_touched="yes"
fi

reviewers=(security_reviewer architect_reviewer qa_reviewer)
if [[ "$performance_touched" == "yes" ]]; then
  reviewers+=(performance_reviewer)
fi
if [[ "$contracts_touched" == "yes" ]]; then
  reviewers+=(contracts_reviewer)
fi

write_manifest() {
  cat >"$RUN_ROOT/run-manifest.md" <<EOF
# Verify Slice Manifest

- run_id: \`$RUN_ID\`
- generated_utc: \`$(iso_utc)\`
- branch: \`$branch\`
- base_ref: \`$BASE_REF\`
- authoritative_base_ref: \`merge-base(HEAD,$BASE_REF)\`
- authoritative_base_commit: \`$BASE_COMMIT\`
- changed_file_count: \`$changed_count\`
- committed_changed_file_count: \`$committed_changed_count\`
- worktree_changed_file_count: \`$worktree_changed_count\`
- untracked_file_count: \`$untracked_count\`
- ui_touched: \`$ui_touched\`
- performance_touched: \`$performance_touched\`
- contracts_touched: \`$contracts_touched\`
- accessibility_touched: \`$accessibility_touched\`
- boundary_touched: \`$boundary_touched\`
- selected_reviewers: \`${reviewers[*]}\`

## Changed Files

See \`$CHANGED_FILES\`.

## Diff Stat

See \`$DIFF_STAT\`.
EOF
  return 0
}

write_reviewer_prompt() {
  local reviewer="$1"
  local title="$2"
  local focus="$3"
  cat >"$RUN_ROOT/prompts/${reviewer}.md" <<EOF
# ${title}

Review the current branch as a completed Interdomestik Phase C slice before PR.

## Scope
- Base: \`$BASE_COMMIT...HEAD\` from \`$BASE_REF\`
- Changed-file inventory: \`$CHANGED_FILES\`
- Diff stat: \`$DIFF_STAT\`
- Include committed branch changes plus staged, unstaged, and untracked local files from the changed-file inventory.
- Review only the slice diff and directly impacted execution paths.
- Do not ask for README, AGENTS.md, or architecture-doc edits unless those files are already in scope.
- Treat \`apps/web/src/proxy.ts\` as read-only unless the slice explicitly authorized a proxy change.
- Canonical routes \`/member\`, \`/agent\`, \`/staff\`, and \`/admin\` must not be renamed, bypassed, or shadowed.
- Stripe is not used in V3 pilot flows.

## Focus
$focus

## Output Contract
Return only actionable findings:
- \`MUST_FIX\`: correctness, security, tenant isolation, broken contract, or failing gate risk.
- \`SHOULD_FIX\`: maintainability or coverage risk that should be handled before PR if practical.
- \`NICE_TO_HAVE\`: optional, non-blocking cleanup.

End with exactly one verdict:
- \`READY FOR PR\`
- \`READY FOR PR AFTER MUST-FIX ITEMS\`
- \`NOT READY FOR PR\`

If there are no material findings, say that plainly and list residual test risk.
EOF
  return 0
}

write_orchestration_prompt() {
  cat >"$RUN_ROOT/prompts/orchestrator.md" <<EOF
# Pre-PR Engineer Pool Orchestrator

Use this run root: \`$RUN_ROOT\`

Spawn the selected reviewers in parallel:
$(printf -- '- `%s`\n' "${reviewers[@]}")

Rules:
- reviewers read only \`$BASE_COMMIT...HEAD\` and directly impacted paths
- reviewers must also include staged, unstaged, and untracked local files listed in \`$CHANGED_FILES\`
- collect must-fix / should-fix / nice-to-have findings
- deduplicate overlapping findings
- produce one final verdict: \`READY FOR PR\`, \`READY FOR PR AFTER MUST-FIX ITEMS\`, or \`NOT READY FOR PR\`
- do not let reviewers modify product code

Conditional signals:
- ui_touched: \`$ui_touched\`
- performance_touched: \`$performance_touched\`
- contracts_touched: \`$contracts_touched\`
- accessibility_touched: \`$accessibility_touched\`
- boundary_touched: \`$boundary_touched\`
EOF
  return 0
}

run_gate() {
  local label="$1"
  local command="$2"
  local log_file="$RUN_ROOT/evidence/gates/${label}.log"
  printf '[verify-slice] running %s\n' "$label"
  run_redacted "$log_file" bash -c "cd '$ROOT_DIR' && $command"
  return 0
}

run_slice_format_check() {
  local log_file="$RUN_ROOT/evidence/gates/format-slice.log"
  local format_files_file="$RUN_ROOT/format-check-files.txt"

  node -e '
const fs = require("node:fs");
const changedFiles = fs.readFileSync(process.argv[1], "utf8")
  .split("\n")
  .map(line => line.trim())
  .filter(Boolean);
const supported = changedFiles.filter(file => /\.(ts|tsx|md|json)$/u.test(file));
fs.writeFileSync(process.argv[2], `${supported.join("\n")}${supported.length ? "\n" : ""}`);
' "$CHANGED_FILES" "$format_files_file"

  if [[ ! -s "$format_files_file" ]]; then
    printf '[verify-slice] running format-slice\n' | tee "$log_file"
    printf '[verify-slice] no changed ts/tsx/md/json files to format-check\n' | tee -a "$log_file"
    return 0
  fi

  printf '[verify-slice] running format-slice\n'
  set +e
  (
    set -o pipefail
    cd "$ROOT_DIR"
    mapfile -t format_files <"$format_files_file"
    pnpm exec prettier --check "${format_files[@]}" 2>&1 | redact_stream | tee "$log_file"
  )
  local status=$?
  set -e
  return "$status"
}

write_manifest
for reviewer in "${reviewers[@]}"; do
  case "$reviewer" in
    security_reviewer)
      write_reviewer_prompt "security_reviewer" "Security Reviewer" "Find auth/session, tenant isolation, proxy/routing authority, API exposure, secret, and sensitive-data regressions introduced by this slice."
      ;;
    architect_reviewer)
      write_reviewer_prompt "architect_reviewer" "Architecture Reviewer" "Find Phase C architectural drift, domain-boundary violations, route/access-control bypasses, overbroad refactors, and scope creep introduced by this slice."
      ;;
    qa_reviewer)
      write_reviewer_prompt "qa_reviewer" "QA Reviewer" "Find missing or weak tests, E2E gate risks, broken clarity markers, regression paths, and deterministic verification gaps introduced by this slice."
      ;;
    performance_reviewer)
      write_reviewer_prompt "performance_reviewer" "Performance Reviewer" "Find query, hot path, unbounded work, cache, rendering, and bundle-cost regressions introduced by this slice."
      ;;
    contracts_reviewer)
      write_reviewer_prompt "contracts_reviewer" "Contracts Reviewer" "Find API, schema, type, config, i18n, script, workflow, and environment contract drift introduced by this slice."
      ;;
    *)
      fail "unknown reviewer selected: $reviewer"
      ;;
  esac
done
write_orchestration_prompt

{
  echo "# Verify Slice Reviewer Plan"
  echo
  echo "- run_root: \`$RUN_ROOT\`"
  echo "- selected_reviewers: \`${reviewers[*]}\`"
  echo "- changed_file_count: \`$changed_count\`"
  echo "- committed_changed_file_count: \`$committed_changed_count\`"
  echo "- worktree_changed_file_count: \`$worktree_changed_count\`"
  echo "- untracked_file_count: \`$untracked_count\`"
  echo
  echo "## Recommended Dispatch"
  echo
  for reviewer in "${reviewers[@]}"; do
    echo "- \`$reviewer\`: \`$RUN_ROOT/prompts/$reviewer.md\`"
  done
  echo
  echo "## Deterministic Gate Options"
  echo
  echo "- Static/security: \`pnpm verify-slice -- --static\`"
  echo "- Required local gates: \`pnpm verify-slice -- --required-gates\`"
  echo "- Existing full hardening: \`pnpm multiagent:pr-hardening -- --no-auto-remediate\`"
} >"$RUN_ROOT/reviewer-plan.md"

if [[ "$RUN_MCP_PREFLIGHT" -eq 1 ]]; then
  run_gate "mcp-preflight" "pnpm mcp:preflight"
fi

if [[ "$RUN_STATIC" -eq 1 ]]; then
  run_slice_format_check
  run_gate "lint" "pnpm lint"
  run_gate "type-check" "pnpm type-check"
  run_gate "security-guard" "pnpm security:guard"
fi

if [[ "$RUN_REQUIRED" -eq 1 ]]; then
  run_gate "pr-verify" "pnpm pr:verify"
  run_gate "security-guard" "pnpm security:guard"
  run_gate "e2e-gate" "pnpm e2e:gate"
fi

printf '[verify-slice] PASS\n'
printf '[verify-slice] run_root=%s\n' "$RUN_ROOT"
printf '[verify-slice] selected_reviewers=%s\n' "${reviewers[*]}"
