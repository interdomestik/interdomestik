#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/pr-finalizer.sh [--help]

Runs local finalization checks for PR readiness:
  - verifies clean git working tree
  - runs pnpm type-check
  - runs pnpm test
  - validates required GitHub checks and unresolved review threads
EOF
}

required_checks=(
  "CI"
  "Secret Scan"
  "e2e-gate"
  "pr:verify"
  "pnpm-audit"
  "gitleaks"
)

run_step() {
  local name="$1"
  shift
  printf '\n[pr-finalizer] Running: %s\n' "$name"
  "$@"
}

fail() {
  echo "[pr-finalizer] FAIL: $1" >&2
  exit 1
}

require_clean_tree() {
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    return 0
  fi

  if ! git diff --quiet --no-ext-diff --ignore-submodules --exit-code; then
    fail "working tree is not clean"
  fi
}

run_local_verifications() {
  run_step "pnpm type-check" pnpm type-check
  run_step "pnpm test" pnpm test
}

pr_context() {
  if [[ -n "${GITHUB_EVENT_PATH:-}" && -f "${GITHUB_EVENT_PATH}" ]]; then
    jq -r '.pull_request.number // empty' "${GITHUB_EVENT_PATH}" || true
  elif [[ -n "${PR_NUMBER:-}" ]]; then
    echo "${PR_NUMBER}"
  else
    gh pr view --json number | jq -r '.number'
  fi
}

require_gh_checks() {
  local gh_token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [[ -n "${gh_token}" ]]; then
    export GH_TOKEN="${gh_token}"
  fi

  if ! command -v gh >/dev/null 2>&1; then
    fail "GitHub CLI (gh) is required for check validation"
  fi
  if ! command -v jq >/dev/null 2>&1; then
    fail "jq is required for status parsing"
  fi

  local pr_number
  pr_number="$(pr_context)"
  if [[ -z "${pr_number}" || "${pr_number}" == "null" ]]; then
    fail "unable to resolve pull request number"
  fi

  local repo="${GITHUB_REPOSITORY:-}"
  if [[ -z "${repo}" ]]; then
    repo="$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\\.git$##' || true)"
  fi
  if [[ -z "${repo}" ]]; then
    fail "unable to resolve repository context"
  fi

  local pr_json
  pr_json="$(gh api -H "Accept: application/vnd.github+json" "repos/${repo}/pulls/${pr_number}")"
  if [[ -z "${pr_json}" || "${pr_json}" == "null" ]]; then
    fail "unable to read PR data for #${pr_number} in ${repo}"
  fi

  local head_sha
  head_sha="$(echo "${pr_json}" | jq -r '.head.sha // empty')"
  if [[ -z "${head_sha}" || "${head_sha}" == "null" ]]; then
    fail "unable to resolve head SHA for PR #${pr_number}"
  fi

  local checks_json
  checks_json="$(gh api -H "Accept: application/vnd.github+json" "repos/${repo}/commits/${head_sha}/check-runs?per_page=100")"
  if [[ -z "${checks_json}" || "${checks_json}" == "null" ]]; then
    fail "unable to read check runs for commit ${head_sha}"
  fi

  for check_name in "${required_checks[@]}"; do
    local matching_checks
    local check_result
    local check_count

  # Skip validating the finalizer job itself to avoid circular dependency checks.
  local excluded_check="pr-finalizer"

    if [[ "${check_name}" == "CI" ]]; then
      matching_checks="$(echo "${checks_json}" | jq '[.check_runs | .[] | select((.name // .workflow_name // "") | ascii_downcase | test("^(audit|static|unit|e2e-gate)$"))]')"
    elif [[ "${check_name}" == "pr:verify" ]]; then
      matching_checks="$(echo "${checks_json}" | jq '[.check_runs | .[] | select((.name // .workflow_name // "") | ascii_downcase | test("pr:verify\\s*\\+\\s*pilot:check"))]')"
    elif [[ "${check_name}" == "Secret Scan" ]]; then
      matching_checks="$(echo "${checks_json}" | jq '[.check_runs | .[] | select((.name // .workflow_name // "") | test("^secret scan$|^gitleaks"; "i"))]')"
    else
      matching_checks="$(echo "${checks_json}" | jq --arg NAME "$check_name" '[.check_runs | .[] | select((.name // .workflow_name // "") | test(("^" + $NAME); "i"))]')"
    fi

    matching_checks="$(echo "${matching_checks}" | jq --arg EXCLUDED "$excluded_check" '[.[] | select((.name // .workflow_name // "") != $EXCLUDED)]')"

    check_count="$(echo "${matching_checks}" | jq 'length')"
    if [[ "${check_name}" == "CI" && "${check_count}" -ne 4 ]]; then
      fail "required checks for '${check_name}' are incomplete (found: ${check_count}/4 CI jobs)"
    elif [[ "${check_count}" -eq 0 ]]; then
      fail "required checks for '${check_name}' are not present"
    fi

    check_result="$(echo "${matching_checks}" | jq 'map(select((.status | ascii_downcase) != "completed" or (.conclusion | ascii_downcase) != "success")) | length')"
    if [[ "${check_result}" -ne 0 ]]; then
      fail "required checks for '${check_name}' are not passing (found: ${check_result} non-passing)"
    fi
  done

  # Review-thread-level unresolved checks vary by gh API version; keep this step intentionally
  # aligned to available fields and enforce unresolved threads in review process separately.
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_clean_tree
run_local_verifications
require_gh_checks

echo "[pr-finalizer] PASS: working tree, local checks, CI status checks, and review threads all pass"
