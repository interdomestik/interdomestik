#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/pr-finalizer.sh [--help]

Runs local finalization checks for PR readiness:
  - verifies clean git working tree
  - classifies the PR validation surface before choosing local/runtime gates
  - runs runtime local checks for runtime-sensitive PRs
  - validates manifest-declared leaf checks and review threads
  - defers asynchronous generator adjudication to the terminal delivery gate

Environment:
  PR_FINALIZER_SKIP_CHECK_POLLING=true|false
    - default in CI (GITHUB_ACTIONS=true): true (branch protection handles checks)
    - default locally (no GITHUB_ACTIONS): false
    - when set, this variable overrides the default in all environments
      (for example, false in CI forces polling)
EOF
}

PR_DELIVERY_CONTRACT="${PR_DELIVERY_CONTRACT:-scripts/ci/pr-delivery-contract.json}"
max_check_retries="${PR_FINALIZER_MAX_CHECK_RETRIES:-120}"
check_retry_delay_seconds=10
readonly GH_ACCEPT_HEADER='Accept: application/vnd.github+json'

run_step() {
  local name="$1"
  shift
  printf '\n[pr-finalizer] Running: %s\n' "$name"
  "$@"
}

resolve_matching_checks() {
  local check_name="$1"
  local app_id="$2"
  local checks="$3"

  echo "${checks}" | jq --arg NAME "$check_name" --argjson APP_ID "$app_id" '
    [.check_runs[] | select((.name//.workflow_name//"")==$NAME and .app.id==$APP_ID)]
    | sort_by(.started_at//.completed_at//.created_at//"")
    | if length>0 then [.[-1]] else [] end
  '
}

fetch_check_runs() {
  local repo="$1"
  local head_sha="$2"
  gh api --paginate --slurp -H "${GH_ACCEPT_HEADER}" \
    "repos/${repo}/commits/${head_sha}/check-runs?filter=all&per_page=100" \
    | jq '{check_runs: [.[].check_runs[]]}'
}

fail() {
  echo "[pr-finalizer] FAIL: $1" >&2
  exit 1
}

# shellcheck source=scripts/pr-finalizer-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/pr-finalizer-lib.sh"
# shellcheck source=scripts/pr-finalizer-feedback-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/pr-finalizer-feedback-lib.sh"

require_clean_tree() {
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    return 0
  fi

  if [[ -n "$(git status --porcelain=v1)" ]]; then
    fail "working tree is not clean"
  fi
}

pr_context() {
  if [[ -n "${GITHUB_EVENT_PATH:-}" && -f "${GITHUB_EVENT_PATH}" ]]; then
    trusted_event_pr_number "${GITHUB_EVENT_PATH}"
  elif [[ -n "${PR_NUMBER:-}" ]]; then
    echo "${PR_NUMBER}"
  else
    gh pr view --json number | jq -r '.number'
  fi
}

require_gh_checks() {
  local skip_polling_env="${PR_FINALIZER_SKIP_CHECK_POLLING:-}"
  local skip_polling="false"

  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    skip_polling="true"
  fi

  if [[ -n "${skip_polling_env}" ]]; then
    case "${skip_polling_env,,}" in
      1|true|yes|on) skip_polling="true" ;;
      0|false|no|off) skip_polling="false" ;;
      *)
        fail "invalid PR_FINALIZER_SKIP_CHECK_POLLING value: ${skip_polling_env}"
        ;;
    esac
  fi

  if [[ "${skip_polling}" == "true" ]]; then
    echo "[pr-finalizer] INFO: skipping required-check polling (handled by branch protection)."
    return 0
  fi
  if [[ ! "${max_check_retries}" =~ ^[1-9][0-9]*$ ]]; then
    fail "invalid PR_FINALIZER_MAX_CHECK_RETRIES value: ${max_check_retries}"
  fi

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
    repo="$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)"
  fi
  if [[ -z "${repo}" ]]; then
    fail "unable to resolve repository context"
  fi

  local pr_json
  pr_json="$(gh api -H "${GH_ACCEPT_HEADER}" "repos/${repo}/pulls/${pr_number}")"
  if [[ -z "${pr_json}" || "${pr_json}" == "null" ]]; then
    fail "unable to read PR data for #${pr_number} in ${repo}"
  fi

  local head_sha
  head_sha="$(echo "${pr_json}" | jq -r '.head.sha // empty')"
  if [[ -z "${head_sha}" || "${head_sha}" == "null" ]]; then
    fail "unable to resolve head SHA for PR #${pr_number}"
  fi

  local checks_json
  checks_json="$(fetch_check_runs "${repo}" "${head_sha}")"
  if [[ -z "${checks_json}" || "${checks_json}" == "null" ]]; then
    fail "unable to read check runs for commit ${head_sha}"
  fi

  local check_name app_id required_records
  if ! required_records="$(required_check_records)" || [[ -z "${required_records}" ]]; then
    fail "delivery contract has no valid finalizer prerequisites"
  fi
  while IFS=$'	' read -r check_name app_id; do

    local matching_checks
    local check_result
    local check_count

    matching_checks="$(resolve_matching_checks "${check_name}" "${app_id}" "${checks_json}")"

    for attempt in $(seq 1 "${max_check_retries}"); do
      check_count="$(echo "${matching_checks}" | jq 'length')"
      if [[ "${check_count}" -eq 0 ]]; then
        if [[ "${attempt}" -ge "${max_check_retries}" ]]; then
          fail "required checks for '${check_name}' are not present"
        fi

        echo "[pr-finalizer] INFO: '${check_name}' check is not present yet. Retrying in ${check_retry_delay_seconds}s..."
        sleep "${check_retry_delay_seconds}"
        checks_json="$(fetch_check_runs "${repo}" "${head_sha}")"
        matching_checks="$(resolve_matching_checks "${check_name}" "${app_id}" "${checks_json}")"
        continue
      fi

      check_result="$(echo "${matching_checks}" | jq 'map(select((.status | ascii_downcase) != "completed" or (.conclusion | ascii_downcase) != "success")) | length')"
      if [[ "${check_result}" -eq 0 ]]; then
        break
      fi

      in_progress_count="$(echo "${matching_checks}" | jq 'map(select((.status | ascii_downcase) != "completed")) | length')"
      if [[ "${in_progress_count}" -eq 0 ]]; then
        break
      fi

      if [[ "${attempt}" -ge "${max_check_retries}" ]]; then
        fail "required checks for '${check_name}' are not passing (found: ${check_result} non-passing) after ${max_check_retries} retries"
      fi

      echo "[pr-finalizer] INFO: '${check_name}' checks still running (${in_progress_count} in progress). Retrying in ${check_retry_delay_seconds}s..."
      sleep "${check_retry_delay_seconds}"
      checks_json="$(fetch_check_runs "${repo}" "${head_sha}")"
      matching_checks="$(resolve_matching_checks "${check_name}" "${app_id}" "${checks_json}")"
    done

    check_result="$(echo "${matching_checks}" | jq 'map(select((.status | ascii_downcase) != "completed" or (.conclusion | ascii_downcase) != "success")) | length')"
    if [[ "${check_result}" -ne 0 ]]; then
      fail "required checks for '${check_name}' are not passing (found: ${check_result} non-passing)"
    fi
  done <<<"${required_records}"
  defer_async_generators
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_clean_tree
classify_pr
run_local_verifications
require_gh_checks
require_review_threads_resolved

echo "[pr-finalizer] PASS: local checks, manifest leaf prerequisites, and review threads pass"
