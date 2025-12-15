#!/bin/bash

# start-10x-task.sh
# Enhanced Interactive CLI for "10x Coding" tasks with structured context,
# testing requirements, QA baselines, and professional workflow.

set -e

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════
TASK_DIR=".agent/tasks"
TASK_FILE="$TASK_DIR/current_task.md"
ARCHIVE_DIR="$TASK_DIR/archive"
MCP_ALIASES_SCRIPT="./scripts/generate-mcp-aliases.sh"
CONSTRAINTS_FILE=".agent/constraints.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════
print_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  🚀 10x CODING TASK INITIALIZER${NC}"
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

print_error() {
    echo -e "${RED}✖ $1${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════════════════
preflight_checks() {
    print_step "Running pre-flight checks..."
    
    # 1. Check git status
    if [[ -n $(git status --porcelain 2>/dev/null) ]]; then
        echo ""
        print_warning "You have uncommitted changes:"
        git status --short
        echo ""
        echo -n -e "${YELLOW}Continue anyway? [y/N]: ${NC}"
        read CONTINUE
        if [[ "$CONTINUE" != "y" && "$CONTINUE" != "Y" ]]; then
            print_error "Aborted. Please commit or stash your changes first."
            exit 1
        fi
    else
        print_success "Git working directory clean"
    fi
    
    # 2. Check MCP servers reminder
    if [ -f "$MCP_ALIASES_SCRIPT" ]; then
        print_success "MCP aliases script found"
        echo -e "   ${CYAN}Tip: source $MCP_ALIASES_SCRIPT${NC}"
    fi
    
    # 3. Create directories
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
        print_success "Archived previous task to: $ARCHIVED_FILE"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# CAPTURE QA BASELINE
# ═══════════════════════════════════════════════════════════════════════════════
capture_qa_baseline() {
    print_step "Capturing QA baseline..."
    
    local BASELINE_FILE="$TASK_DIR/.qa_baseline"
    
    # Capture lint errors count
    LINT_ERRORS=$(pnpm lint 2>&1 | grep -c "error" || echo "0")
    
    # Capture typecheck status
    if pnpm type-check --quiet 2>/dev/null; then
        TYPECHECK_STATUS="pass"
    else
        TYPECHECK_STATUS="fail"
    fi
    
    # Capture test status
    TEST_PASS=$(pnpm --filter @interdomestik/web test:unit --run 2>&1 | grep -c "passed" || echo "0")
    
    echo "lint_errors=$LINT_ERRORS" > "$BASELINE_FILE"
    echo "typecheck=$TYPECHECK_STATUS" >> "$BASELINE_FILE"
    echo "tests_passed=$TEST_PASS" >> "$BASELINE_FILE"
    echo "timestamp=$(date -Iseconds)" >> "$BASELINE_FILE"
    
    print_success "Baseline captured: $LINT_ERRORS lint errors, typecheck=$TYPECHECK_STATUS"
}

# ═══════════════════════════════════════════════════════════════════════════════
# GATHER TASK INPUTS
# ═══════════════════════════════════════════════════════════════════════════════
gather_inputs() {
    # Task Name
    if [ -z "$1" ]; then
        echo -n -e "${CYAN}📝 Enter Task Name: ${NC}"
        read TASK_NAME
    else
        TASK_NAME="$1"
    fi
    
    echo ""
    
    # Task Type
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
    
    # Priority
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
    
    # Estimate
    echo -n -e "${CYAN}⏱️  Estimated Effort (e.g., '2h', '1d', '3d'): ${NC}"
    read ESTIMATE
    ESTIMATE=${ESTIMATE:-"TBD"}
    
    echo ""
    
    # Testing Requirements
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
    
    # Roadmap Reference (optional)
    echo -n -e "${CYAN}🗺️  Roadmap Reference (e.g., 'Phase 2, Week 7' or press Enter to skip): ${NC}"
    read ROADMAP_REF
}

# ═══════════════════════════════════════════════════════════════════════════════
# SMART CONTEXT DETECTION
# ═══════════════════════════════════════════════════════════════════════════════
detect_related_files() {
    RELATED_FILES=""
    TASK_LOWER=$(echo "$TASK_NAME" | tr '[:upper:]' '[:lower:]')
    
    if [[ "$TASK_LOWER" == *"claim"* ]]; then
        RELATED_FILES="- apps/web/src/components/claims/
- apps/web/src/actions/claims.ts
- apps/web/src/lib/validators/claims.ts
- packages/database/src/schema.ts (claims table)"
    elif [[ "$TASK_LOWER" == *"auth"* ]] || [[ "$TASK_LOWER" == *"login"* ]] || [[ "$TASK_LOWER" == *"register"* ]]; then
        RELATED_FILES="- apps/web/src/lib/auth.ts
- apps/web/src/lib/auth-client.ts
- apps/web/src/app/api/auth/[...all]/route.ts
- apps/web/src/components/auth/"
    elif [[ "$TASK_LOWER" == *"stripe"* ]] || [[ "$TASK_LOWER" == *"payment"* ]] || [[ "$TASK_LOWER" == *"subscription"* ]]; then
        RELATED_FILES="- apps/web/src/app/api/webhooks/stripe/
- packages/database/src/schema.ts (subscription fields)
- .env (STRIPE_* variables)"
    elif [[ "$TASK_LOWER" == *"i18n"* ]] || [[ "$TASK_LOWER" == *"translation"* ]] || [[ "$TASK_LOWER" == *"locale"* ]]; then
        RELATED_FILES="- apps/web/src/messages/*.json
- apps/web/src/i18n/routing.ts
- apps/web/src/middleware.ts"
    elif [[ "$TASK_LOWER" == *"dashboard"* ]]; then
        RELATED_FILES="- apps/web/src/app/[locale]/(app)/dashboard/
- apps/web/src/components/dashboard/"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# GENERATE TASK FILE
# ═══════════════════════════════════════════════════════════════════════════════
generate_task_file() {
    print_step "Generating task file..."
    
    detect_related_files
    
    cat > "$TASK_FILE" << EOF
---
task_name: "$TASK_NAME"
task_type: "$TASK_TYPE"
priority: "$PRIORITY"
estimate: "$ESTIMATE"
test_level: "$TEST_LEVEL"
roadmap_ref: "$ROADMAP_REF"
start_time: "$(date)"
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

    # Add related files section
    cat >> "$TASK_FILE" << EOF

## 🔗 Related Files
EOF

    if [ -n "$RELATED_FILES" ]; then
        echo "$RELATED_FILES" >> "$TASK_FILE"
    else
        echo "<!-- Add discovered file paths here -->" >> "$TASK_FILE"
    fi

    # Add active context section
    cat >> "$TASK_FILE" << EOF

## 📂 Active Context
<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Notes
<!-- Add implementation notes, decisions, blockers here -->

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
\`\`\`
EOF

    print_success "Task file created: $TASK_FILE"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═══════════════════════════════════════════════════════════════════════════════
main() {
    print_header
    preflight_checks
    archive_previous_task
    gather_inputs "$1"
    capture_qa_baseline
    generate_task_file
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✅ TASK INITIALIZED SUCCESSFULLY${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "📄 Task File: ${CYAN}$TASK_FILE${NC}"
    echo -e "📊 Priority:  ${CYAN}$PRIORITY${NC}"
    echo -e "🧪 Tests:     ${CYAN}$TEST_LEVEL${NC}"
    echo ""
    echo -e "${YELLOW}💡 Next Steps:${NC}"
    echo "   1. Review and fill in the task file details"
    echo "   2. Ask the Agent to read the task file"
    echo "   3. Follow the 10x workflow: Explore → Plan → Execute → Verify"
    echo ""
    
    # Try to open in VS Code
    code "$TASK_FILE" 2>/dev/null || echo "   (Open $TASK_FILE in your editor)"
}

main "$1"
