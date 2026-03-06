#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_ID="${GITHUB_RUN_ID:-local-$(date +%Y%m%d%H%M%S)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-tmp/pilot-evidence/${RUN_ID}}"
LOG_DIR="${EVIDENCE_DIR}/logs"
NOTES_DIR="${EVIDENCE_DIR}/notes"
QG_JSON="${LOG_DIR}/sonar-qualitygate.json"
SUMMARY_MD="${NOTES_DIR}/sonar-summary.md"
SCAN_LOG="${LOG_DIR}/sonar-scan.log"

mkdir -p "$LOG_DIR" "$NOTES_DIR"

if [[ -n "${GITHUB_TOKEN:-}" && -z "${GH_TOKEN:-}" ]]; then
  export GH_TOKEN="${GITHUB_TOKEN}"
fi

required_vars=(GH_TOKEN GITHUB_REPOSITORY SONAR_CHECK_SHA)
missing=()
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "Missing required GitHub check-run configuration: ${missing[*]}" | tee "$SUMMARY_MD"
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required for Sonar check-run gating" | tee "$SUMMARY_MD"
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for Sonar check-run gating" | tee "$SUMMARY_MD"
  exit 2
fi

check_name="${SONAR_CHECK_NAME:-SonarCloud Code Analysis}"
check_sha="${SONAR_CHECK_SHA}"
repo="${GITHUB_REPOSITORY}"
max_retries="${SONAR_CHECK_MAX_RETRIES:-60}"
retry_delay_seconds="${SONAR_CHECK_RETRY_DELAY_SECONDS:-10}"

for attempt in $(seq 1 "${max_retries}"); do
  checks_json="$(gh api -H "Accept: application/vnd.github+json" "repos/${repo}/commits/${check_sha}/check-runs?filter=latest&per_page=100")"
  matching_checks="$(echo "${checks_json}" | jq --arg NAME "${check_name}" '[.check_runs[] | select((.name // .workflow_name // "") == $NAME)]')"
  check_count="$(echo "${matching_checks}" | jq 'length')"

  if [[ "${check_count}" -eq 0 ]]; then
    if [[ "${attempt}" -ge "${max_retries}" ]]; then
      {
        echo "# Sonar Summary"
        echo
        echo "- source: GitHub check run"
        echo "- check_name: ${check_name}"
        echo "- sha: ${check_sha}"
        echo "- result: FAIL"
        echo "- reason: check run not present after ${max_retries} attempts"
      } >"${SUMMARY_MD}"
      exit 1
    fi

    echo "[sonar-check-run-gate] waiting for '${check_name}' on ${check_sha} (${attempt}/${max_retries})" | tee -a "${SCAN_LOG}"
    sleep "${retry_delay_seconds}"
    continue
  fi

  selected_check="$(echo "${matching_checks}" | jq 'sort_by(.started_at // .created_at // "") | last')"
  echo "${selected_check}" >"${QG_JSON}"

  status="$(echo "${selected_check}" | jq -r '.status // "unknown"')"
  conclusion="$(echo "${selected_check}" | jq -r '.conclusion // ""')"
  details_url="$(echo "${selected_check}" | jq -r '.details_url // empty')"

  {
    echo "# Sonar Summary"
    echo
    echo "- source: GitHub check run"
    echo "- check_name: ${check_name}"
    echo "- sha: ${check_sha}"
    echo "- status: ${status}"
    echo "- conclusion: ${conclusion:-pending}"
    if [[ -n "${details_url}" ]]; then
      echo "- details_url: ${details_url}"
    fi
  } >"${SUMMARY_MD}"

  if [[ "${status}" != "completed" ]]; then
    if [[ "${attempt}" -ge "${max_retries}" ]]; then
      exit 1
    fi

    echo "[sonar-check-run-gate] '${check_name}' still ${status} (${attempt}/${max_retries})" | tee -a "${SCAN_LOG}"
    sleep "${retry_delay_seconds}"
    continue
  fi

  if [[ "${conclusion}" == "success" ]]; then
    echo "[sonar-check-run-gate] '${check_name}' passed for ${check_sha}" | tee -a "${SCAN_LOG}"
    exit 0
  fi

  echo "[sonar-check-run-gate] '${check_name}' completed with conclusion '${conclusion}'" | tee -a "${SCAN_LOG}"
  exit 1
done

exit 1
