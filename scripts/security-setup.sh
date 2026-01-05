#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════════════
# 🔒 INTERDOMESTIK DEVELOPMENT SECURITY SETUP SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
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

# Check if OpenSSL is available
check_openssl() {
    if ! command -v openssl &> /dev/null; then
        log_error "OpenSSL is required but not installed. Please install OpenSSL first."
        exit 1
    fi
    log_success "OpenSSL is available"
}

# Generate cryptographically secure secret
generate_secret() {
    local length=${1:-32}
    openssl rand -base64 "$length" | tr -d "=+/" | cut -c1-"$length"
}

# Generate hex secret
generate_hex_secret() {
    local length=${1:-16}
    openssl rand -hex "$length"
}

# Validate generated secrets
validate_secrets() {
    local env_file="$1"
    
    log_info "Validating generated secrets..."
    
    # Check if required secrets are present
    local required_secrets=(
        "BETTER_AUTH_SECRET"
        "CRON_SECRET" 
        "INTERNAL_ACTIONS_SECRET"
        "JWT_SECRET"
        "SESSION_SECRET"
    )
    
    for secret in "${required_secrets[@]}"; do
        if grep -q "^${secret}=" "$env_file"; then
            local secret_value=$(grep "^${secret}=" "$env_file" | cut -d'=' -f2)
            if [[ ${#secret_value} -ge 24 ]]; then
                log_success "${secret} is properly configured (${#secret_value} chars)"
            else
                log_error "${secret} is too short (${#secret_value} chars, minimum 24 required)"
                return 1
            fi
        else
            log_error "${secret} is missing from environment file"
            return 1
        fi
    done
}

# Check Supabase service binding
check_supabase_binding() {
    local config_file="supabase/config.toml"
    
    log_info "Checking Supabase service binding..."
    
    if [[ -f "$config_file" ]]; then
        local api_binding=$(grep -A5 "^\[api\]" "$config_file" | grep -E "^host\s*=" | cut -d'=' -f2 | tr -d ' "' || echo "not set")
        local studio_binding=$(grep -A5 "^\[studio\]" "$config_file" | grep -E "^host\s*=" | cut -d'=' -f2 | tr -d ' "' || echo "not set")
        
        if [[ "$api_binding" == "127.0.0.1" ]]; then
            log_success "API service bound to localhost only"
        else
            log_warning "API service binding: $api_binding (should be 127.0.0.1)"
        fi
        
        if [[ "$studio_binding" == "127.0.0.1" ]]; then
            log_success "Studio service bound to localhost only"
        else
            log_warning "Studio service binding: $studio_binding (should be 127.0.0.1)"
        fi
    else
        log_warning "Supabase config file not found at $config_file"
    fi
}

# Generate new .env.local file
generate_env_file() {
    local env_file=".env.local"
    
    log_info "Generating new secure development environment file..."
    
    # Backup existing file if it exists
    if [[ -f "$env_file" ]]; then
        log_warning "Backing up existing .env.local to .env.local.backup"
        cp "$env_file" "$env_file.backup"
    fi
    
    # Generate secrets
    local better_auth_secret=$(generate_secret 32)
    local cron_secret=$(generate_secret 24)
    local internal_actions_secret=$(generate_secret 32)
    local jwt_secret=$(generate_secret 24)
    local session_secret=$(generate_hex_secret 16)
    
    log_info "Generated all required secrets"
    
    # Create new environment file
    cat > "$env_file" << 'EOF'
# ═══════════════════════════════════════════════════════════════════════════════
# 🔒 INTERDOMESTIK LOCAL DEVELOPMENT ENVIRONMENT (AUTO-GENERATED)
# ═══════════════════════════════════════════════════════════════════════════════
#
# 🚨 SECURITY NOTICE:
# - This file contains DEVELOPMENT-ONLY secrets
# - Never commit to version control
# - Replace placeholder API keys with your actual development keys
# - Run this script again to regenerate all secrets
# ═══════════════════════════════════════════════════════════════════════════════

# 🔐 Authentication & Security Secrets (AUTO-GENERATED)
EOF
    
    # Add generated secrets
    echo "BETTER_AUTH_SECRET=$better_auth_secret" >> "$env_file"
    echo "CRON_SECRET=$cron_secret" >> "$env_file"
    echo "INTERNAL_ACTIONS_SECRET=$internal_actions_secret" >> "$env_file"
    echo "JWT_SECRET=$jwt_secret" >> "$env_file"
    echo "SESSION_SECRET=$session_secret" >> "$env_file"
    
    cat >> "$env_file" << 'EOF'

# 🌐 Supabase Local Development
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNRe1DMO4cI6Fcqw
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET=claim-evidence
NEXT_PUBLIC_SUPABASE_POLICY_BUCKET=policies

# 🗄️ Database Configuration
DATABASE_URL=postgresql://postgres:StrongDevPassword123!@127.0.0.1:54322/postgres

# 🚀 Application Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Interdomestik (Development)
NEXT_PUBLIC_DEFAULT_LOCALE=sq
NEXT_PUBLIC_LOCALES=sq,en

# 🔒 Security Configuration
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://0.0.0.0:3000,http://127.0.0.1:3000

# 🧪 Development Settings
PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV=false
SHOW_I18N_STATS=1

# 💳 Replace these with your actual development API keys:
# Get keys from respective dashboards
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_KEY
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_SECRET
STRIPE_WEBHOOK_SECRET=whsec_YOUR_STRIPE_WEBHOOK

OPENAI_API_KEY=sk-YOUR_OPENAI_KEY
RESEND_API_KEY=re_YOUR_RESEND_KEY
RESEND_FROM_EMAIL=no-reply@interdomestik.dev

GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=YOUR_GITHUB_CLIENT_SECRET

PADDLE_API_KEY=YOUR_PADDLE_KEY
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=YOUR_PADDLE_TOKEN
NEXT_PUBLIC_PADDLE_ENV=sandbox

# 📊 Optional Services
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
# NEXT_PUBLIC_SENTRY_DSN=
EOF
    
    log_success "Generated new .env.local with secure secrets"
    
    # Make file read-only for security
    chmod 600 "$env_file"
    log_success "Set .env.local permissions to 600 (read/write for owner only)"
}

# Security validation
run_security_checks() {
    log_info "Running comprehensive security validation..."
    
    # Check environment file
    if [[ -f ".env.local" ]]; then
        validate_secrets ".env.local"
    else
        log_error ".env.local file not found. Run: $0 generate"
        return 1
    fi
    
    # Check Supabase configuration
    check_supabase_binding
    
    # Check gitignore rules
    if grep -q "^\.env\.local$" .gitignore; then
        log_success ".env.local is properly ignored in .gitignore"
    else
        log_warning ".env.local is not in .gitignore - adding it"
        echo ".env.local" >> .gitignore
    fi
    
    # Check for exposed secrets in git (excluding binary files)
    if git rev-parse --git-dir > /dev/null 2>&1; then
        local exposed_secrets=$(git grep --cached --text -i -E "sk_[a-zA-Z0-9]{20,}|pk_[a-zA-Z0-9]{20,}|re_[a-zA-Z0-9]{20,}|whsec_[a-zA-Z0-9]{20,}" -- . ':(exclude)*.example' ':(exclude).tmp/*' ':(exclude)node_modules/*' 2>/dev/null | wc -l)
        exposed_secrets=${exposed_secrets//[^0-9]/}
        if [[ "$exposed_secrets" -eq 0 ]]; then
            log_success "No real API secrets found in git repository"
        else
            log_error "Found $exposed_secrets potential API secrets in git repository!"
            log_info "Run: git grep --cached --text -i -E \"sk_[a-zA-Z0-9]{20,}|pk_[a-zA-Z0-9]{20,}|re_[a-zA-Z0-9]{20,}|whsec_[a-zA-Z0-9]{20,}\" -- . \":(exclude)*.example\" \":(exclude).tmp/*\""
        fi
    fi
    
    log_success "Security validation completed"
}

# Main menu
show_help() {
    echo -e "${BLUE}
🔒 Interdomestik Development Security Script

Usage: $0 [command]

Commands:
  generate    Generate new secure .env.local with fresh secrets
  check       Run comprehensive security validation
  help        Show this help message

Examples:
  $0 generate    # Create new environment file with secure secrets
  $0 check       # Validate current security setup
  $0 help        # Show this help

${NC}"
}

# Main execution
main() {
    case "${1:-help}" in
        "generate")
            check_openssl
            generate_env_file
            run_security_checks
            ;;
        "check")
            run_security_checks
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Run main function
main "$@"
