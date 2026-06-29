#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/pr-review-ready.sh [PR_NUMBER]

Runs the Interdomestik PR reviewer sequence gate:
  1. pr-finalizer with check polling enabled
  2. boundary taxonomy no-touch check
  3. governance report strict mode for Copilot and Codex review signals

Waiver environment variables, when explicitly accepted:
  PR_REVIEW_READY_ALLOW_MISSING_COPILOT=true
  PR_REVIEW_READY_ALLOW_MISSING_CODEX=true
  PR_REVIEW_READY_ALLOW_NO_TOUCH=true
  PR_REVIEW_READY_NO_TOUCH_REASON="approved release-gate/governance change"

Protected-file authorization:
  Add the PR label phase-c-no-touch-authorized for reviewed Phase C protected-file changes.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" == "--" ]]; then
  shift
fi

input_pr_number="${1:-}"
if [[ -n "${input_pr_number}" && ! "${input_pr_number}" =~ ^[0-9]+$ ]]; then
  echo "pr-review-ready failed: PR_NUMBER must be numeric" >&2
  exit 1
fi

export PR_FINALIZER_SKIP_CHECK_POLLING="${PR_FINALIZER_SKIP_CHECK_POLLING:-false}"
NO_TOUCH_AUTH_LABEL="phase-c-no-touch-authorized"

env_flag() {
  case "${!1:-}" in
    1 | true | TRUE | yes | YES | on | ON) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_pr_number() {
  local resolved=""

  if [[ -n "${input_pr_number}" ]]; then
    echo "${input_pr_number}"
    return 0
  fi

  if [[ -n "${PR_NUMBER:-}" ]]; then
    echo "${PR_NUMBER}"
    return 0
  fi

  if [[ -n "${GITHUB_EVENT_PATH:-}" && -f "${GITHUB_EVENT_PATH}" ]]; then
    resolved="$(jq -r '.pull_request.number // empty' "${GITHUB_EVENT_PATH}" 2>/dev/null || true)"
    if [[ -n "${resolved}" ]]; then
      echo "${resolved}"
      return 0
    fi
  fi

  if command -v gh >/dev/null 2>&1; then
    gh pr view --json number --jq '.number // empty' 2>/dev/null || true
  fi
}

pr_number="$(resolve_pr_number)"
if [[ -n "${pr_number}" && ! "${pr_number}" =~ ^[0-9]+$ ]]; then
  echo "pr-review-ready failed: resolved PR_NUMBER must be numeric" >&2
  exit 1
fi

if [[ -n "${pr_number}" ]]; then
  export PR_NUMBER="${pr_number}"
fi

has_no_touch_authorization() {
  if env_flag PR_REVIEW_READY_ALLOW_NO_TOUCH; then
    if [[ -z "${PR_REVIEW_READY_NO_TOUCH_REASON:-}" ]]; then
      echo "pr-review-ready failed: PR_REVIEW_READY_NO_TOUCH_REASON is required" >&2
      return 1
    fi
    return 0
  fi

  if [[ -n "${pr_number}" ]]; then
    [[ "$(
      gh pr view "${pr_number}" --json labels \
        --jq ".labels | map(.name) | index(\"${NO_TOUCH_AUTH_LABEL}\") != null"
    )" == "true" ]]
    return
  fi

  return 1
}

run_boundary_check() {
  local changed_list
  changed_list="$(mktemp)"
  trap 'rm -f "${changed_list}"' RETURN

  if [[ -n "${pr_number}" ]]; then
    local repo
    repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
    gh api --paginate "repos/${repo}/pulls/${pr_number}/files?per_page=100" \
      --jq '.[].filename' \
      | jq -R -s 'split("\n") | map(select(length > 0))' >"${changed_list}"
  else
    git diff --name-only origin/main...HEAD | jq -R -s 'split("\n") | map(select(length > 0))' >"${changed_list}"
  fi

  local report
  report="$(
    node scripts/plan-conformance/boundary-diff-report.mjs \
      --changed-list "${changed_list}" \
      --out tmp/plan-conformance/pr-review-ready-boundary.json
  )"

  if [[ "$(echo "${report}" | jq -r '.no_go')" == "true" ]]; then
    local no_touch_files
    no_touch_files="$(
      echo "${report}" | jq -r '.findings[]? | select(.classification == "no_touch") | "- " + .file'
    )"
    if [[ -n "${no_touch_files}" ]] && has_no_touch_authorization; then
      echo "pr-review-ready: Phase C no-touch authorization accepted" >&2
      return 0
    fi

    echo "pr-review-ready failed: Phase C no-touch files changed" >&2
    if [[ -n "${no_touch_files}" ]]; then
      echo "${no_touch_files}" >&2
    else
      echo "${report}" | jq -r '.findings[]? | "- " + .file' >&2
    fi
    return 1
  fi
}

GITHUB_EVENT_PATH="" bash scripts/pr-finalizer.sh
run_boundary_check
node scripts/github-pr-governance-report.mjs --strict ${pr_number:+"${pr_number}"}
