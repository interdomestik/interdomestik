#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PR_REF=""
PUSH_BRANCH=1
RUN_PR_FINALIZE=1
RUN_CI_MONITOR=1
WATCH_CI=0
CI_INTERVAL=20

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/finalizer-agent.sh [options]

Runs PR closeout flow as a dedicated finalizer agent:
  1) verifies clean tree + branch context
  2) pushes current branch
  3) runs pnpm pr:finalize
  4) snapshots required CI status

Options:
  --pr <number|url|branch>  PR selector for CI monitor (default: current branch PR)
  --skip-push               Do not push branch
  --skip-pr-finalize        Do not run pnpm pr:finalize
  --skip-ci-monitor         Do not run CI monitor snapshot
  --watch-ci                Keep CI monitor running until complete
  --ci-interval <seconds>   CI watch interval (default: 20)
  -h, --help                Show this help
USAGE
}

fail() {
  printf '[finalizer-agent] FAIL: %s\n' "$1" >&2
  exit 1
}

run_step() {
  local label="$1"
  shift
  printf '\n[finalizer-agent] %s\n' "$label"
  "$@"
}

print_context() {
  if [[ -n "${MULTI_AGENT_CONTEXT_BUNDLE:-}" && -f "${MULTI_AGENT_CONTEXT_BUNDLE:-}" ]]; then
    printf '[finalizer-agent] context-bundle=%s\n' "$MULTI_AGENT_CONTEXT_BUNDLE"
    printf '[finalizer-agent] context-files=%s\n' "${MULTI_AGENT_CONTEXT_FILES:-unknown}"
  else
    printf '[finalizer-agent] context-bundle=none\n'
  fi
}

require_clean_tree() {
  if ! git -C "$ROOT_DIR" diff --quiet --no-ext-diff --ignore-submodules --exit-code; then
    fail 'working tree has unstaged changes'
  fi

  if ! git -C "$ROOT_DIR" diff --cached --quiet --no-ext-diff --ignore-submodules --exit-code; then
    fail 'working tree has staged but uncommitted changes'
  fi
}

push_current_branch() {
  local branch
  branch="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"

  if [[ "$branch" == "HEAD" ]]; then
    fail 'detached HEAD; cannot push'
  fi

  if [[ "$branch" == "main" || "$branch" == "master" ]]; then
    fail "refusing to run finalizer from protected branch '$branch'"
  fi

  if git -C "$ROOT_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    run_step "push branch ($branch)" git -C "$ROOT_DIR" push
  else
    run_step "push branch with upstream ($branch)" git -C "$ROOT_DIR" push -u origin "$branch"
  fi
}

run_ci_monitor() {
  local -a cmd=(bash "$ROOT_DIR/scripts/multi-agent/ci-monitor-agent.sh" --required)
  if [[ -n "$PR_REF" ]]; then
    cmd+=(--pr "$PR_REF")
  fi
  if [[ "$WATCH_CI" -eq 1 ]]; then
    cmd+=(--watch --interval "$CI_INTERVAL")
  fi

  run_step 'CI monitor snapshot' "${cmd[@]}"
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
    --skip-push)
      PUSH_BRANCH=0
      shift
      ;;
    --skip-pr-finalize)
      RUN_PR_FINALIZE=0
      shift
      ;;
    --skip-ci-monitor)
      RUN_CI_MONITOR=0
      shift
      ;;
    --watch-ci)
      WATCH_CI=1
      shift
      ;;
    --ci-interval)
      [[ $# -ge 2 ]] || fail 'missing value for --ci-interval'
      CI_INTERVAL="$2"
      shift 2
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

print_context
run_step 'verify clean working tree' require_clean_tree

if [[ "$PUSH_BRANCH" -eq 1 ]]; then
  push_current_branch
else
  printf '[finalizer-agent] skip push\n'
fi

if [[ "$RUN_PR_FINALIZE" -eq 1 ]]; then
  run_step 'pnpm pr:finalize' bash -lc "cd '$ROOT_DIR' && pnpm pr:finalize"
else
  printf '[finalizer-agent] skip pnpm pr:finalize\n'
fi

if [[ "$RUN_CI_MONITOR" -eq 1 ]]; then
  run_ci_monitor
else
  printf '[finalizer-agent] skip CI monitor\n'
fi

printf '\n[finalizer-agent] PASS\n'
