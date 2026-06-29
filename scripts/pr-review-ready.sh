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
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" == "--" ]]; then
  shift
fi

pr_number="${1:-}"
if [[ -n "${pr_number}" && ! "${pr_number}" =~ ^[0-9]+$ ]]; then
  echo "pr-review-ready failed: PR_NUMBER must be numeric" >&2
  exit 1
fi

if [[ -n "${pr_number}" ]]; then
  export PR_NUMBER="${pr_number}"
fi

export PR_FINALIZER_SKIP_CHECK_POLLING="${PR_FINALIZER_SKIP_CHECK_POLLING:-false}"

run_boundary_check() {
  local changed_list
  changed_list="$(mktemp)"
  trap 'rm -f "${changed_list}"' RETURN

  if [[ -n "${pr_number}" ]]; then
    gh pr view "${pr_number}" --json files --jq '[.files[].path]' >"${changed_list}"
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
    echo "pr-review-ready failed: Phase C no-touch files changed" >&2
    echo "${report}" | jq -r '.findings[] | select(.classification == "no_touch") | "- " + .file' >&2
    return 1
  fi
}

bash scripts/pr-finalizer.sh
run_boundary_check
node scripts/github-pr-governance-report.mjs --strict ${pr_number:+"${pr_number}"}
