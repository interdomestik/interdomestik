#!/usr/bin/env bash
set -euo pipefail

PR_REF=""
WATCH=0
INTERVAL=20
REQUIRED_ONLY=1
FAIL_FAST=0

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/ci-monitor-agent.sh [options]

Monitors GitHub PR checks and prints the first failing block when present.

Options:
  --pr <number|url|branch>  PR selector (default: current branch PR)
  --watch                   Poll until checks finish (or fail with --fail-fast)
  --interval <seconds>      Poll interval in watch mode (default: 20)
  --all                     Include non-required checks
  --required                Monitor only required checks (default)
  --fail-fast               In watch mode, exit immediately on first failure
  -h, --help                Show this help

Exit codes:
  0  all checks passed
  1  at least one check failed
  8  checks still pending (non-watch mode)
USAGE
}

fail() {
  printf '[ci-monitor-agent] FAIL: %s\n' "$1" >&2
  exit 2
}

require_tools() {
  command -v gh >/dev/null 2>&1 || fail 'gh CLI is required'
  command -v jq >/dev/null 2>&1 || fail 'jq is required'
}

fetch_checks_json() {
  local -a cmd=(gh pr checks)
  if [[ -n "$PR_REF" ]]; then
    cmd+=("$PR_REF")
  fi
  if [[ "$REQUIRED_ONLY" -eq 1 ]]; then
    cmd+=(--required)
  fi
  cmd+=(--json bucket,completedAt,description,link,name,startedAt,state,workflow)

  local output status
  set +e
  output="$(${cmd[@]} 2>&1)"
  status=$?
  set -e

  if [[ "$status" -ne 0 && "$status" -ne 8 ]]; then
    printf '%s\n' "$output" >&2
    fail 'gh pr checks command failed'
  fi

  if ! printf '%s' "$output" | jq empty >/dev/null 2>&1; then
    printf '%s\n' "$output" >&2
    fail 'gh returned non-JSON output'
  fi

  printf '%s' "$output"
}

print_first_fail() {
  local json="$1"
  local first_fail
  first_fail="$(printf '%s' "$json" | jq -r '[.[] | select(.bucket == "fail")][0]')"

  if [[ -z "$first_fail" || "$first_fail" == "null" ]]; then
    return 0
  fi

  printf '\n[ci-monitor-agent] First failing error block:\n'
  printf '%s\n' "$first_fail" | jq -r '(
    "- check: " + (.name // "unknown") + "\n" +
    "- state: " + (.state // "unknown") + "\n" +
    "- workflow: " + (.workflow // "unknown") + "\n" +
    "- details: " + (.link // "n/a") + "\n" +
    "- description: " + ((.description // "(no description)") | gsub("\\n"; " "))
  )'
}

print_snapshot() {
  local json="$1"
  local fail_count pending_count pass_count skip_count cancel_count

  fail_count="$(printf '%s' "$json" | jq '[.[] | select(.bucket == "fail")] | length')"
  pending_count="$(printf '%s' "$json" | jq '[.[] | select(.bucket == "pending")] | length')"
  pass_count="$(printf '%s' "$json" | jq '[.[] | select(.bucket == "pass")] | length')"
  skip_count="$(printf '%s' "$json" | jq '[.[] | select(.bucket == "skipping")] | length')"
  cancel_count="$(printf '%s' "$json" | jq '[.[] | select(.bucket == "cancel")] | length')"

  printf '\n[ci-monitor-agent] snapshot: pass=%s fail=%s pending=%s skipped=%s canceled=%s\n' \
    "$pass_count" "$fail_count" "$pending_count" "$skip_count" "$cancel_count"

  printf '%s' "$json" | jq -r '.[] | "  - [" + (.bucket // "?") + "] " + (.name // "unknown") + " (" + (.state // "unknown") + ")"'

  if [[ "$fail_count" -gt 0 ]]; then
    print_first_fail "$json"
    return 1
  fi

  if [[ "$pending_count" -gt 0 ]]; then
    return 8
  fi

  return 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --pr)
      [[ $# -ge 2 ]] || fail 'missing value for --pr'
      PR_REF="$2"
      shift 2
      ;;
    --watch)
      WATCH=1
      shift
      ;;
    --interval)
      [[ $# -ge 2 ]] || fail 'missing value for --interval'
      INTERVAL="$2"
      shift 2
      ;;
    --all)
      REQUIRED_ONLY=0
      shift
      ;;
    --required)
      REQUIRED_ONLY=1
      shift
      ;;
    --fail-fast)
      FAIL_FAST=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
 done

require_tools

while true; do
  json="$(fetch_checks_json)"

  if print_snapshot "$json"; then
    printf '\n[ci-monitor-agent] PASS: all monitored checks are green\n'
    exit 0
  fi

  status=$?
  if [[ "$status" -eq 1 ]]; then
    if [[ "$WATCH" -eq 1 && "$FAIL_FAST" -eq 0 ]]; then
      printf '[ci-monitor-agent] checks are failing; continuing monitor in %ss\n' "$INTERVAL"
      sleep "$INTERVAL"
      continue
    fi

    exit 1
  fi

  if [[ "$WATCH" -eq 0 ]]; then
    printf '\n[ci-monitor-agent] checks still pending\n'
    exit 8
  fi

  printf '[ci-monitor-agent] checks pending; next poll in %ss\n' "$INTERVAL"
  sleep "$INTERVAL"
done
