#!/bin/bash

# start-10x-task.sh
# Enhanced Interactive CLI for "10x Coding" tasks with structured context,
# testing requirements, QA baselines, and professional workflow.
#
# Usage: ./scripts/start-10x-task.sh [task_name] [related_files...]
# Env vars:
#   SKIP_BASELINE=1  Skip QA baseline capture (for exploration tasks)

# ═══════════════════════════════════════════════════════════════════════════════
# STRICT MODE (with controlled error handling for baseline captures)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION - Customize these for your repo
# ═══════════════════════════════════════════════════════════════════════════════
TASK_DIR=".agent/tasks"
TASK_FILE="$TASK_DIR/current_task.md"
ARCHIVE_DIR="$TASK_DIR/archive"
MCP_ALIASES_SCRIPT="./scripts/generate-mcp-aliases.sh"
CONSTRAINTS_FILE=".agent/constraints.md"

# Commands - customize per repo
LINT_CMD="pnpm lint"
TYPECHECK_CMD="pnpm type-check"
TYPECHECK_FALLBACK_CMD="pnpm typecheck"
TEST_CMD="pnpm --filter @interdomestik/web test:unit --run"

# ═══════════════════════════════════════════════════════════════════════════════
# COLORS
# ═══════════════════════════════════════════════════════════════════════════════
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════
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

# Handle command not found (exit 127) with user prompt
handle_command_not_found() {
    local cmd_name="$1"
    local cmd_string="$2"
    
    echo -e "${RED}✖ command not found${NC}"
    echo ""
    print_error "$cmd_name command not configured: ${DIM}$cmd_string${NC}"
    echo -n -e "   ${YELLOW}Continue without $cmd_name baseline? [Y/n]: ${NC}"
    read CONTINUE_WITHOUT
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
    
    # 2. Check git status
    if ! command -v git &> /dev/null; then
        print_warning "git not found - skipping git checks"
    else
        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
        
        if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
            echo ""
            print_warning "You're on the ${BOLD}$CURRENT_BRANCH${NC}${YELLOW} branch!${NC}"
            echo -n -e "   ${YELLOW}Create a feature branch? [y/N]: ${NC}"
            read CREATE_BRANCH
            if [[ "$CREATE_BRANCH" == "y" || "$CREATE_BRANCH" == "Y" ]]; then
                echo -n -e "   ${CYAN}Branch name (e.g., feat/my-feature): ${NC}"
                read NEW_BRANCH
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
            echo -n -e "   ${YELLOW}Continue anyway? [y/N]: ${NC}"
            read CONTINUE
            if [[ "$CONTINUE" != "y" && "$CONTINUE" != "Y" ]]; then
                print_error "Aborted. Please commit or stash your changes first."
                exit 1
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
    mkdir -p "$TASK_DIR" "$ARCHIVE_DIR"
    print_success "Task directories ready"
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
        return
    fi
    
    print_step "Capturing QA baseline (this may take a moment)..."
    echo ""
    
    local BASELINE_FILE="$TASK_DIR/.qa_baseline"
    local TEMP_OUTPUT=$(mktemp)
    
    # ─────────────────────────────────────────────────────────────────────────
    # Lint
    # ─────────────────────────────────────────────────────────────────────────
    echo -n -e "   ${DIM}Lint...${NC} "
    set +e  # Disable exit on error for baseline capture
    $LINT_CMD > "$TEMP_OUTPUT" 2>&1
    LINT_EXIT=$?
    set -e  # Re-enable exit on error
    
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
    fi
    
    # ─────────────────────────────────────────────────────────────────────────
    # Type Check (with clear fallback logic)
    # ─────────────────────────────────────────────────────────────────────────
    echo -n -e "   ${DIM}Type check...${NC} "
    set +e  # Disable exit on error for baseline capture
    
    # Step 1: Check if primary type-check script exists
    if pnpm run --silent type-check --help > /dev/null 2>&1; then
        # Primary command exists, run it
        $TYPECHECK_CMD > "$TEMP_OUTPUT" 2>&1
        TYPECHECK_EXIT=$?
    # Step 2: Try fallback 'typecheck' (no hyphen)
    elif pnpm run --silent typecheck --help > /dev/null 2>&1; then
        # Fallback exists, run it
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
    fi
    
    # ─────────────────────────────────────────────────────────────────────────
    # Tests
    # ─────────────────────────────────────────────────────────────────────────
    echo -n -e "   ${DIM}Unit tests...${NC} "
    set +e  # Disable exit on error for baseline capture
    $TEST_CMD > "$TEMP_OUTPUT" 2>&1
    TEST_EXIT=$?
    set -e  # Re-enable exit on error
    
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
    fi
    
    # ─────────────────────────────────────────────────────────────────────────
    # Write baseline file
    # ─────────────────────────────────────────────────────────────────────────
    cat > "$BASELINE_FILE" << EOF
# QA Baseline - $(date)
lint=$BASELINE_LINT
typecheck=$BASELINE_TYPECHECK
tests=$BASELINE_TESTS
timestamp=$(date -Iseconds)
EOF
    
    rm -f "$TEMP_OUTPUT"
    echo ""
    
    # Warn if baseline has failures
    if [[ "$BASELINE_LINT" == fail* ]] || [[ "$BASELINE_TYPECHECK" == fail* ]] || [[ "$BASELINE_TESTS" == fail* ]]; then
        print_warning "Baseline has failures - consider fixing before starting new work"
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
        echo -n -e "${CYAN}📝 Enter Task Name: ${NC}"
        read TASK_NAME
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
    echo -n "Select [1-4] (default 1): "
    read TYPE_SEL

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
    echo -n "Select [1-4] (default 2): "
    read PRIORITY_SEL
    
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
    echo -n -e "${CYAN}⏱️  Estimated Effort (e.g., '2h', '1d', '3d'): ${NC}"
    read ESTIMATE
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
    echo -n "Select [1-4] (default 2): "
    read TEST_REQ

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
    echo -n -e "${CYAN}🗺️  Roadmap Reference (e.g., 'Phase 2, Week 7' or Enter to skip): ${NC}"
    read ROADMAP_REF
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
    
    cat > "$TASK_FILE" << EOF
---
task_name: "$TASK_NAME"
task_type: "$TASK_TYPE"
priority: "$PRIORITY"
estimate: "$ESTIMATE"
test_level: "$TEST_LEVEL"
roadmap_ref: "$ROADMAP_REF"
branch: "$CURRENT_BRANCH"
start_time: "$(date)"
baseline:
  lint: "$BASELINE_LINT"
  typecheck: "$BASELINE_TYPECHECK"
  tests: "$BASELINE_TESTS"
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
- [ ] \`pnpm type-check\` passes
- [ ] No regressions from baseline
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Code reviewed / self-reviewed
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
    echo ""
    echo -e "  ${BOLD}File:${NC}      ${CYAN}$TASK_FILE${NC}"
    echo ""
    echo -e "${YELLOW}💡 Next Steps:${NC}"
    echo "   1. Review and fill in the task file details"
    echo "   2. Ask the Agent to read the task file"
    echo "   3. Follow: Explore → Plan → Execute → Verify"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═══════════════════════════════════════════════════════════════════════════════
main() {
    print_header
    preflight_checks
    archive_previous_task
    gather_inputs "$@"
    capture_qa_baseline
    generate_task_file
    print_summary
    
    # Try to open in VS Code
    code "$TASK_FILE" 2>/dev/null || true
}

main "$@"
