#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

TS="$(date +"%Y-%m-%dT%H-%M-%S%z")"
OUT_DIR="${ROOT}/tmp/pilot-evidence/phase-5.1/${TS}"
mkdir -p "$OUT_DIR"

log() { printf "\n==> %s\n" "$1"; }

run_and_capture() {
  local name="$1"
  shift
  local file="${OUT_DIR}/${name}.log"
  local tail_file="${OUT_DIR}/${name}.tail120.log"
  local exit_code
  log "RUN: $name"
  {
    echo "date: $(date -Is)"
    echo "cmd: $*"
    echo
    set +e
    "$@"
    exit_code=$?
    set -e
    echo
    echo "exit_code: $exit_code"
  } >"$file" 2>&1
  tail -n 120 "$file" >"$tail_file"
  if [[ "$exit_code" -eq 0 ]]; then
    log "OK: $name (log: $file)"
  else
    log "FAIL: $name (exit $exit_code, log: $file)"
  fi
  return "$exit_code"
}

# --- Preconditions ---
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "ERROR: Must be on 'main' (current: ${BRANCH})" >&2
  exit 1
fi

PORCELAIN="$(git status --porcelain)"
if [[ -n "$PORCELAIN" ]]; then
  echo "ERROR: Working tree not clean. git status --porcelain:" >&2
  echo "$PORCELAIN" >&2
  exit 1
fi

git fetch origin main --quiet
LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_MAIN_HEAD="$(git rev-parse origin/main)"
if [[ "$LOCAL_HEAD" != "$REMOTE_MAIN_HEAD" ]]; then
  echo "ERROR: local main is not synced with origin/main." >&2
  echo "local HEAD:  ${LOCAL_HEAD}" >&2
  echo "origin/main: ${REMOTE_MAIN_HEAD}" >&2
  exit 1
fi

# --- Baseline snapshot ---
{
  echo "phase: 5.1"
  echo "timestamp: ${TS}"
  echo "repo_root: ${ROOT}"
  echo "branch: ${BRANCH}"
  echo "git_head: $(git rev-parse HEAD)"
  echo "origin_main_head: ${REMOTE_MAIN_HEAD}"
  echo
  echo "git_status_porcelain:"
  git status --porcelain
  echo
  echo "node: $(node -v 2>/dev/null || echo 'n/a')"
  echo "pnpm: $(pnpm -v 2>/dev/null || echo 'n/a')"
} > "${OUT_DIR}/baseline.txt"

# --- Gates (must be in this order) ---
run_and_capture "01-m4-gatekeeper" bash scripts/m4-gatekeeper.sh
run_and_capture "02-pr-verify" pnpm pr:verify
run_and_capture "03-security-guard" pnpm security:guard
run_and_capture "04-e2e-gate" pnpm e2e:gate

log "PHASE 5.1 COMPLETE ✅"
echo "Evidence bundle: ${OUT_DIR}"
echo "Baseline: ${OUT_DIR}/baseline.txt"
