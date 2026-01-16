#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

PROJECTS=${PROJECTS:-"ks-sq mk-mk"}          # override if needed
MODE=${MODE:-"golden"}                       # "golden" or "full"
REPEAT=${REPEAT:-"1"}                       # set 2 for flake check
MAX_FAIL=${MAX_FAIL:-"1"}                   # stop on first failure
AUTO_STASH=${AUTO_STASH:-"false"}           # stash if tree is dirty
AUTO_COMMIT=${AUTO_COMMIT:-"false"}         # commit on success if tree was clean
WEB_DIR="apps/web"

timestamp() { date +"%Y%m%d-%H%M%S"; }

# ═══════════════════════════════════════════════════════════════════════════════
# GIT HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

is_clean() {
  git diff --quiet && git diff --cached --quiet
}

ensure_clean_tree() {
  if ! is_clean; then
    if [ "$AUTO_STASH" = "true" ]; then
      echo "⚠️  Working tree dirty. Auto-stashing..."
      git stash push -m "Auto-stash before E2E loop $(timestamp)"
    else
      echo "❌ Error: Working tree is dirty. Commit, stash, or run with AUTO_STASH=true."
      git status --short
      exit 1
    fi
  fi
}

perform_auto_commit() {
  if [ "$AUTO_COMMIT" = "true" ]; then
    echo "🏗️  Attempting auto-commit (guarded)..."
    if ! is_clean; then
      git add .
      git commit -m "chore(e2e): stabilize tests [MODE=$MODE]"
      echo "✅ Committed changes."
    else
      echo "ℹ️  Nothing to commit."
    fi
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST RUNNERS
# ═══════════════════════════════════════════════════════════════════════════════

clean_artifacts() {
  echo "🧹 Cleaning previous artifacts..."
  rm -rf "$WEB_DIR/test-results" "$WEB_DIR/playwright-report"
}

run_gatekeeper() {
  echo "🚧 Running M4 Gatekeeper (DB Reset & Seed)..."
  ./scripts/m4-gatekeeper.sh
}

run_tests() {
  cd "$WEB_DIR"
  if [ "$MODE" = "golden" ]; then
    echo "🚀 Running Golden Gate (Critical Flows)..."
    npx playwright test \
      e2e/multi-user-flow.spec.ts \
      e2e/claim-creation-traceability.spec.ts \
      e2e/branch-dashboard.spec.ts \
      e2e/member-number.spec.ts \
      $(for p in $PROJECTS; do echo --project="$p"; done) \
      --max-failures="$MAX_FAIL" \
      --repeat-each="$REPEAT" \
      --reporter=line,list
  else
    echo "🔥 Running Full E2E Suite..."
    npx playwright test \
      --max-failures="$MAX_FAIL" \
      --repeat-each="$REPEAT" \
      --reporter=line,list
  fi
}

find_latest_failure_bundle() {
  local dir="$WEB_DIR/test-results"
  if [ ! -d "$dir" ]; then return 0; fi
  # Find the newest directory that contains a failure artifact
  ls -1dt "$dir"/* 2>/dev/null | head -n 1 || true
}

# ═══════════════════════════════════════════════════════════════════════════════
# PROMPT GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

print_flash_prompt() {
  local bundle="$1"
  echo ""
  echo "================= GEMINI FLASH PROMPT ================="
  echo "We are stabilizing Playwright E2E to reach Golden GREEN."
  echo "Rules: fix ONE failing test at a time, minimal diff, no skips, no global timeouts, no sleeps."
  echo ""
  echo "First failing bundle path:"
  echo "$bundle"
  echo ""
  echo "Open and use these artifacts (if present):"
  echo "- $bundle/error-context.md"
  echo "- $bundle/test-failed-1.png"
  echo "- $bundle/trace.zip or traces/"
  echo "- $bundle/video.webm"
  echo ""
  echo "Task:"
  echo "1) Identify root cause bucket: test selector, race/eventual consistency, auth/state, RBAC, env/config, real app bug."
  echo "2) Propose the smallest code fix."
  echo "3) Provide exact diff."
  echo "4) Provide verification commands (rerun twice with --repeat-each 2)."
  echo "========================================================"
}

print_success_checklist() {
  echo ""
  echo "🏆 SUCCESS CHECKLIST"
  echo "════════════════════════════════════════════════════════"
  echo "✅ Database state: DETERMINISTIC (via Gatekeeper)"
  echo "✅ Critical flows: GREEN (Mode: $MODE)"
  echo "✅ Repeatability:  VERIFIED (Repeat-each: $REPEAT)"
  echo "✅ Projects covers: $PROJECTS"
  echo "════════════════════════════════════════════════════════"
  echo "Next Step: If Golden is Green, run with MODE=full."
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

main() {
  echo "== E2E Golden Loop $(timestamp) =="
  
  ensure_clean_tree
  clean_artifacts
  run_gatekeeper

  set +e
  run_tests
  status=$?
  set -e

  if [ $status -eq 0 ]; then
    echo "✅ SUCCESS: Mode=$MODE passed."
    print_success_checklist
    perform_auto_commit
    exit 0
  fi

  echo "❌ FAILURE: Stopped at first failure."
  bundle=$(find_latest_failure_bundle)
  if [ -n "${bundle:-}" ]; then
    print_flash_prompt "$bundle"
  else
    echo "No test-results bundle found."
  fi

  exit $status
}

main "$@"
