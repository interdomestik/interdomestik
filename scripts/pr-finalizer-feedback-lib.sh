#!/usr/bin/env bash

PR_DELIVERY_CONTRACT="${PR_DELIVERY_CONTRACT:-scripts/ci/pr-delivery-contract.json}"

defer_async_generators() {
  local count
  count="$(jq '[.deliveryPrerequisites[] | select(.classification == "generator")] | length' \
    "${PR_DELIVERY_CONTRACT}")"
  [[ "${count}" -gt 0 ]] || fail "delivery contract has no generator declarations"
  report_generator_delegation
  echo "[pr-finalizer] INFO: ${count} generator contexts defer to delivery-gate."
  return 0
}

require_review_threads_resolved() {
  local token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  [[ -n "${token}" ]] && export GH_TOKEN="${token}"
  command -v gh >/dev/null 2>&1 || fail "GitHub CLI is required for review-thread validation"
  command -v jq >/dev/null 2>&1 || fail "jq is required for review-thread validation"

  local number repo owner name cursor="" unresolved=0
  number="$(pr_context)"
  [[ "${number}" =~ ^[1-9][0-9]*$ ]] || fail "unable to resolve PR for review threads"
  repo="${GITHUB_REPOSITORY:-}"
  [[ -n "${repo}" ]] || repo="$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)"
  owner="${repo%%/*}"
  name="${repo##*/}"
  [[ -n "${owner}" && -n "${name}" ]] || fail "unable to resolve repository for review threads"

  local query
  query='query($owner:String!,$repo:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){pageInfo{hasNextPage endCursor}nodes{isResolved}}}}}'
  while true; do
    local response page
    if [[ -n "${cursor}" ]]; then
      response="$(gh api graphql -f query="${query}" -f owner="${owner}" -f repo="${name}" -F number="${number}" -f cursor="${cursor}")"
    else
      response="$(gh api graphql -f query="${query}" -f owner="${owner}" -f repo="${name}" -F number="${number}")"
    fi
    page="$(echo "${response}" | jq '.data.repository.pullRequest.reviewThreads')"
    [[ "${page}" != "null" ]] || fail "unable to read review threads"
    unresolved=$((unresolved + $(echo "${page}" | jq '[.nodes[] | select(.isResolved == false)] | length')))
    [[ "$(echo "${page}" | jq -r '.pageInfo.hasNextPage')" == "true" ]] || break
    cursor="$(echo "${page}" | jq -r '.pageInfo.endCursor')"
    [[ -n "${cursor}" && "${cursor}" != "null" ]] || fail "review-thread pagination cursor missing"
  done
  [[ "${unresolved}" -eq 0 ]] || fail "unresolved review threads: ${unresolved}"
  return 0
}
