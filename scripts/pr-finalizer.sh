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
  "pr:verify + pilot:check"
  "pnpm-audit"
  "gitleaks"
)
max_check_retries=120
check_retry_delay_seconds=10

run_step() {
  local name="$1"
  shift
  printf '\n[pr-finalizer] Running: %s\n' "$name"
  "$@"
}

resolve_matching_checks() {
  local check_name="$1"
  local checks="$2"

  if [[ "${check_name}" == "CI" ]]; then
    echo "${checks}" | jq '[.check_runs | .[] | select((.name // .workflow_name // "") | ascii_downcase | test("(^|.*/\\s*)(audit|static|unit|e2e-gate)$"))]'
  elif [[ "${check_name}" == "pr:verify + pilot:check" ]]; then
    echo "${checks}" | jq '[.check_runs | .[] | select((.name // .workflow_name // "") | ascii_downcase | test("(^|.*/\\s*)pr:verify\\s*\\+\\s*pilot:check\\s*$"))]'
  elif [[ "${check_name}" == "Secret Scan" ]]; then
    echo "${checks}" | jq '[.check_runs | .[] | select((.name // .workflow_name // "") | test("^secret scan$|^gitleaks"; "i"))]'
  elif [[ "${check_name}" == "pnpm-audit" ]]; then
    echo "${checks}" | jq '[.check_runs | .[] | select((.name // .workflow_name // "") | ascii_downcase | test("(^|.*/\\s*)pnpm-audit$"))]'
  elif [[ "${check_name}" == "gitleaks" ]]; then
    echo "${checks}" | jq '[.check_runs | .[] | select((.name // .workflow_name // "") | ascii_downcase | test("(^|.*/\\s*)gitleaks$"))]'
  else
    echo "${checks}" | jq --arg NAME "$check_name" '[.check_runs | .[] | select((.name // .workflow_name // "") | test(("^" + $NAME); "i"))]'
  fi
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
  checks_json="$(gh api -H "Accept: application/vnd.github+json" "repos/${repo}/commits/${head_sha}/check-runs?filter=latest&per_page=100")"
  if [[ -z "${checks_json}" || "${checks_json}" == "null" ]]; then
    fail "unable to read check runs for commit ${head_sha}"
  fi

  for check_name in "${required_checks[@]}"; do
    local matching_checks
    local check_result
    local check_count

  # Skip validating the finalizer job itself to avoid circular dependency checks.
  local excluded_check="pr-finalizer"

    matching_checks="$(resolve_matching_checks "${check_name}" "${checks_json}")"
    matching_checks="$(echo "${matching_checks}" | jq --arg EXCLUDED "$excluded_check" '[.[] | select((.name // .workflow_name // "") != $EXCLUDED)]')"

    for attempt in $(seq 1 "${max_check_retries}"); do
      check_count="$(echo "${matching_checks}" | jq 'length')"
      if [[ "${check_name}" == "CI" && "${check_count}" -ne 4 ]]; then
        if [[ "${attempt}" -ge "${max_check_retries}" ]]; then
          fail "required checks for '${check_name}' are incomplete (found: ${check_count}/4 CI jobs)"
        fi
        echo "[pr-finalizer] INFO: '${check_name}' checks not all present yet (found: ${check_count}/4). Retrying in ${check_retry_delay_seconds}s..."
        sleep "${check_retry_delay_seconds}"
        checks_json="$(gh api -H "Accept: application/vnd.github+json" "repos/${repo}/commits/${head_sha}/check-runs?filter=latest&per_page=100")"
        matching_checks="$(resolve_matching_checks "${check_name}" "${checks_json}")"
        matching_checks="$(echo "${matching_checks}" | jq --arg EXCLUDED "$excluded_check" '[.[] | select((.name // .workflow_name // "") != $EXCLUDED)]')"
        continue
      fi

      if [[ "${check_count}" -eq 0 ]]; then
        if [[ "${attempt}" -ge "${max_check_retries}" ]]; then
          fail "required checks for '${check_name}' are not present"
        fi

        echo "[pr-finalizer] INFO: '${check_name}' check is not present yet. Retrying in ${check_retry_delay_seconds}s..."
        sleep "${check_retry_delay_seconds}"
        checks_json="$(gh api -H "Accept: application/vnd.github+json" "repos/${repo}/commits/${head_sha}/check-runs?filter=latest&per_page=100")"
        matching_checks="$(resolve_matching_checks "${check_name}" "${checks_json}")"
        matching_checks="$(echo "${matching_checks}" | jq --arg EXCLUDED "$excluded_check" '[.[] | select((.name // .workflow_name // "") != $EXCLUDED)]')"
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
      checks_json="$(gh api -H "Accept: application/vnd.github+json" "repos/${repo}/commits/${head_sha}/check-runs?filter=latest&per_page=100")"
      matching_checks="$(resolve_matching_checks "${check_name}" "${checks_json}")"
      matching_checks="$(echo "${matching_checks}" | jq --arg EXCLUDED "$excluded_check" '[.[] | select((.name // .workflow_name // "") != $EXCLUDED)]')"
    done

    check_result="$(echo "${matching_checks}" | jq 'map(select((.status | ascii_downcase) != "completed" or (.conclusion | ascii_downcase) != "success")) | length')"
    if [[ "${check_result}" -ne 0 ]]; then
      fail "required checks for '${check_name}' are not passing (found: ${check_result} non-passing)"
    fi
  done

  # Review-thread-level unresolved checks vary by gh API version; keep this step intentionally
  # aligned to available fields and enforce unresolved threads via GraphQL.
}

require_review_threads_resolved() {
  local gh_token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [[ -n "${gh_token}" ]]; then
    export GH_TOKEN="${gh_token}"
  fi

  if ! command -v gh >/dev/null 2>&1; then
    fail "GitHub CLI (gh) is required for review-thread validation"
  fi
  if ! command -v jq >/dev/null 2>&1; then
    fail "jq is required for review-thread parsing"
  fi

  local pr_number
  pr_number="$(pr_context)"
  if [[ -z "${pr_number}" || "${pr_number}" == "null" ]]; then
    fail "unable to resolve pull request number for review-thread validation"
  fi

  local repo="${GITHUB_REPOSITORY:-}"
  if [[ -z "${repo}" ]]; then
    repo="$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\\.git$##' || true)"
  fi
  if [[ -z "${repo}" ]]; then
    fail "unable to resolve repository context for review-thread validation"
  fi

  local owner repo_name
  owner="${repo%%/*}"
  repo_name="${repo##*/}"
  if [[ -z "${owner}" || -z "${repo_name}" ]]; then
    fail "unable to parse owner/repo from '${repo}'"
  fi

  local query
  query="$(cat <<'GRAPHQL'
query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          isResolved
          comments(first: 20) {
            nodes {
              url
              author {
                login
              }
            }
          }
        }
      }
    }
  }
}
GRAPHQL
)"

  local cursor=""
  local unresolved_total=0
  local unresolved_copilot=0
  local -a unresolved_samples=()

  while true; do
    local response
    if [[ -z "${cursor}" ]]; then
      response="$(gh api graphql -f query="${query}" -f owner="${owner}" -f repo="${repo_name}" -F prNumber="${pr_number}")"
    else
      response="$(gh api graphql -f query="${query}" -f owner="${owner}" -f repo="${repo_name}" -F prNumber="${pr_number}" -f cursor="${cursor}")"
    fi

    local threads_path=".data.repository.pullRequest.reviewThreads"
    if [[ "$(echo "${response}" | jq -r "${threads_path} == null")" == "true" ]]; then
      fail "unable to read review threads from GitHub GraphQL API"
    fi

    local -a unresolved_rows=()
    mapfile -t unresolved_rows < <(
      echo "${response}" | jq -r '
        .data.repository.pullRequest.reviewThreads.nodes[]
        | select(.isResolved == false)
        | [
            (.comments.nodes[0].url // "n/a"),
            (([.comments.nodes[].author.login // "unknown"] | unique | join(","))),
            (([.comments.nodes[].author.login // ""] | any(test("copilot"; "i"))) | tostring)
          ]
        | @tsv
      '
    )

    local row
    for row in "${unresolved_rows[@]}"; do
      unresolved_total=$((unresolved_total + 1))
      IFS=$'\t' read -r thread_url thread_authors thread_has_copilot <<<"${row}"
      if [[ "${thread_has_copilot}" == "true" ]]; then
        unresolved_copilot=$((unresolved_copilot + 1))
      fi
      if [[ "${#unresolved_samples[@]}" -lt 5 ]]; then
        unresolved_samples+=("${thread_url} [authors=${thread_authors}]")
      fi
    done

    local has_next_page
    has_next_page="$(echo "${response}" | jq -r "${threads_path}.pageInfo.hasNextPage")"
    if [[ "${has_next_page}" != "true" ]]; then
      break
    fi

    cursor="$(echo "${response}" | jq -r "${threads_path}.pageInfo.endCursor")"
    if [[ -z "${cursor}" || "${cursor}" == "null" ]]; then
      break
    fi
  done

  if [[ "${unresolved_total}" -gt 0 ]]; then
    echo "[pr-finalizer] FAIL: unresolved review threads: ${unresolved_total} (copilot-related: ${unresolved_copilot})" >&2
    if [[ "${#unresolved_samples[@]}" -gt 0 ]]; then
      echo "[pr-finalizer] Sample unresolved threads:" >&2
      local sample
      for sample in "${unresolved_samples[@]}"; do
        echo "  - ${sample}" >&2
      done
    fi
    fail "resolve all review threads, including Copilot feedback, then rerun finalizer"
  fi
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_clean_tree
run_local_verifications
require_gh_checks
require_review_threads_resolved

echo "[pr-finalizer] PASS: working tree, local checks, CI status checks, and review threads all pass"
