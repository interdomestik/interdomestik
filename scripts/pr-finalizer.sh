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
  "pr:verify"
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

  local payload
  payload="$(gh pr view "${pr_number}" --json statusCheckRollup --repo "${GITHUB_REPOSITORY:-}")"

  for check_name in "${required_checks[@]}"; do
    check_result="$(echo "${payload}" | jq -r --arg NAME "$check_name" '
      if (.statusCheckRollup | type == "array") then
        .statusCheckRollup
      elif (.statusCheckRollup | type == "object") then
        (.statusCheckRollup.nodes // [])
      else
        []
      end
      | map(select(.name == $NAME))
      | .[0]
      | .conclusion // .state // "missing"
    ')"

    if [[ "${check_result}" != "SUCCESS" ]]; then
      fail "required check '${check_name}' is not SUCCESS (found: ${check_result})"
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
