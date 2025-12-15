#!/bin/bash

# end-10x-task.sh
# Finalize a 10x coding task with summary, QA comparison, and optional commit.

set -e

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════
TASK_DIR=".agent/tasks"
TASK_FILE="$TASK_DIR/current_task.md"
ARCHIVE_DIR="$TASK_DIR/archive"
BASELINE_FILE="$TASK_DIR/.qa_baseline"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  🏁 10x CODING TASK FINALIZER${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}▸ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
# RUN FINAL QA
# ═══════════════════════════════════════════════════════════════════════════════
run_final_qa() {
    print_step "Running final QA checks..."
    echo ""
    
    # Run tests
    echo -e "${CYAN}Running unit tests...${NC}"
    if pnpm --filter @interdomestik/web test:unit --run 2>&1; then
        FINAL_TESTS="pass"
        print_success "Unit tests passed"
    else
        FINAL_TESTS="fail"
        print_warning "Unit tests failed"
    fi
    
    echo ""
    echo -e "${CYAN}Running type check...${NC}"
    if pnpm type-check --quiet 2>/dev/null; then
        FINAL_TYPECHECK="pass"
        print_success "Type check passed"
    else
        FINAL_TYPECHECK="fail"
        print_warning "Type check failed"
    fi
    
    echo ""
    echo -e "${CYAN}Running lint...${NC}"
    FINAL_LINT_ERRORS=$(pnpm lint 2>&1 | grep -c "error" || echo "0")
    if [ "$FINAL_LINT_ERRORS" -eq 0 ]; then
        print_success "No lint errors"
    else
        print_warning "$FINAL_LINT_ERRORS lint errors found"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# COMPARE WITH BASELINE
# ═══════════════════════════════════════════════════════════════════════════════
compare_baseline() {
    if [ -f "$BASELINE_FILE" ]; then
        print_step "Comparing with baseline..."
        
        source "$BASELINE_FILE"
        
        echo ""
        echo -e "${CYAN}QA Comparison:${NC}"
        echo "┌──────────────────┬───────────┬───────────┐"
        echo "│ Metric           │ Before    │ After     │"
        echo "├──────────────────┼───────────┼───────────┤"
        printf "│ %-16s │ %-9s │ %-9s │\n" "Lint Errors" "$lint_errors" "$FINAL_LINT_ERRORS"
        printf "│ %-16s │ %-9s │ %-9s │\n" "Type Check" "$typecheck" "$FINAL_TYPECHECK"
        printf "│ %-16s │ %-9s │ %-9s │\n" "Unit Tests" "baseline" "$FINAL_TESTS"
        echo "└──────────────────┴───────────┴───────────┘"
        echo ""
        
        # Check for regressions
        if [ "$FINAL_TYPECHECK" = "fail" ] && [ "$typecheck" = "pass" ]; then
            print_warning "REGRESSION: Type check was passing, now failing!"
        fi
        if [ "$FINAL_LINT_ERRORS" -gt "$lint_errors" ]; then
            print_warning "REGRESSION: Lint errors increased from $lint_errors to $FINAL_LINT_ERRORS"
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# GET TASK OUTCOME
# ═══════════════════════════════════════════════════════════════════════════════
get_outcome() {
    echo ""
    echo -e "${CYAN}📊 Task Outcome:${NC}"
    echo "  1) ✅ Completed - All acceptance criteria met"
    echo "  2) 🔄 Partially Complete - Some work remaining"
    echo "  3) ⏸️  Blocked/Deferred - Cannot proceed"
    echo "  4) ❌ Abandoned - Task cancelled"
    echo -n "Select [1-4]: "
    read OUTCOME_SEL
    
    case $OUTCOME_SEL in
        1) OUTCOME="Completed ✅" ;;
        2) OUTCOME="Partially Complete 🔄" ;;
        3) OUTCOME="Blocked/Deferred ⏸️" ;;
        4) OUTCOME="Abandoned ❌" ;;
        *) OUTCOME="Unknown" ;;
    esac
    
    echo ""
    echo -n -e "${CYAN}📝 Brief summary of what was done: ${NC}"
    read SUMMARY
}

# ═══════════════════════════════════════════════════════════════════════════════
# UPDATE TASK FILE
# ═══════════════════════════════════════════════════════════════════════════════
update_task_file() {
    if [ -f "$TASK_FILE" ]; then
        print_step "Updating task file with completion details..."
        
        cat >> "$TASK_FILE" << EOF

---

## 📊 Task Completion
- **End Time**: $(date)
- **Outcome**: $OUTCOME
- **Summary**: $SUMMARY

### Final QA Status
- Lint Errors: $FINAL_LINT_ERRORS
- Type Check: $FINAL_TYPECHECK
- Unit Tests: $FINAL_TESTS
EOF
        print_success "Task file updated"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# OFFER TO COMMIT
# ═══════════════════════════════════════════════════════════════════════════════
offer_commit() {
    echo ""
    if [[ -n $(git status --porcelain 2>/dev/null) ]]; then
        echo -e "${CYAN}📦 Git Status:${NC}"
        git status --short
        echo ""
        echo -n -e "${YELLOW}Ready to commit these changes? [y/N]: ${NC}"
        read DO_COMMIT
        
        if [[ "$DO_COMMIT" == "y" || "$DO_COMMIT" == "Y" ]]; then
            echo -n -e "${CYAN}Commit message (or press Enter for default): ${NC}"
            read COMMIT_MSG
            
            if [ -z "$COMMIT_MSG" ]; then
                # Extract task name from file
                TASK_NAME=$(grep "task_name:" "$TASK_FILE" 2>/dev/null | sed 's/task_name: "//;s/"//' || echo "Task completed")
                COMMIT_MSG="feat: $TASK_NAME"
            fi
            
            git add -A
            git commit -m "$COMMIT_MSG"
            print_success "Changes committed: $COMMIT_MSG"
        fi
    else
        print_success "No uncommitted changes"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# ARCHIVE TASK
# ═══════════════════════════════════════════════════════════════════════════════
archive_task() {
    echo ""
    echo -n -e "${YELLOW}Archive this task? [Y/n]: ${NC}"
    read DO_ARCHIVE
    
    if [[ "$DO_ARCHIVE" != "n" && "$DO_ARCHIVE" != "N" ]]; then
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        ARCHIVED_FILE="$ARCHIVE_DIR/task_${TIMESTAMP}_completed.md"
        mv "$TASK_FILE" "$ARCHIVED_FILE"
        print_success "Task archived to: $ARCHIVED_FILE"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════
main() {
    print_header
    
    if [ ! -f "$TASK_FILE" ]; then
        print_warning "No active task found at $TASK_FILE"
        exit 1
    fi
    
    run_final_qa
    compare_baseline
    get_outcome
    update_task_file
    offer_commit
    archive_task
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  🏁 TASK FINALIZED${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

main
