#!/usr/bin/env bash
set -uo pipefail

# CONFIGURATION
PROJECTS=${PROJECTS:-"ks-sq mk-mk"}
MODE=${MODE:-"golden"}
REPEAT=${REPEAT:-"1"}
MAX_FAIL=${MAX_FAIL:-"1"}
AUTO_STASH=${AUTO_STASH:-"false"}
AUTO_COMMIT=${AUTO_COMMIT:-"false"}
ALLOW_DIRTY=${ALLOW_DIRTY:-"true"}
AUTO_REVERT=${AUTO_REVERT:-"false"}
TRACK_REGRESSIONS=${TRACK_REGRESSIONS:-"true"}
BASELINE_FILE=".e2e_baseline_count"

WEB_DIR="apps/web"

timestamp() { date +"%Y%m%d-%H%M%S"; }

# GIT HELPERS
is_clean() {
  git diff --quiet && git diff --cached --quiet
}

ensure_clean_tree() {
  if ! is_clean; then
    if [ "$ALLOW_DIRTY" = "true" ]; then
        echo "⚠️  Working tree is dirty, but ALLOW_DIRTY=true. Proceeding..."
        return 0
    fi

    if [ "$AUTO_STASH" = "true" ]; then
      echo "⚠️  Working tree dirty. Auto-stashing..."
      git stash push -m "Auto-stash before E2E loop $(timestamp)"
    else
      echo "❌ Error: Working tree is dirty. Commit, stash, set ALLOW_DIRTY=true, or run with AUTO_STASH=true."
      git status --short
      exit 1
    fi
  fi
}

perform_auto_commit() {
  if [ "$AUTO_COMMIT" = "true" ] && is_clean; then
    echo "ℹ️  Nothing to commit (clean tree)."
  elif [ "$AUTO_COMMIT" = "true" ]; then
     echo "🏗️  Attempting auto-commit..."
     git add .
     git commit -m "chore(e2e): stabilize tests [MODE=$MODE]"
     echo "✅ Committed changes."
  fi
}

perform_revert() {
    echo "🔙 Regression detected or failure in strict mode. Reverting changes..."
    git checkout .
    git clean -fd
    echo "✅ Reverted to HEAD."
}

# TEST RUNNERS
clean_artifacts() {
  rm -rf "$WEB_DIR/test-results" "$WEB_DIR/playwright-report" "$WEB_DIR/e2e-results.json"
}

run_gatekeeper() {
  echo "🚧 Running M4 Gatekeeper (DB Reset & Seed)..."
  ./scripts/m4-gatekeeper.sh > /dev/null 2>&1 || echo "⚠️ Gatekeeper warning"
}

run_tests() {
  cd "$WEB_DIR"
  
  local max_fail_arg=""
  if [ -n "$MAX_FAIL" ] && [ "$MAX_FAIL" != "0" ]; then
    max_fail_arg="--max-failures=$MAX_FAIL"
  fi

  export PLAYWRIGHT_JSON_OUTPUT_NAME="e2e-results.json"

  if [ "$MODE" = "golden" ]; then
    echo "🚀 Running Golden Gate (Critical Flows)..."
    npx playwright test \
      e2e/multi-user-flow.spec.ts \
      e2e/claim-creation-traceability.spec.ts \
      e2e/branch-dashboard.spec.ts \
      e2e/member-number.spec.ts \
      $(for p in $PROJECTS; do echo --project="$p"; done) \
      $max_fail_arg \
      --repeat-each="$REPEAT" \
      --reporter=list,json || true 
  else
    echo "🔥 Running Full E2E Suite..."
    npx playwright test \
      $max_fail_arg \
      --repeat-each="$REPEAT" \
      --reporter=list,json || true
  fi
}

get_failure_count() {
    local results_path="apps/web/e2e-results.json"
    if [ ! -f "$results_path" ]; then
        echo "-1"
        return
    fi
    node -e "try { const r = require('./$results_path'); console.log(r.stats.unexpected); } catch(e) { console.log('999'); }"
}

find_latest_failure_bundle() {
  local dir="$WEB_DIR/test-results"
  if [ ! -d "$dir" ]; then return 0; fi
  ls -1dt "$dir"/* 2>/dev/null | head -n 1 || true
}

# PROMPT GENERATOR
print_flash_prompt() {
  local bundle="$1"
  echo "GEMINI FLASH PROMPT"
  echo "Task: Fix failing tests."
  echo "Artifacts: $bundle"
}

print_success_checklist() {
  echo "🏆 SUCCESS CHECKLIST"
  echo "✅ Critical flows: GREEN (Mode: $MODE)"
}

#MAIN
main() {
  echo "== E2E Golden Loop $(timestamp) =="  
  ensure_clean_tree
  clean_artifacts
  run_gatekeeper

  if [ ! -f "$BASELINE_FILE" ]; then
     echo "9999" > "$BASELINE_FILE"
  fi
  local prev_failures
  prev_failures=$(cat "$BASELINE_FILE")

  (run_tests)
  
  local current_failures
  current_failures=$(get_failure_count)
  
  echo "📊 Status: Current Failures: $current_failures (Previous Best: $prev_failures)"

  if [ "$current_failures" -eq "-1" ]; then
      echo "❌ ERROR: Tests failed to execute or produce results."
      exit 1
  fi

  if [ "$current_failures" -eq 0 ]; then
    echo "✅ SUCCESS: All tests passed."
    echo "0" > "$BASELINE_FILE"
    print_success_checklist
    perform_auto_commit
    exit 0
  fi

  if [ "$TRACK_REGRESSIONS" = "true" ]; then
      if [ "$current_failures" -gt "$prev_failures" ]; then
          echo "⚠️ REGRESSION DETECTED: Failures increased from $prev_failures to $current_failures."
          if [ "$AUTO_REVERT" = "true" ]; then
              perform_revert
              echo "🔄 Reverted. Try a different fix."
              exit 1
          fi
      elif [ "$current_failures" -lt "$prev_failures" ]; then
          echo "📉 IMPROVEMENT: Failures decreased from $prev_failures to $current_failures."
          echo "$current_failures" > "$BASELINE_FILE"
          perform_auto_commit
      else
           echo "Hz Same number of failures."
      fi
  fi

  echo "❌ FAILURE: $current_failures tests failed."
  bundle=$(find_latest_failure_bundle)
  if [ -n "${bundle:-}" ]; then
    print_flash_prompt "$bundle"
  fi

  exit 1
}

main "$@"
