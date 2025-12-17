#!/bin/bash

# start-10x-task.sh
# Enhanced Interactive CLI for "10x Coding" tasks with structured context,
# testing requirements, QA baselines, and professional workflow.
#
# Usage: ./scripts/start-10x-task.sh [task_name] [related_files...]
# Env vars:
#   SKIP_BASELINE=1  Skip QA baseline capture (for exploration tasks)
#   NON_INTERACTIVE=1  Run with defaults, no prompts (or use --non-interactive flag)

# ═══════════════════════════════════════════════════════════════════════════════
# STRICT MODE (with controlled error handling for baseline captures)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# Resolve script directory for consistent paths (works from any cwd)
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Detect non-interactive/CI mode (can be forced with NON_INTERACTIVE=1)
if [[ -n "${CI:-}" || ! -t 0 || -n "${NON_INTERACTIVE:-}" ]]; then
    NON_INTERACTIVE=1
else
    NON_INTERACTIVE="${NON_INTERACTIVE:-}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION - Customize these for your repo
# ═══════════════════════════════════════════════════════════════════════════════
TASK_DIR="$REPO_ROOT/.agent/tasks"
TASK_FILE="$TASK_DIR/current_task.md"
ARCHIVE_DIR="$TASK_DIR/archive"
LOG_DIR="$TASK_DIR/logs"
MCP_ALIASES_SCRIPT="$REPO_ROOT/scripts/generate-mcp-aliases.sh"
CONSTRAINTS_FILE="$REPO_ROOT/.agent/constraints.md"

# Commands - customize per repo (override via env)
LINT_CMD="${LINT_CMD:-pnpm lint}"
TYPECHECK_CMD="${TYPECHECK_CMD:-pnpm type-check}"
TYPECHECK_FALLBACK_CMD="${TYPECHECK_FALLBACK_CMD:-pnpm typecheck}"
TEST_CMD="${TEST_CMD:-pnpm --filter @interdomestik/web test:unit --run}"
E2E_SMOKE_CMD="${E2E_SMOKE_CMD:-pnpm --filter @interdomestik/web test:e2e -- --grep smoke}"
BUILD_CMD="${BUILD_CMD:-pnpm build}"
FULL_CHECK_CMD="${FULL_CHECK_CMD:-pnpm qa:full}"
FORMAT_CMD="${FORMAT_CMD:-pnpm prettier --check}"
PARSED_ARGS=()

# ═══════════════════════════════════════════════════════════════════════════════
# COLORS
# ═══════════════════════════════════════════════════════════════════════════════
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color
else
RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; MAGENTA=''; BOLD=''; DIM=''; NC='';
fi

# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════
prompt_with_default() {
    # Usage: prompt_with_default VAR "Prompt" "default"
    local __var_name="$1"; shift
    local __prompt="$1"; shift
    local __default="$1"

    if [[ -n "${NON_INTERACTIVE:-}" ]]; then
        printf -v "$__var_name" "%s" "$__default"
        return
    fi

    echo -n -e "$__prompt"
    read "$__var_name"
    if [[ -z "${!__var_name:-}" ]]; then
        printf -v "$__var_name" "%s" "$__default"
    fi
}

escape_yaml() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    echo "$value"
}

print_snippet() {
    # Print a small snippet from a log file for quick context
    local file="$1"
    local lines="${2:-10}"
    if [[ -s "$file" ]]; then
        echo -e "      ${DIM}--- snippet ---${NC}"
        head -n "$lines" "$file" | sed 's/^/      /'
        echo -e "      ${DIM}---------------${NC}"
    fi
}

print_header() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}🚀 10x CODING TASK INITIALIZER${NC}                              ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}▸${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✖${NC} $1"
}

print_info() {
    echo -e "${DIM}ℹ${NC} $1"
}

parse_args() {
    local args=()
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-baseline) SKIP_BASELINE=1; shift ;;
            --run-full-checks) RUN_FULL_CHECKS="Y"; shift ;;
            --no-full-checks) RUN_FULL_CHECKS="N"; shift ;;
            --non-interactive|--yes|--y) NON_INTERACTIVE=1; shift ;;
            --allow-dirty) ALLOW_DIRTY=1; shift ;;
            -h|--help)
                echo "Usage: ./scripts/start-10x-task.sh [--non-interactive] [--allow-dirty] [--no-baseline] [--run-full-checks|--no-full-checks] [task_name] [related_files...]"
                exit 0
                ;;
            --) shift; args+=("$@"); break ;;
            *) args+=("$1"); shift ;;
        esac
    done
    PARSED_ARGS=("${args[@]}")
}

run_optional_full_checks() {
    if [[ -n "${RUN_FULL_CHECKS:-}" ]]; then
        RUN_FULL="$RUN_FULL_CHECKS"
    else
        prompt_with_default RUN_FULL "${CYAN}Run full checks now? (lint/format/typecheck/unit/smoke/build) [y/N]: ${NC}" "N"
    fi
    if [[ "$RUN_FULL" != "y" && "$RUN_FULL" != "Y" ]]; then
        return
    fi

    echo ""
    print_step "Running full checks..."
    local ALL_OK=1

    set +e
    echo -n -e "   ${DIM}Lint...${NC} "
    $LINT_CMD >/dev/null 2>&1
    LINT_EXIT=$?
    [[ $LINT_EXIT -eq 0 ]] && echo -e "${GREEN}✓${NC}" || { echo -e "${YELLOW}⚠${NC} (exit $LINT_EXIT)"; ALL_OK=0; }

    echo -n -e "   ${DIM}Format...${NC} "
    $FORMAT_CMD >/dev/null 2>&1
    FORMAT_EXIT=$?
    [[ $FORMAT_EXIT -eq 0 ]] && echo -e "${GREEN}✓${NC}" || { echo -e "${YELLOW}⚠${NC} (exit $FORMAT_EXIT)"; ALL_OK=0; }

    echo -n -e "   ${DIM}Typecheck...${NC} "
    $TYPECHECK_CMD >/dev/null 2>&1
    TC_EXIT=$?
    [[ $TC_EXIT -eq 0 ]] && echo -e "${GREEN}✓${NC}" || { echo -e "${YELLOW}⚠${NC} (exit $TC_EXIT)"; ALL_OK=0; }

    echo -n -e "   ${DIM}Unit tests...${NC} "
    $TEST_CMD >/dev/null 2>&1
    UT_EXIT=$?
    [[ $UT_EXIT -eq 0 ]] && echo -e "${GREEN}✓${NC}" || { echo -e "${YELLOW}⚠${NC} (exit $UT_EXIT)"; ALL_OK=0; }

    echo -n -e "   ${DIM}Smoke E2E...${NC} "
    $E2E_SMOKE_CMD >/dev/null 2>&1
    E2E_EXIT=$?
    [[ $E2E_EXIT -eq 0 ]] && echo -e "${GREEN}✓${NC}" || { echo -e "${YELLOW}⚠${NC} (exit $E2E_EXIT)"; ALL_OK=0; }

    echo -n -e "   ${DIM}Build...${NC} "
    $BUILD_CMD >/dev/null 2>&1
    BUILD_EXIT=$?
    [[ $BUILD_EXIT -eq 0 ]] && echo -e "${GREEN}✓${NC}" || { echo -e "${YELLOW}⚠${NC} (exit $BUILD_EXIT)"; ALL_OK=0; }
    set -e

    if [[ $ALL_OK -eq 1 ]]; then
        print_success "Full checks passed"
    else
        print_warning "Full checks reported issues; see above."
    fi
}

# Handle command not found (exit 127) with user prompt
handle_command_not_found() {
    local cmd_name="$1"
    local cmd_string="$2"
    
    echo -e "${RED}✖ command not found${NC}"
    echo ""
    print_error "$cmd_name command not configured: ${DIM}$cmd_string${NC}"
    prompt_with_default CONTINUE_WITHOUT "   ${YELLOW}Continue without $cmd_name baseline? [Y/n]: ${NC}" "Y"
    if [[ "$CONTINUE_WITHOUT" == "n" || "$CONTINUE_WITHOUT" == "N" ]]; then
        print_error "Aborted. Please configure the $cmd_name command in the script."
        exit 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# PREFLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════════════════
preflight_checks() {
    print_step "Running preflight checks..."
    
    # 1. Check for pnpm
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed or not in PATH"
        echo -e "   ${DIM}Install it with: npm install -g pnpm${NC}"
        exit 1
    fi
    print_success "pnpm found: $(pnpm --version)"

    # 1b. Check for node
    if ! command -v node &> /dev/null; then
        print_error "node is not installed or not in PATH"
        exit 1
    fi
    
    # 2. Check git status
    if ! command -v git &> /dev/null; then
        print_warning "git not found - skipping git checks"
    else
        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
        
        if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
            echo ""
            print_warning "You're on the ${BOLD}$CURRENT_BRANCH${NC}${YELLOW} branch!${NC}"
            prompt_with_default CREATE_BRANCH "   ${YELLOW}Create a feature branch? [y/N]: ${NC}" "N"
            if [[ "$CREATE_BRANCH" == "y" || "$CREATE_BRANCH" == "Y" ]]; then
                echo -n -e "   ${CYAN}Branch name (e.g., feat/my-feature): ${NC}"
                if [[ -n "${NON_INTERACTIVE:-}" ]]; then
                    NEW_BRANCH="auto/$(date +%s)"
                    echo "$NEW_BRANCH"
                else
                    read NEW_BRANCH
                fi
                if [[ -n "$NEW_BRANCH" ]]; then
                    git checkout -b "$NEW_BRANCH"
                    CURRENT_BRANCH="$NEW_BRANCH"
                    print_success "Switched to branch: $NEW_BRANCH"
                fi
            fi
        fi
        
        set +e  # Disable exit on error for git status check
        if [[ -n $(git status --porcelain 2>/dev/null) ]]; then
            echo ""
            print_warning "You have uncommitted changes:"
            git status --short | head -10
            UNCOMMITTED_COUNT=$(git status --porcelain | wc -l | tr -d ' ')
            if [[ $UNCOMMITTED_COUNT -gt 10 ]]; then
                echo -e "   ${DIM}... and $((UNCOMMITTED_COUNT - 10)) more files${NC}"
            fi
            echo ""
            if [[ "${ALLOW_DIRTY:-0}" == "1" ]]; then
                print_warning "Continuing with dirty working tree (ALLOW_DIRTY=1)"
            else
                prompt_with_default CONTINUE "   ${YELLOW}Continue anyway? [y/N]: ${NC}" "N"
                if [[ "$CONTINUE" != "y" && "$CONTINUE" != "Y" ]]; then
                    print_error "Aborted. Please commit or stash your changes first."
                    exit 1
                fi
            fi
        else
            print_success "Git working directory clean"
        fi
        set -e  # Re-enable exit on error
    fi
    
    # 3. Check MCP servers reminder
    if [ -f "$MCP_ALIASES_SCRIPT" ]; then
        print_info "MCP aliases available: ${CYAN}source $MCP_ALIASES_SCRIPT${NC}"
    fi
    
    # 4. Check constraints file
    if [ -f "$CONSTRAINTS_FILE" ]; then
        echo ""
        print_warning "Remember to review project constraints!"
        echo -e "   ${DIM}File: $CONSTRAINTS_FILE${NC}"
    fi
    
    # 5. Create directories
    mkdir -p "$TASK_DIR" "$ARCHIVE_DIR" "$LOG_DIR"
    print_success "Task directories ready"

    # 6. Env hints
    if [ -f "$REPO_ROOT/.env.local" ]; then
        print_info ".env.local detected; ensure required vars are set"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# ARCHIVE PREVIOUS TASK
# ═══════════════════════════════════════════════════════════════════════════════
archive_previous_task() {
    if [ -f "$TASK_FILE" ]; then
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        ARCHIVED_FILE="$ARCHIVE_DIR/task_${TIMESTAMP}.md"
        mv "$TASK_FILE" "$ARCHIVED_FILE"
        print_success "Archived previous task → ${DIM}$ARCHIVED_FILE${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# CAPTURE QA BASELINE
# ═══════════════════════════════════════════════════════════════════════════════
capture_qa_baseline() {
    # Check if baseline should be skipped
    if [[ "${SKIP_BASELINE:-0}" == "1" ]]; then
        print_info "Skipping QA baseline (SKIP_BASELINE=1)"
        BASELINE_LINT="skipped"
        BASELINE_TYPECHECK="skipped"
        BASELINE_TESTS="skipped"
        BASELINE_FORMAT="skipped"
        BASELINE_LOG="skipped"
        return
    fi
    
    print_step "Capturing QA baseline (this may take a moment)..."
    echo ""
    
    local BASELINE_FILE="$TASK_DIR/.qa_baseline"
    local TEMP_OUTPUT
    TEMP_OUTPUT=$(mktemp)
    trap '[[ -f "$TEMP_OUTPUT" ]] && rm -f "$TEMP_OUTPUT"' EXIT
    BASELINE_LOG="$LOG_DIR/qa_baseline_$(date +%Y%m%d_%H%M%S).log"
    echo "# QA Baseline Log $(date -Iseconds)" > "$BASELINE_LOG"
    
    # ─────────────────────────────────────────────────────────────────────────
    # Lint
    # ─────────────────────────────────────────────────────────────────────────
    echo -n -e "   ${DIM}Lint...${NC} "
    set +e  # Disable exit on error for baseline capture
    $LINT_CMD > "$TEMP_OUTPUT" 2>&1
    LINT_EXIT=$?
    set -e  # Re-enable exit on error
    { echo "### Lint ($LINT_CMD)"; cat "$TEMP_OUTPUT"; echo ""; } >> "$BASELINE_LOG"
    
    if [[ $LINT_EXIT -eq 0 ]]; then
        BASELINE_LINT="pass"
        echo -e "${GREEN}✓ pass${NC}"
    elif [[ $LINT_EXIT -eq 127 ]]; then
        BASELINE_LINT="not configured"
        handle_command_not_found "Lint" "$LINT_CMD"
    else
        BASELINE_LINT="fail (exit $LINT_EXIT)"
        LINT_ERROR_COUNT=$(grep -c -E "(error|Error)" "$TEMP_OUTPUT" 2>/dev/null || echo "?")
        echo -e "${YELLOW}⚠ fail${NC} ${DIM}(~$LINT_ERROR_COUNT issues)${NC}"
        print_snippet "$TEMP_OUTPUT"
    fi
    
    # ─────────────────────────────────────────────────────────────────────────
    # Type Check (with clear fallback logic)
    # ─────────────────────────────────────────────────────────────────────────
    echo -n -e "   ${DIM}Type check...${NC} "
    set +e  # Disable exit on error for baseline capture
    
    # Step 1: Check if primary type-check script exists in package.json
    if node -e "process.exit(!(require('./package.json').scripts||{})['type-check'] ? 0 : 1)" 2>/dev/null; then
        $TYPECHECK_CMD > "$TEMP_OUTPUT" 2>&1
        TYPECHECK_EXIT=$?
    # Step 2: Try fallback 'typecheck' (no hyphen)
    elif node -e "process.exit(!(require('./package.json').scripts||{})['typecheck'] ? 0 : 1)" 2>/dev/null; then
        $TYPECHECK_FALLBACK_CMD > "$TEMP_OUTPUT" 2>&1
        TYPECHECK_EXIT=$?
    # Step 3: Try tsc directly
    elif command -v tsc &> /dev/null; then
        tsc --noEmit > "$TEMP_OUTPUT" 2>&1
        TYPECHECK_EXIT=$?
    else
        # No type checking available
        TYPECHECK_EXIT=127
    fi
    set -e  # Re-enable exit on error
    { echo "### Typecheck (fallback aware)"; cat "$TEMP_OUTPUT"; echo ""; } >> "$BASELINE_LOG"
    
    if [[ $TYPECHECK_EXIT -eq 0 ]]; then
        BASELINE_TYPECHECK="pass"
        echo -e "${GREEN}✓ pass${NC}"
    elif [[ $TYPECHECK_EXIT -eq 127 ]]; then
        BASELINE_TYPECHECK="not configured"
        echo -e "${DIM}⊘ not configured${NC}"
        echo -e "      ${DIM}(tried: $TYPECHECK_CMD, $TYPECHECK_FALLBACK_CMD, tsc --noEmit)${NC}"
    else
        BASELINE_TYPECHECK="fail (exit $TYPECHECK_EXIT)"
        echo -e "${YELLOW}⚠ fail${NC}"
        print_snippet "$TEMP_OUTPUT"
    fi
    
    # ─────────────────────────────────────────────────────────────────────────
    # Tests
    # ─────────────────────────────────────────────────────────────────────────
    echo -n -e "   ${DIM}Unit tests...${NC} "
    set +e  # Disable exit on error for baseline capture
    $TEST_CMD > "$TEMP_OUTPUT" 2>&1
    TEST_EXIT=$?
    set -e  # Re-enable exit on error
    { echo "### Unit Tests ($TEST_CMD)"; cat "$TEMP_OUTPUT"; echo ""; } >> "$BASELINE_LOG"
    
    if [[ $TEST_EXIT -eq 0 ]]; then
        BASELINE_TESTS="pass"
        PASS_COUNT=$(grep -oE "[0-9]+ passed" "$TEMP_OUTPUT" | head -1 || echo "")
        echo -e "${GREEN}✓ pass${NC} ${DIM}($PASS_COUNT)${NC}"
    elif [[ $TEST_EXIT -eq 127 ]]; then
        BASELINE_TESTS="not configured"
        handle_command_not_found "Tests" "$TEST_CMD"
    else
        BASELINE_TESTS="fail (exit $TEST_EXIT)"
        FAIL_INFO=$(grep -oE "[0-9]+ failed" "$TEMP_OUTPUT" | head -1 || echo "")
        if [[ -n "$FAIL_INFO" ]]; then
            echo -e "${YELLOW}⚠ fail${NC} ${DIM}($FAIL_INFO)${NC}"
        else
            echo -e "${YELLOW}⚠ fail${NC}"
        fi
        print_snippet "$TEMP_OUTPUT"
    fi

    # ─────────────────────────────────────────────────────────────────────────
    # Format (best-effort)
    # ─────────────────────────────────────────────────────────────────────────
    echo -n -e "   ${DIM}Format check...${NC} "
    set +e
    $FORMAT_CMD > "$TEMP_OUTPUT" 2>&1
    FORMAT_EXIT=$?
    set -e
    { echo "### Format ($FORMAT_CMD)"; cat "$TEMP_OUTPUT"; echo ""; } >> "$BASELINE_LOG"

    if [[ $FORMAT_EXIT -eq 0 ]]; then
        BASELINE_FORMAT="pass"
        echo -e "${GREEN}✓ pass${NC}"
    elif [[ $FORMAT_EXIT -eq 127 ]]; then
        BASELINE_FORMAT="not configured"
        echo -e "${DIM}⊘ not configured${NC}"
    else
        BASELINE_FORMAT="fail (exit $FORMAT_EXIT)"
        echo -e "${YELLOW}⚠ fail${NC}"
        print_snippet "$TEMP_OUTPUT"
    fi
    
    # ─────────────────────────────────────────────────────────────────────────
    # Write baseline file
    # ─────────────────────────────────────────────────────────────────────────
    cat > "$BASELINE_FILE" << EOF
# QA Baseline - $(date)
lint=$BASELINE_LINT
typecheck=$BASELINE_TYPECHECK
tests=$BASELINE_TESTS
format=$BASELINE_FORMAT
timestamp=$(date -Iseconds)
log=$BASELINE_LOG
EOF
    
    rm -f "$TEMP_OUTPUT"
    trap - EXIT
    echo ""
    
    # Warn if baseline has failures
    if [[ "$BASELINE_LINT" == fail* ]] || [[ "$BASELINE_TYPECHECK" == fail* ]] || [[ "$BASELINE_TESTS" == fail* ]] || [[ "$BASELINE_FORMAT" == fail* ]]; then
        print_warning "Baseline has failures - consider fixing before starting new work"
        print_info "Full log: $BASELINE_LOG"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# GATHER TASK INPUTS
# ═══════════════════════════════════════════════════════════════════════════════
gather_inputs() {
    # Task Name (from arg or prompt)
    if [ -n "${1:-}" ]; then
        TASK_NAME="$1"
        shift
    else
        prompt_with_default TASK_NAME "${CYAN}📝 Enter Task Name: ${NC}" ""
    fi

    if [[ -z "${TASK_NAME// }" ]]; then
        print_error "Task name is required."
        exit 1
    fi
    
    # Manual file hints from remaining args
    MANUAL_FILES=""
    if [ $# -gt 0 ]; then
        MANUAL_FILES="$*"
    fi
    
    echo ""
    
    # ─────────────────────────────────────────────────────────────────────────
    # Task Type
    # ─────────────────────────────────────────────────────────────────────────
    echo -e "${CYAN}🎯 Task Type:${NC}"
    echo "  1) Feature Implementation (New capabilities)"
    echo "  2) Bug Fix (Reproduction & Resolution)"
    echo "  3) Refactor/Optimization (Cleanup & Perf)"
    echo "  4) Documentation/Exploration (Analysis)"
    prompt_with_default TYPE_SEL "Select [1-4] (default 1): " "1"

    case $TYPE_SEL in
        2) TASK_TYPE="Bug Fix"
           TEMPLATE='<reproduction_steps>
  1. Navigate to...
  2. Click on...
  3. Observe...
</reproduction_steps>
<expected_behavior>
  The expected result is...
</expected_behavior>
<actual_behavior>
  Instead, what happens is...
</actual_behavior>' ;;
        3) TASK_TYPE="Refactor"
           TEMPLATE='<current_limitations>
  - Performance issue with...
  - Code duplication in...
</current_limitations>
<goals>
  - Improve performance by...
  - Clean up code structure
  - Maintain backwards compatibility
</goals>' ;;
        4) TASK_TYPE="Exploration"
           TEMPLATE='<questions>
  1. How does the current X work?
  2. What are the dependencies?
  3. What are the risks?
</questions>
<deliverable>
  - Analysis document
  - Recommendations
</deliverable>' ;;
        *) TASK_TYPE="Feature"
           TEMPLATE='<user_story>
  As a [user type], I want to [action]
  so that I can [benefit].
</user_story>
<acceptance_criteria>
  - [ ] Criterion 1
  - [ ] Criterion 2
  - [ ] Criterion 3
</acceptance_criteria>' ;;
    esac
    
    echo ""
    
    # ─────────────────────────────────────────────────────────────────────────
    # Priority
    # ─────────────────────────────────────────────────────────────────────────
    echo -e "${CYAN}📊 Priority:${NC}"
    echo "  1) P0 - Critical (blocking release)"
    echo "  2) P1 - High (important for milestone)"
    echo "  3) P2 - Medium (nice to have)"
    echo "  4) P3 - Low (backlog)"
    prompt_with_default PRIORITY_SEL "Select [1-4] (default 2): " "2"
    
    case $PRIORITY_SEL in
        1) PRIORITY="P0-Critical" ;;
        3) PRIORITY="P2-Medium" ;;
        4) PRIORITY="P3-Low" ;;
        *) PRIORITY="P1-High" ;;
    esac
    
    echo ""
    
    # ─────────────────────────────────────────────────────────────────────────
    # Estimate
    # ─────────────────────────────────────────────────────────────────────────
    prompt_with_default ESTIMATE "${CYAN}⏱️  Estimated Effort (e.g., '2h', '1d', '3d'): ${NC}" "TBD"
    ESTIMATE=${ESTIMATE:-"TBD"}
    
    echo ""
    
    # ─────────────────────────────────────────────────────────────────────────
    # Testing Requirements
    # ─────────────────────────────────────────────────────────────────────────
    echo -e "${CYAN}🧪 Testing Requirements:${NC}"
    echo "  1) No tests required (exploration/docs)"
    echo "  2) Unit tests only"
    echo "  3) Unit + Component tests"
    echo "  4) Full coverage (Unit + Component + E2E)"
    prompt_with_default TEST_REQ "Select [1-4] (default 2): " "2"

    case $TEST_REQ in
        1) TEST_LEVEL="none" ;;
        3) TEST_LEVEL="component" ;;
        4) TEST_LEVEL="full" ;;
        *) TEST_LEVEL="unit" ;;
    esac
    
    echo ""
    
    # ─────────────────────────────────────────────────────────────────────────
    # Roadmap Reference (optional)
    # ─────────────────────────────────────────────────────────────────────────
    prompt_with_default ROADMAP_REF "${CYAN}🗺️  Roadmap Reference (e.g., 'Phase 2, Week 7' or Enter to skip): ${NC}" ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# SMART CONTEXT DETECTION
# ═══════════════════════════════════════════════════════════════════════════════
detect_related_files() {
    RELATED_FILES=""
    TASK_LOWER=$(echo "$TASK_NAME" | tr '[:upper:]' '[:lower:]')
    
    # ─────────────────────────────────────────────────────────────────────────
    # Category detection with path hints
    # ─────────────────────────────────────────────────────────────────────────
    
    if [[ "$TASK_LOWER" == *"claim"* ]]; then
        RELATED_FILES="- apps/web/src/components/claims/
- apps/web/src/actions/claims.ts
- apps/web/src/lib/validators/claims.ts
- packages/database/src/schema.ts (claims table)
- e2e/claims.spec.ts"
    fi
    
    if [[ "$TASK_LOWER" == *"auth"* ]] || [[ "$TASK_LOWER" == *"login"* ]] || [[ "$TASK_LOWER" == *"register"* ]] || [[ "$TASK_LOWER" == *"password"* ]]; then
        RELATED_FILES="$RELATED_FILES
- apps/web/src/lib/auth.ts
- apps/web/src/lib/auth-client.ts
- apps/web/src/app/api/auth/[...all]/route.ts
- apps/web/src/components/auth/
- e2e/auth.spec.ts"
    fi
    
    if [[ "$TASK_LOWER" == *"stripe"* ]] || [[ "$TASK_LOWER" == *"payment"* ]] || [[ "$TASK_LOWER" == *"subscription"* ]] || [[ "$TASK_LOWER" == *"billing"* ]]; then
        RELATED_FILES="$RELATED_FILES
- apps/web/src/app/api/webhooks/stripe/
- packages/database/src/schema.ts (subscription fields)
- .env (STRIPE_* variables)"
    fi
    
    if [[ "$TASK_LOWER" == *"i18n"* ]] || [[ "$TASK_LOWER" == *"translation"* ]] || [[ "$TASK_LOWER" == *"locale"* ]] || [[ "$TASK_LOWER" == *"language"* ]]; then
        RELATED_FILES="$RELATED_FILES
- apps/web/src/messages/*.json
- apps/web/src/i18n/routing.ts
- apps/web/src/middleware.ts"
    fi
    
    if [[ "$TASK_LOWER" == *"dashboard"* ]]; then
        RELATED_FILES="$RELATED_FILES
- apps/web/src/app/[locale]/(app)/dashboard/
- apps/web/src/components/dashboard/"
    fi
    
    if [[ "$TASK_LOWER" == *"footer"* ]] || [[ "$TASK_LOWER" == *"header"* ]] || [[ "$TASK_LOWER" == *"nav"* ]]; then
        RELATED_FILES="$RELATED_FILES
- apps/web/src/components/layout/
- apps/web/src/app/[locale]/(site)/layout.tsx"
    fi
    
    if [[ "$TASK_LOWER" == *"wizard"* ]]; then
        RELATED_FILES="$RELATED_FILES
- apps/web/src/components/claims/claim-wizard.tsx
- apps/web/src/components/claims/wizard-*.tsx
- apps/web/src/lib/validators/claims.ts"
    fi
    
    if [[ "$TASK_LOWER" == *"services"* ]] || [[ "$TASK_LOWER" == *"landing"* ]] || [[ "$TASK_LOWER" == *"homepage"* ]]; then
        RELATED_FILES="$RELATED_FILES
- apps/web/src/app/[locale]/(site)/services/
- apps/web/src/app/[locale]/page.tsx"
    fi
    
    if [[ "$TASK_LOWER" == *"database"* ]] || [[ "$TASK_LOWER" == *"schema"* ]] || [[ "$TASK_LOWER" == *"migration"* ]]; then
        RELATED_FILES="$RELATED_FILES
- packages/database/src/schema.ts
- packages/database/src/index.ts
- supabase/migrations/"
    fi
    
    if [[ "$TASK_LOWER" == *"api"* ]] || [[ "$TASK_LOWER" == *"endpoint"* ]]; then
        RELATED_FILES="$RELATED_FILES
- apps/web/src/app/api/
- apps/web/src/actions/"
    fi
    
    if [[ "$TASK_LOWER" == *"test"* ]]; then
        RELATED_FILES="$RELATED_FILES
- apps/web/src/test/
- apps/web/e2e/
- apps/web/vitest.config.ts
- apps/web/playwright.config.ts"
    fi
    
    # Trim leading newlines
    RELATED_FILES=$(echo "$RELATED_FILES" | sed '/^$/d')
    
    # ─────────────────────────────────────────────────────────────────────────
    # Add manual file hints if provided
    # ─────────────────────────────────────────────────────────────────────────
    if [[ -n "$MANUAL_FILES" ]]; then
        if [[ -n "$RELATED_FILES" ]]; then
            RELATED_FILES="$RELATED_FILES
            
### Manual additions:
$MANUAL_FILES"
        else
            RELATED_FILES="$MANUAL_FILES"
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# GENERATE TASK FILE
# ═══════════════════════════════════════════════════════════════════════════════
generate_task_file() {
    print_step "Generating task file..."
    
    detect_related_files
    
    # Get current branch
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
    local TASK_NAME_ESC
    local ROADMAP_ESC
    TASK_NAME_ESC=$(escape_yaml "$TASK_NAME")
    ROADMAP_ESC=$(escape_yaml "$ROADMAP_REF")
    
    cat > "$TASK_FILE" << EOF
---
task_name: "$TASK_NAME_ESC"
task_type: "$TASK_TYPE"
priority: "$PRIORITY"
estimate: "$ESTIMATE"
test_level: "$TEST_LEVEL"
roadmap_ref: "$ROADMAP_ESC"
branch: "$CURRENT_BRANCH"
start_time: "$(date)"
baseline:
  lint: "$BASELINE_LINT"
  typecheck: "$BASELINE_TYPECHECK"
  tests: "$BASELINE_TESTS"
  format: "${BASELINE_FORMAT:-n/a}"
  log: "${BASELINE_LOG:-n/a}"
---

# 🚀 Current Task: $TASK_NAME

## 📋 10x Context Prompt
Copy the block below to your Agent to start with maximum context:

\`\`\`xml
<task_definition>
  <objective>$TASK_NAME</objective>
  <type>$TASK_TYPE</type>
  <priority>$PRIORITY</priority>
  <estimate>$ESTIMATE</estimate>
  <branch>$CURRENT_BRANCH</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

$TEMPLATE
\`\`\`
EOF

    # ─────────────────────────────────────────────────────────────────────────
    # Add Project Constraints (if file exists)
    # ─────────────────────────────────────────────────────────────────────────
    if [ -f "$CONSTRAINTS_FILE" ]; then
        cat >> "$TASK_FILE" << EOF

## 📜 Project Constraints
$(cat "$CONSTRAINTS_FILE")
EOF
    fi

    # ─────────────────────────────────────────────────────────────────────────
    # Status Tracker
    # ─────────────────────────────────────────────────────────────────────────
    cat >> "$TASK_FILE" << EOF

## 🏗️ Status Tracker
- [ ] **Exploration**: Identify files using \`project_map\` and \`read_files\`
- [ ] **Planning**: Create a step-by-step implementation plan
- [ ] **Implementation**: Execute code changes
- [ ] **Verification**: Run \`pnpm qa\` or relevant tests
- [ ] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist
EOF

    # Add testing checklist based on level
    case $TEST_LEVEL in
        "none")
            echo "- [ ] No tests required for this task" >> "$TASK_FILE"
            ;;
        "unit")
            cat >> "$TASK_FILE" << EOF
- [ ] Unit tests added: \`src/**/*.test.ts\`
- [ ] Tests use factories from \`src/test/factories.ts\`
- [ ] Run: \`pnpm test:unit\`
- [ ] All tests pass
EOF
            ;;
        "component")
            cat >> "$TASK_FILE" << EOF
- [ ] Unit tests added: \`src/**/*.test.ts\`
- [ ] Component tests added: \`src/**/*.test.tsx\`
- [ ] Tests use factories from \`src/test/factories.ts\`
- [ ] Run: \`pnpm test:unit\`
- [ ] All tests pass
EOF
            ;;
        "full")
            cat >> "$TASK_FILE" << EOF
- [ ] Unit tests added: \`src/**/*.test.ts\`
- [ ] Component tests added: \`src/**/*.test.tsx\`
- [ ] E2E tests added: \`e2e/*.spec.ts\`
- [ ] Tests use factories from \`src/test/factories.ts\`
- [ ] E2E uses fixtures from \`e2e/fixtures/\`
- [ ] Run: \`pnpm qa\` (includes all)
- [ ] All tests pass
EOF
            ;;
    esac

    # ─────────────────────────────────────────────────────────────────────────
    # Definition of Done
    # ─────────────────────────────────────────────────────────────────────────
    cat >> "$TASK_FILE" << EOF

## ✅ Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests pass at required level ($TEST_LEVEL)
- [ ] \`pnpm lint\` passes (or no new errors)
- [ ] Formatter/Prettier check passes
- [ ] \`pnpm type-check\` passes
- [ ] No regressions from baseline
- [ ] (Recommended) \`pnpm qa:full\` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Code reviewed / self-reviewed

## 🧠 Senior Checklist
- [ ] Risks identified (perf, reliability, UX, security, data)
- [ ] Rollback/mitigation plan documented
- [ ] Monitoring/logging impact considered
- [ ] Migrations include up/down and backfill strategy (if applicable)
- [ ] Accessibility checks for UI changes
- [ ] Removed debug artifacts (console.log/debugger/TODO left behind)
EOF

    # ─────────────────────────────────────────────────────────────────────────
    # Related Files section
    # ─────────────────────────────────────────────────────────────────────────
    cat >> "$TASK_FILE" << EOF

## 🔗 Related Files
EOF

    if [ -n "$RELATED_FILES" ]; then
        echo "$RELATED_FILES" >> "$TASK_FILE"
    else
        echo "<!-- Add discovered file paths here -->" >> "$TASK_FILE"
    fi

    # ─────────────────────────────────────────────────────────────────────────
    # Additional Sections
    # ─────────────────────────────────────────────────────────────────────────
    cat >> "$TASK_FILE" << EOF

## 📂 Active Context
<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes
<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)
| Metric | Status |
|--------|--------|
| Lint | $BASELINE_LINT |
| Type Check | $BASELINE_TYPECHECK |
| Unit Tests | $BASELINE_TESTS |
| Format | ${BASELINE_FORMAT:-n/a} |
| Log | ${BASELINE_LOG:-n/a} |

---

## 📝 PR Template (Copy when done)
\`\`\`markdown
## What
$TASK_NAME

## Why
$ROADMAP_REF

## How
<!-- Implementation approach -->

## Testing
- [ ] Unit tests pass (\`pnpm test:unit\`)
- [ ] E2E tests pass (\`pnpm test:e2e\`)  
- [ ] Manual QA completed
- [ ] No regressions in existing functionality

## Screenshots (if UI changes)
<!-- Add screenshots here -->

## Notes to Reviewer
<!-- Highlight areas needing careful review, known limitations, or follow-up tasks -->

\`\`\`
EOF

    print_success "Task file created: $TASK_FILE"
}

# ═══════════════════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
print_summary() {
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ${BOLD}✅ TASK INITIALIZED SUCCESSFULLY${NC}                            ${GREEN}║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}Task:${NC}      $TASK_NAME"
    echo -e "  ${BOLD}Type:${NC}      $TASK_TYPE"
    echo -e "  ${BOLD}Priority:${NC}  $PRIORITY"
    echo -e "  ${BOLD}Estimate:${NC}  $ESTIMATE"
    echo -e "  ${BOLD}Tests:${NC}     $TEST_LEVEL"
    echo -e "  ${BOLD}Branch:${NC}    $CURRENT_BRANCH"
    echo ""
    echo -e "  ${BOLD}Baseline:${NC}"
    echo -e "    Lint:      $(if [[ "$BASELINE_LINT" == "pass" ]]; then echo -e "${GREEN}$BASELINE_LINT${NC}"; elif [[ "$BASELINE_LINT" == "skipped" ]]; then echo -e "${DIM}$BASELINE_LINT${NC}"; else echo -e "${YELLOW}$BASELINE_LINT${NC}"; fi)"
    echo -e "    Typecheck: $(if [[ "$BASELINE_TYPECHECK" == "pass" ]]; then echo -e "${GREEN}$BASELINE_TYPECHECK${NC}"; elif [[ "$BASELINE_TYPECHECK" == "skipped" ]] || [[ "$BASELINE_TYPECHECK" == "not configured" ]]; then echo -e "${DIM}$BASELINE_TYPECHECK${NC}"; else echo -e "${YELLOW}$BASELINE_TYPECHECK${NC}"; fi)"
    echo -e "    Tests:     $(if [[ "$BASELINE_TESTS" == "pass" ]]; then echo -e "${GREEN}$BASELINE_TESTS${NC}"; elif [[ "$BASELINE_TESTS" == "skipped" ]]; then echo -e "${DIM}$BASELINE_TESTS${NC}"; else echo -e "${YELLOW}$BASELINE_TESTS${NC}"; fi)"
    echo -e "    Format:    $(if [[ "${BASELINE_FORMAT:-}" == "pass" ]]; then echo -e "${GREEN}$BASELINE_FORMAT${NC}"; elif [[ "${BASELINE_FORMAT:-}" == "skipped" ]] || [[ "${BASELINE_FORMAT:-}" == "not configured" ]]; then echo -e "${DIM}${BASELINE_FORMAT:-n/a}${NC}"; else echo -e "${YELLOW}${BASELINE_FORMAT:-n/a}${NC}"; fi)"
    echo -e "    Log:       ${BASELINE_LOG:-n/a}"
    echo ""
    echo -e "  ${BOLD}File:${NC}      ${CYAN}$TASK_FILE${NC}"
    echo ""
    echo -e "${YELLOW}💡 Next Steps:${NC}"
    echo "   1. Review and fill in the task file details"
    echo "   2. Ask the Agent to read the task file"
    echo "   3. Follow: Explore → Plan → Execute → Verify"
    echo "   4. Commit when DoD is green (lint/typecheck/tests passing, no unrelated changes)"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═══════════════════════════════════════════════════════════════════════════════
main() {
    print_header
    parse_args "$@"
    preflight_checks
    archive_previous_task
    gather_inputs "${PARSED_ARGS[@]}"
    capture_qa_baseline
    generate_task_file
    run_optional_full_checks
    print_summary
    
    # Try to open in VS Code
    if command -v code >/dev/null 2>&1; then
        code "$TASK_FILE" 2>/dev/null || true
    fi
}

main "$@"
