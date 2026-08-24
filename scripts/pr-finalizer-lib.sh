#!/usr/bin/env bash

PR_TYPE_DOCS_ONLY="docs-only"
PR_TYPE_RUNTIME="runtime"
pr_type="${PR_TYPE_RUNTIME}"
pr_type_reason="unclassified"
changed_files_path=""
changed_files_root=""
PR_FINALIZER_LIB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

trusted_event_pr_number() {
  local event_path="$1"
  (
    cd -- "${PR_FINALIZER_LIB_DIR}"
    node --input-type=module -e '
      import { readTrustedRunnerFile } from "./ci/trusted-runner-file.mjs";
      const event = JSON.parse(readTrustedRunnerFile(process.argv[1]));
      const number = event.pull_request?.number;
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw new Error("pull request number is missing from trusted event");
      }
      process.stdout.write(String(number));
    ' "${event_path}"
  ) || return 1
  return 0
}

collect_changed_files() {
  changed_files_root="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/pr-finalizer.XXXXXX")"
  changed_files_path="${changed_files_root}/changed-files.txt"
  if [[ -n "${GITHUB_EVENT_PATH:-}" && -f "${GITHUB_EVENT_PATH}" ]]; then
    RUNNER_TEMP="${RUNNER_TEMP:-${changed_files_root}}" \
      node scripts/ci/github-pr-files.mjs --event-path "${GITHUB_EVENT_PATH}" >"${changed_files_path}"
    return 0
  fi
  if command -v gh >/dev/null 2>&1; then
    local repo current_pr
    repo="${GITHUB_REPOSITORY:-}"
    [[ -n "${repo}" ]] || repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
    current_pr="${PR_NUMBER:-}"
    [[ -n "${current_pr}" ]] || current_pr="$(gh pr view --json number --jq '.number // empty' 2>/dev/null || true)"
    if [[ -n "${repo}" && -n "${current_pr}" ]]; then
      gh api --paginate "repos/${repo}/pulls/${current_pr}/files?per_page=100" --jq '.[].filename' >"${changed_files_path}"
      return 0
    fi
  fi
  git fetch --no-tags origin main --depth=1 >/dev/null 2>&1 || true
  git diff --name-only origin/main...HEAD >"${changed_files_path}" || true
  return 0
}

classify_pr() {
  collect_changed_files
  local output should_run reason
  if ! output="$(
    RUNNER_TEMP="${RUNNER_TEMP:-${changed_files_root}}" \
      node scripts/ci/validation-surface-policy.mjs \
      --event-name pull_request \
      --event-path "${GITHUB_EVENT_PATH:-}" \
      --changed-files-path "${changed_files_path}"
  )"; then
    rm -rf -- "${changed_files_root}"
    return 1
  fi
  rm -rf -- "${changed_files_root}"
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
  jq -r '.finalizerLeafPrerequisites[].context' "${PR_DELIVERY_CONTRACT}"
  return 0
}

required_check_records() {
  jq -e '
    .finalizerLeafPrerequisites
    | type == "array"
      and length > 0
      and all(.[];
        (.context | type) == "string"
        and (.context | length) > 0
        and (.appId | type) == "number"
        and .appId > 0)
  ' "${PR_DELIVERY_CONTRACT}" >/dev/null || return 1
  jq -r '.finalizerLeafPrerequisites[] | [.context, (.appId | tostring)] | @tsv' \
    "${PR_DELIVERY_CONTRACT}"
}

report_generator_delegation() {
  echo "[pr-finalizer] INFO: Sonar state is reported by governance monitoring; other generator states are also deferred to delivery-gate."
  return 0
}
