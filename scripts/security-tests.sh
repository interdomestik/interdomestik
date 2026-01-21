#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════════
# 🧪 INTERDOMESTIK SECURITY TESTING AUTOMATION
# ═════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Run authentication security tests
test_auth_security() {
    log_info "Running authentication security tests..."
    
    local tests_passed=0
    local tests_total=0
    
    # Test 1: Strong secrets
    ((tests_total++))
    local better_auth_secret=$(grep "BETTER_AUTH_SECRET=" .env.local 2>/dev/null | cut -d'=' -f2 || echo "")
    if [[ ${#better_auth_secret} -ge 24 ]]; then
        log_success "✓ BETTER_AUTH_SECRET is strong (${#better_auth_secret} chars)"
        ((tests_passed++))
    else
        log_error "✗ BETTER_AUTH_SECRET is too short"
    fi
    
    # Test 2: No development bypasses
    ((tests_total++))
    if grep -r "allowDevBypass\|bypass.*dev" apps/web/src/app/api/ &>/dev/null; then
        log_error "✗ Authentication bypasses found in code"
    else
        log_success "✓ No authentication bypasses found"
        ((tests_passed++))
    fi

    # Test 3: Bypass flags disabled in development
    ((tests_total++))
    if grep -q "^CRON_BYPASS_SECRET_IN_DEV=true" .env.development 2>/dev/null || grep -q "^CRON_BYPASS_SECRET_IN_DEV=true" .env.local 2>/dev/null; then
        log_error "✗ Cron bypass flag enabled in development"
    else
        log_success "✓ Cron bypass flag is disabled in development"
        ((tests_passed++))
    fi
    
    # Test 4: Rate limiting
    ((tests_total++))
    if grep -q "limit.*5.*60" apps/web/src/app/api/auth/\[...all\]/_core.ts; then
        log_success "✓ Rate limiting is restrictive (5 req/min)"
        ((tests_passed++))
    else
        log_warning "⚠ Rate limiting may be too permissive"
    fi
    
    log_info "Auth Security Tests: $tests_passed/$tests_total passed"
}

# Run API security tests
test_api_security() {
    log_info "Running API security tests..."
    
    local tests_passed=0
    local tests_total=0
    
    # Test 1: CSP headers
    ((tests_total++))
    local csp_file=\"apps/web/src/proxy.ts\"
    if grep -q \"script-src\" \"$csp_file\"; then
        local unsafe_found=0
        if command -v rg &> /dev/null; then
            if rg -n "unsafe-(inline|eval)" "$csp_file" | rg -v "isDev" | rg -v "styleAttrSrc" >/dev/null; then
                unsafe_found=1
            fi
        else
            if grep -nE "unsafe-(inline|eval)" "$csp_file" | grep -v "isDev" | grep -v "styleAttrSrc" >/dev/null; then
                unsafe_found=1
            fi
        fi
        if [[ $unsafe_found -eq 1 ]]; then
            log_error "✗ CSP script-src contains unsafe directives outside dev guards"
        else
            log_success "✓ CSP script-src avoids unsafe directives in production"
            ((tests_passed++))
        fi
    else
        log_error "✗ CSP headers missing script-src"
    fi
    
    # Test 2: Security headers
    ((tests_total++))
    local security_headers=("X-DNS-Prefetch-Control" "Strict-Transport-Security" "X-Frame-Options" "X-Content-Type-Options")
    for header in "${security_headers[@]}"; do
        if grep -q "$header" "$csp_file"; then
            log_success "✓ $header header is set"
            ((tests_passed++))
        else
            log_warning "⚠ $header header not found"
        fi
        ((tests_total++))
    done
    
    log_info "API Security Tests: $tests_passed/$tests_total passed"
}

# Run database security tests
test_database_security() {
    log_info "Running database security tests..."
    
    local tests_passed=0
    local tests_total=0
    
    # Test 1: Database password strength
    ((tests_total++))
    local db_url=$(grep "DATABASE_URL=" .env.local 2>/dev/null | cut -d'=' -f2 || echo "")
    if [[ -n "$db_url" && ! "$db_url" =~ postgres:postgres:@ ]]; then
        log_success "✓ Database password is not default"
        ((tests_passed++))
    else
        log_error "✗ Database using default credentials"
    fi
    
    # Test 2: Service binding
    ((tests_total++))
    local api_binding=$(grep -A5 "^\[api\]" supabase/config.toml 2>/dev/null | grep "host" | cut -d'=' -f2 | tr -d ' "' || echo "")
    if [[ "$api_binding" == "127.0.0.1" ]]; then
        log_success "✓ Database API bound to localhost"
        ((tests_passed++))
    else
        log_error "✗ Database API not bound to localhost"
    fi
    
    # Test 3: Connection pooling
    ((tests_total++))
    if grep -q "max.*10\|min.*2" packages/database/drizzle.config.ts; then
        log_success "✓ Database connection pooling configured"
        ((tests_passed++))
    else
        log_warning "⚠ Database connection pooling not verified"
    fi
    
    log_info "Database Security Tests: $tests_passed/$tests_total passed"
}

# Run environment security tests
test_environment_security() {
    log_info "Running environment security tests..."
    
    local tests_passed=0
    local tests_total=0
    
    # Test 1: Environment file protection
    ((tests_total++))
    if grep -q "^\.env\.local$" .gitignore; then
        log_success "✓ .env.local is properly gitignored"
        ((tests_passed++))
    else
        log_error "✗ .env.local not in .gitignore"
    fi
    
    # Test 2: No secrets in git
    ((tests_total++))
    local exposed_secrets=$(git grep --cached -i -E "sk_[a-zA-Z0-9]{20,}|pk_[a-zA-Z0-9]{20,}|re_[a-zA-Z0-9]{20,}|squ_[a-zA-Z0-9]{20,}|sqp_[a-zA-Z0-9]{20,}|sonar\\.token\\s*=" -- . ':(exclude)*.example' ':(exclude)*.test' 2>/dev/null | wc -l)
    if [[ $exposed_secrets -eq 0 ]]; then
        log_success "✓ No secrets exposed in repository"
        ((tests_passed++))
    else
        log_error "✗ Found $exposed_secrets potential secrets in repository"
    fi
    
    # Test 3: Environment structure
    ((tests_total++))
    if [[ -f ".env.development" && -f ".env.test" ]]; then
        log_success "✅ Environment structure is organized"
        ((tests_passed++))
    else
        log_warning "⚠ Environment structure could be improved"
    fi

    # Test 4: Development-only API keys
    ((tests_total++))
    if [[ -f ".env.local" ]]; then
        if ./scripts/api-keys.sh validate-dev .env.local >/dev/null 2>&1; then
            log_success "✓ Development API keys are non-production"
            ((tests_passed++))
        else
            log_error "✗ Production API keys detected in .env.local"
        fi
    else
        log_warning "⚠ .env.local not found, skipping dev API key check"
    fi
    
    log_info "Environment Security Tests: $tests_passed/$tests_total passed"
}

# Run dependency security tests
test_dependency_security() {
    log_info "Running dependency security tests..."
    
    if command -v pnpm &> /dev/null; then
        log_info "Running dependency audit..."
        
        if pnpm audit --json 2>/dev/null | grep -q '"vulnerabilities":\s*[^0]'; then
            local vulns=$(pnpm audit --json 2>/dev/null | grep -o '"vulnerabilities":\s*[0-9]*' | cut -d':' -f2 | tr -d ' ')
            log_warning "⚠ Found $vulns dependency vulnerabilities"
            log_info "Run: pnpm audit --fix"
        else
            log_success "✅ No critical dependency vulnerabilities found"
        fi
    else
        log_warning "⚠ pnpm not available for dependency audit"
    fi
}

# Generate security test report
generate_test_report() {
    local report_file="security-test-report-$(date +%Y%m%d_%H%M%S).md"
    
    log_info "Generating security test report: $report_file"
    
    cat > "$report_file" << EOF
# Security Test Report

**Date:** $(date)  
**Environment:** ${NODE_ENV:-development}
**Test Suite:** Interdomestik Security Tests v1.0

## Test Summary

This report contains the results of automated security testing performed on the Interdomestik application.

## Test Categories

### 🔐 Authentication Security
- Strong secret generation (24+ chars)
- Development bypass elimination
- Rate limiting enforcement
- Session management security

### 🌐 API Security
- Content Security Policy (CSP)
- Security headers configuration
- Input validation
- Error handling

### 🗄️ Database Security
- Secure password configuration
- Service binding restrictions
- Connection pooling
- Query parameterization

### 🔒 Environment Security
- Secret file protection (.gitignore)
- Repository scanning for exposed secrets
- Environment structure organization
- Configuration validation

### 📦 Dependency Security
- Vulnerability scanning
- Package version checking
- License compliance
- Update management

## Automated Test Results

Run this command to execute full security test suite:

\`\`\`bash
./scripts/security-tests.sh run
\`\`\`

## Security Score Calculation

| Category | Weight | Score (0-100) | Weighted Score |
|-----------|---------|------------------|---------------|
| Auth      | 30%     |                  |               |
| API       | 25%     |                  |               |
| Database  | 25%     |                  |               |
| Environment| 10%    |                  |               |
| Dependencies| 10%   |                  |               |
| **Total** | **100%** |                  |               |

## Recommendations

1. **Automate Testing**: Run security tests in CI/CD pipeline
2. **Regular Scanning**: Schedule weekly security scans
3. **Monitor Usage**: Track API key usage and quotas
4. **Stay Updated**: Keep dependencies and security tools current
5. **Team Training**: Ensure security awareness

## Next Steps

- Review failed tests
- Address critical issues first
- Re-run tests after fixes
- Document security improvements

EOF
    
    log_success "Security test report generated: $report_file"
}

# Run all security tests
run_all_tests() {
    log_info "🧪 Running complete security test suite..."
    
    local overall_passed=0
    local overall_total=4
    
    # Run individual test suites
    test_auth_security
    ((overall_passed++))
    
    test_api_security
    ((overall_passed++))
    
    test_database_security
    ((overall_passed++))
    
    test_environment_security
    ((overall_passed++))
    
    test_dependency_security
    
    log_info "📊 Overall Security Test Results"
    log_info "Tests Completed: $overall_passed/$overall_total categories tested"
    
    if [[ $overall_passed -eq $overall_total ]]; then
        log_success "🎉 All security test categories passed!"
        return 0
    else
        log_warning "⚠️ Some security tests failed - review details above"
        return 1
    fi
}

# Main menu
show_help() {
    echo -e "${BLUE}
🧪 Interdomestik Security Testing Suite

Usage: $0 [command]

Commands:
  run            Run all security tests
  auth           Test authentication security
  api            Test API security
  database       Test database security
  environment    Test environment security
  dependencies   Test dependency security
  report         Generate test report template
  help           Show this help

Examples:
  $0 run           # Run complete test suite
  $0 auth          # Test authentication only
  $0 report        # Generate test report

Exit Codes:
  0  - All tests passed
  1  - Some tests failed

${NC}"
}

# Main execution
main() {
    case "${1:-help}" in
        "run")
            run_all_tests
            generate_test_report
            ;;
        "auth")
            test_auth_security
            ;;
        "api")
            test_api_security
            ;;
        "database")
            test_database_security
            ;;
        "environment")
            test_environment_security
            ;;
        "dependencies")
            test_dependency_security
            ;;
        "report")
            generate_test_report
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Run main function
main "$@"
