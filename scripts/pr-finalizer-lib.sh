#!/usr/bin/env bash

PR_TYPE_DOCS_ONLY="docs-only"
PR_TYPE_RUNTIME="runtime"
pr_type="${PR_TYPE_RUNTIME}"
pr_type_reason="unclassified"
changed_files_path=""

collect_changed_files() {
  changed_files_path="$(mktemp)"
  if [[ -n "${GITHUB_EVENT_PATH:-}" && -f "${GITHUB_EVENT_PATH}" ]]; then
    node scripts/ci/github-pr-files.mjs --event-path "${GITHUB_EVENT_PATH}" >"${changed_files_path}"
    return 0
  fi
  if [[ -n "${PR_NUMBER:-}" ]]; then
    gh pr view "${PR_NUMBER}" --json files --jq '.files[].path' >"${changed_files_path}"
    return 0
  fi
  if gh pr view --json files --jq '.files[].path' >"${changed_files_path}" 2>/dev/null; then
    return 0
  fi
  git fetch --no-tags origin main --depth=1 >/dev/null 2>&1 || true
  git diff --name-only origin/main...HEAD >"${changed_files_path}" || true
  return 0
}

classify_pr() {
  collect_changed_files
  local output should_run reason
  output="$(
    node scripts/ci/validation-surface-policy.mjs \
      --event-name pull_request \
      --event-path "${GITHUB_EVENT_PATH:-}" \
      --changed-files-path "${changed_files_path}"
  )"
  should_run="$(echo "${output}" | awk -F= '$1 == "should_run" { print $2 }')"
  reason="$(echo "${output}" | awk -F= '$1 == "reason" { print $2 }')"
  if [[ "${should_run}" == "false" ]]; then
    pr_type="${PR_TYPE_DOCS_ONLY}"
  else
    pr_type="${PR_TYPE_RUNTIME}"
  fi
  pr_type_reason="${reason:-unknown}"
  echo "[pr-finalizer] INFO: classified PR as ${pr_type} (${pr_type_reason})"
  return 0
}

run_local_verifications() {
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "[pr-finalizer] INFO: skipping local type-check/test in CI; required checks cover them."
    return 0
  fi
  if [[ "${pr_type}" == "${PR_TYPE_DOCS_ONLY}" ]]; then
    run_step "git diff --check" git diff --check
    echo "[pr-finalizer] INFO: docs-only PR; skipping runtime local type-check/test."
    return 0
  fi
  run_step "pnpm type-check" pnpm type-check
  run_step "pnpm test" pnpm test
  return 0
}

required_check_names() {
  printf '%s\n' "${required_checks[@]}"
  return 0
}

require_feedback_checks_green() {
  local checks_json="$1"
  local feedback_pattern="vercel"
  local feedback_failures
  if [[ "${pr_type}" != "${PR_TYPE_DOCS_ONLY}" ]]; then
    feedback_pattern="sonar|vercel"
  fi
  feedback_failures="$(
    echo "${checks_json}" | jq -r --arg PATTERN "${feedback_pattern}" '
      .check_runs
      | map(select((.name // .workflow_name // "") | test($PATTERN; "i")))
      | map(select(
          (.status // "" | ascii_downcase) != "completed"
          or ((.conclusion // "" | ascii_downcase) as $conclusion
            | ["success", "skipped", "neutral"] | index($conclusion) | not)
        ))
      | .[]
      | "- " + (.name // .workflow_name // "unknown") + " status=" + (.status // "unknown") + " conclusion=" + (.conclusion // "pending")
    '
  )"
  if [[ -n "${feedback_failures}" ]]; then
    echo "[pr-finalizer] FAIL: non-green feedback checks:" >&2
    echo "${feedback_failures}" >&2
    fail "Sonar/Vercel feedback checks must be green or cleanly skipped"
  fi
  return 0
}
sonar_urlencode() {
  local value="$1"
  jq -nr --arg value "${value}" '$value | @uri'
  return 0
}
fetch_sonar_json() {
  local url="$1"
  local auth_header
  auth_header="$(printf '%s:' "${SONAR_TOKEN}" | base64 | tr -d '\n')"
  curl -fsS -H "Authorization: Basic ${auth_header}" -H "Accept: application/json" "${url}"
  return 0
}

require_sonar_clean() {
  local host="${SONAR_HOST_URL:-}"
  local project="${SONAR_PROJECT_KEY:-}"
  if [[ "${pr_type}" == "${PR_TYPE_DOCS_ONLY}" ]]; then
    echo "[pr-finalizer] INFO: docs-only PR; skipping Sonar issue/hotspot API validation."
    return 0
  fi
  if [[ "${GITHUB_ACTIONS:-}" == "true" && "${PR_FINALIZER_SKIP_CHECK_POLLING:-true}" != "false" ]]; then
    echo "[pr-finalizer] INFO: CI run; Sonar state is reported by governance monitoring."
    return 0
  fi
  if [[ -z "${SONAR_TOKEN:-}" || -z "${host}" || -z "${project}" ]]; then
    echo "[pr-finalizer] WARN: Sonar issue/hotspot API validation skipped; missing Sonar configuration."
    return 0
  fi
  local pr_number project_q pr_q issues_json hotspots_json issue_count hotspot_count
  pr_number="$(pr_context)"
  if [[ -z "${pr_number}" || "${pr_number}" == "null" ]]; then
    fail "unable to resolve pull request number for Sonar validation"
  fi
  project_q="$(sonar_urlencode "${project}")"
  pr_q="$(sonar_urlencode "${pr_number}")"
  issues_json="$(fetch_sonar_json "${host%/}/api/issues/search?componentKeys=${project_q}&pullRequest=${pr_q}&resolved=false&ps=1")"
  hotspots_json="$(fetch_sonar_json "${host%/}/api/hotspots/search?projectKey=${project_q}&pullRequest=${pr_q}&status=TO_REVIEW&ps=1")"
  issue_count="$(echo "${issues_json}" | jq -r '(.total // .paging.total // 0)')"
  hotspot_count="$(echo "${hotspots_json}" | jq -r '(.total // .paging.total // 0)')"
  [[ "${issue_count}" == "0" ]] || fail "Sonar has ${issue_count} unresolved open issue(s)"
  [[ "${hotspot_count}" == "0" ]] || fail "Sonar has ${hotspot_count} open security hotspot(s)"
  echo "[pr-finalizer] INFO: Sonar open issues=0 and open hotspots=0"
  return 0
}
