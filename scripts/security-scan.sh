#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════════════
# 🔍 INTERDOMESTIK SECURITY SCANNER
# ═══════════════════════════════════════════════════════════════════════════════

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

# Security scan results
SEVERITY_CRITICAL=0
SEVERITY_HIGH=0
SEVERITY_MEDIUM=0
SEVERITY_LOW=0

# Scan for secrets in code
scan_secrets() {
    log_info "Scanning for exposed secrets in code..."
    
    local secrets_found=0
    
    # Common secret patterns
    local patterns=(
        "sk_[a-zA-Z0-9]{24,}"  # Stripe
        "pk_[a-zA-Z0-9]{24,}"  # Stripe public
        "sk-[a-zA-Z0-9]{20,}"  # OpenAI
        "re_[a-zA-Z0-9]{20,}"   # Resend
        "AIza[a-zA-Z0-9_-]{35}" # Google API
        "ghp_[a-zA-Z0-9]{36}"   # GitHub personal access
        "whsec_[a-zA-Z0-9]{20,}" # Webhook secrets
        "xox[baprs]-[a-zA-Z0-9-]{10,48}" # Slack
    )
    
    for pattern in "${patterns[@]}"; do
        if git grep -r --cached -E "$pattern" -- . ':(exclude)*.example' ':(exclude)*.test' ':(exclude)*.md' 2>/dev/null; then
            log_error "Potential secret found matching pattern: $pattern"
            ((secrets_found++))
            ((SEVERITY_CRITICAL++))
        fi
    done
    
    if [[ $secrets_found -eq 0 ]]; then
        log_success "No exposed secrets found in repository"
    else
        log_error "Found $secrets_found potential secrets in repository"
    fi
}

# Check dependency vulnerabilities
scan_dependencies() {
    log_info "Scanning for dependency vulnerabilities..."
    
    if command -v pnpm &> /dev/null; then
        if pnpm audit --json 2>/dev/null | grep -q '"vulnerabilities":\s*[^0]'; then
            local vulns=$(pnpm audit --json 2>/dev/null | grep -o '"vulnerabilities":\s*[0-9]*' | cut -d':' -f2 | tr -d ' ')
            log_warning "Found $vulns dependency vulnerabilities"
            ((SEVERITY_HIGH++))
        else
            log_success "No critical dependency vulnerabilities found"
        fi
    else
        log_warning "pnpm not found, skipping dependency scan"
    fi
}

# Check configuration security
scan_config() {
    log_info "Scanning configuration files for security issues..."
    
    # Check Supabase configuration
    if [[ -f "supabase/config.toml" ]]; then
        local api_host=$(grep -A5 "^\[api\]" supabase/config.toml | grep -E "^host\s*=" | cut -d'=' -f2 | tr -d ' "' || echo "0.0.0.0")
        local studio_host=$(grep -A5 "^\[studio\]" supabase/config.toml | grep -E "^host\s*=" | cut -d'=' -f2 | tr -d ' "' || echo "0.0.0.0")
        
        if [[ "$api_host" != "127.0.0.1" ]]; then
            log_warning "Supabase API not bound to localhost only"
            ((SEVERITY_MEDIUM++))
        fi
        
        if [[ "$studio_host" != "127.0.0.1" ]]; then
            log_warning "Supabase Studio not bound to localhost only"
            ((SEVERITY_MEDIUM++))
        fi
    fi
    
    # Check CSP configuration (Proxy-only)
    local csp_file="apps/web/src/proxy.ts"
    if [[ -f "$csp_file" ]]; then
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
            log_error "CSP script-src contains unsafe directives outside dev guards"
            ((SEVERITY_HIGH++))
        else
            log_success "CSP script-src avoids unsafe directives in production"
        fi
    fi
    
    # Check environment files
    local env_files=(".env" ".env.local" ".env.development" ".env.production")
    for env_file in "${env_files[@]}"; do
        if [[ -f "$env_file" && ! "$env_file" =~ \.example$ ]]; then
            if [[ "$env_file" == ".env.production" ]] && git check-ignore "$env_file" &>/dev/null; then
                log_error "Production environment file not properly ignored"
                ((SEVERITY_CRITICAL++))
            fi
        fi
    done
}

# Check code security patterns
scan_code() {
    log_info "Scanning code for security patterns..."
    
    # Check for eval usage
    if git grep -r --cached "eval\(" -- . ':(exclude)*.test*' 2>/dev/null; then
        log_warning "Unsafe eval() usage detected"
        ((SEVERITY_MEDIUM++))
    fi
    
    # Check for innerHTML usage
    if git grep -r --cached "innerHTML\s*=" -- . ':(exclude)*.test*' 2>/dev/null; then
        log_warning "innerHTML usage detected (potential XSS risk)"
        ((SEVERITY_MEDIUM++))
    fi
    
    # Check for SQL concatenation
    if git grep -r --cached "SELECT.*\+\|INSERT.*\+\|UPDATE.*\+" -- . ':(exclude)*.test*' -- ':(exclude)*.mjs' 2>/dev/null; then
        log_warning "SQL string concatenation detected (potential SQL injection)"
        ((SEVERITY_HIGH++))
    fi
    
    # Check for hardcoded secrets in code
    if git grep -r --cached -i -E "(password|secret|key)\s*=\s*['\"][^'\"]{8,}" -- . ':(exclude)*.example' ':(exclude)*.test*' 2>/dev/null; then
        log_error "Hardcoded credentials detected in code"
        ((SEVERITY_CRITICAL++))
    fi
}

# Check authentication security
scan_auth() {
    log_info "Scanning authentication security..."
    
    # Check auth configuration
    if [[ -f ".env.local" ]]; then
        local better_auth_secret=$(grep "BETTER_AUTH_SECRET=" .env.local 2>/dev/null | cut -d'=' -f2 || echo "")
        local cron_secret=$(grep "CRON_SECRET=" .env.local 2>/dev/null | cut -d'=' -f2 || echo "")
        
        if [[ ${#better_auth_secret} -lt 24 ]]; then
            log_error "BETTER_AUTH_SECRET is too short (< 24 chars)"
            ((SEVERITY_CRITICAL++))
        fi
        
        if [[ ${#cron_secret} -lt 16 ]]; then
            log_error "CRON_SECRET is too short (< 16 chars)"
            ((SEVERITY_CRITICAL++))
        fi
    fi
    
    # Check auth bypass
    if grep -r "allowDevBypass\|bypass.*dev" apps/web/src/app/api/ -- 2>/dev/null; then
        log_error "Authentication bypass detected in development"
        ((SEVERITY_CRITICAL++))
    fi

    # Check bypass flags in development env files
    for env_file in ".env.development" ".env.local"; do
        if [[ -f "$env_file" ]]; then
            if grep -q "^CRON_BYPASS_SECRET_IN_DEV=true" "$env_file"; then
                log_error "Cron bypass enabled in $env_file"
                ((SEVERITY_CRITICAL++))
            fi
            if grep -q "^PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV=true" "$env_file"; then
                log_warning "Paddle webhook bypass enabled in $env_file"
                ((SEVERITY_MEDIUM++))
            fi
        fi
    done
}

# Check database security
scan_database() {
    log_info "Scanning database security..."
    
    # Check database connection string
    if [[ -f ".env.local" ]]; then
        local db_url=$(grep "DATABASE_URL=" .env.local 2>/dev/null | cut -d'=' -f2 || echo "")
        
        if [[ -n "$db_url" ]]; then
            if [[ "$db_url" =~ postgres://postgres:postgres@ ]]; then
                log_error "Database using default credentials"
                ((SEVERITY_CRITICAL++))
            fi
            
            if ! [[ "$db_url" =~ 127\.0\.0\.1|localhost ]] && [[ "$NODE_ENV" == "development" ]]; then
                log_warning "Development database not using localhost"
                ((SEVERITY_MEDIUM++))
            fi
        fi
    fi
    
    # Check for RLS policies
    if find packages/database/src -name "*.sql" -exec grep -l "ROW LEVEL SECURITY" {} \; 2>/dev/null; then
        log_success "Row Level Security policies found"
    else
        log_warning "Row Level Security policies not found"
        ((SEVERITY_MEDIUM++))
    fi
}

# Generate security report
generate_report() {
    local report_file="security-scan-report-$(date +%Y%m%d_%H%M%S).md"
    
    log_info "Generating security report: $report_file"
    
    cat > "$report_file" << EOF
# Security Scan Report

**Date:** $(date)  
**Environment:** ${NODE_ENV:-development}
**Scanner:** Interdomestik Security Scanner v1.0

## Executive Summary

| Severity | Count | Status |
|----------|--------|---------|
| Critical | $SEVERITY_CRITICAL | $([ $SEVERITY_CRITICAL -eq 0 ] && echo "✅ Clean" || echo "🔴 Action Required") |
| High     | $SEVERITY_HIGH     | $([ $SEVERITY_HIGH -eq 0 ] && echo "✅ Clean" || echo "🔴 Action Required") |
| Medium   | $SEVERITY_MEDIUM   | $([ $SEVERITY_MEDIUM -eq 0 ] && echo "✅ Clean" || echo "⚠️ Review Recommended") |
| Low      | $SEVERITY_LOW      | $([ $SEVERITY_LOW -eq 0 ] && echo "✅ Clean" || echo "ℹ️ Monitor") |

## Detailed Findings

$(if [[ $SEVERITY_CRITICAL -gt 0 ]]; then echo "### 🚨 Critical Issues
Critical security vulnerabilities that require immediate attention. These could lead to system compromise."; fi)

$(if [[ $SEVERITY_HIGH -gt 0 ]]; then echo "### 🔴 High Issues
High-severity security issues that should be addressed soon. These could impact security significantly."; fi)

$(if [[ $SEVERITY_MEDIUM -gt 0 ]]; then echo "### ⚠️ Medium Issues  
Medium-severity issues that should be reviewed. These could become security problems under certain conditions."; fi)

## Recommendations

1. **Address Critical Issues First** - Fix all critical vulnerabilities immediately
2. **Monitor API Usage** - Regular check API key usage and quotas
3. **Update Dependencies** - Keep all dependencies up to date
4. **Regular Scans** - Run security scans weekly or before releases
5. **Security Training** - Ensure team understands security best practices

## Next Steps

- Review detailed findings above
- Create tickets for each issue
- Prioritize by severity level
- Schedule fixes accordingly

EOF
    
    log_success "Security report generated: $report_file"
    
    # Return appropriate exit code
    local total_issues=$((SEVERITY_CRITICAL + SEVERITY_HIGH + SEVERITY_MEDIUM + SEVERITY_LOW))
    if [[ $total_issues -eq 0 ]]; then
        return 0
    elif [[ $SEVERITY_CRITICAL -gt 0 || $SEVERITY_HIGH -gt 0 ]]; then
        return 1
    else
        return 2
    fi
}

# Main menu
show_help() {
    echo -e "${BLUE}
🔍 Interdomestik Security Scanner

Usage: $0 [command]

Commands:
  all               Run complete security scan
  secrets           Scan for exposed secrets
  dependencies      Scan for dependency vulnerabilities
  config            Scan configuration security
  code              Scan code security patterns
  auth              Scan authentication security
  database          Scan database security
  help              Show this help

Exit Codes:
  0  - No issues found
  1  - Critical/High issues found
  2  - Medium/Low issues found

${NC}"
}

# Main execution
main() {
    case "${1:-all}" in
        "all")
            echo "🔍 Running comprehensive security scan..."
            scan_secrets
            scan_dependencies
            scan_config
            scan_code
            scan_auth
            scan_database
            generate_report
            ;;
        "secrets")
            scan_secrets
            ;;
        "dependencies")
            scan_dependencies
            ;;
        "config")
            scan_config
            ;;
        "code")
            scan_code
            ;;
        "auth")
            scan_auth
            ;;
        "database")
            scan_database
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Run main function
main "$@"
