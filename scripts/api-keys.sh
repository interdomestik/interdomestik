#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════════════
# 🔑 INTERDOMESTIK API KEY MANAGEMENT
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

trim_value() {
    echo "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# API key structure
declare -A API_KEYS=(
    ["stripe"]="https://api.stripe.com/v1"
    ["openai"]="https://api.openai.com/v1"
    ["resend"]="https://api.resend.com"
    ["paddle"]="https://vendors.paddle.com/api/2.0"
    ["github"]="https://api.github.com"
    ["supabase"]="https://api.supabase.io"
)

# Check API key usage
check_usage() {
    local service="$1"
    local api_key="$2"
    
    log_info "Checking $service API key usage..."
    
    case "$service" in
        "stripe")
            check_stripe_usage "$api_key"
            ;;
        "openai")
            check_openai_usage "$api_key"
            ;;
        "resend")
            check_resend_usage "$api_key"
            ;;
        "paddle")
            check_paddle_usage "$api_key"
            ;;
        "github")
            check_github_usage "$api_key"
            ;;
        *)
            log_warning "Usage check not implemented for $service"
            ;;
    esac
}

# Stripe usage check
check_stripe_usage() {
    local api_key="$1"
    
    if command -v curl &> /dev/null; then
        local response=$(curl -s -u "$api_key:" "https://api.stripe.com/v1/balance" 2>/dev/null || echo "")
        
        if [[ -n "$response" ]] && echo "$response" | grep -q "available"; then
            local balance=$(echo "$response" | grep -o '"amount":[0-9]*' | cut -d':' -f2)
            log_success "Stripe API key is valid. Balance: $balance cents"
        else
            log_error "Stripe API key is invalid or expired"
        fi
    else
        log_warning "curl is required to check Stripe usage"
    fi
}

# OpenAI usage check
check_openai_usage() {
    local api_key="$1"
    
    if command -v curl &> /dev/null; then
        local response=$(curl -s -H "Authorization: Bearer $api_key" "https://api.openai.com/v1/usage" 2>/dev/null || echo "")
        
        if [[ -n "$response" ]] && echo "$response" | grep -q "total_usage"; then
            local usage=$(echo "$response" | grep -o '"total_usage":[0-9]*' | cut -d':' -f2)
            log_success "OpenAI API key is valid. Usage: $usage tokens"
        else
            log_error "OpenAI API key is invalid or expired"
        fi
    else
        log_warning "curl is required to check OpenAI usage"
    fi
}

# Resend usage check
check_resend_usage() {
    local api_key="$1"
    
    if command -v curl &> /dev/null; then
        local response=$(curl -s -H "Authorization: Bearer $api_key" "https://api.resend.com/domains" 2>/dev/null || echo "")
        
        if [[ -n "$response" ]] && echo "$response" | grep -q "data"; then
            local domains=$(echo "$response" | grep -o '"data":\[[^]]*\]' | grep -o '"id":"[^"]*"' | wc -l || echo "0")
            log_success "Resend API key is valid. Domains: $domains"
        else
            log_error "Resend API key is invalid or expired"
        fi
    else
        log_warning "curl is required to check Resend usage"
    fi
}

# Generate API key alert
create_alert() {
    local service="$1"
    local api_key="$2"
    local usage="$3"
    
    log_warning "Creating alert for $service API key usage..."
    
    # Create alert configuration
    cat > "scripts/alerts/${service}-usage.json" << EOF
{
  "service": "$service",
  "api_key_prefix": "${api_key:0:8}...",
  "current_usage": "$usage",
  "alert_thresholds": {
    "stripe": 5000,  # $50 USD
    "openai": 100000,  # 100k tokens
    "resend": 3000,   # 3000 emails/month
    "paddle": 100     # 100 transactions
  },
  "last_checked": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "alert_email": "admin@interdomestik.dev"
}
EOF
    
    log_success "Alert configuration created for $service"
}

# Monitor all API keys
monitor_all() {
    local env_file="${1:-.env.local}"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        return 1
    fi
    
    log_info "Monitoring API key usage..."
    
    # Check each service API key
    for service in "${!API_KEYS[@]}"; do
        local api_key_var=""
        
        case "$service" in
            "stripe")
                api_key_var="STRIPE_SECRET_KEY"
                ;;
            "openai")
                api_key_var="OPENAI_API_KEY"
                ;;
            "resend")
                api_key_var="RESEND_API_KEY"
                ;;
            "paddle")
                api_key_var="PADDLE_API_KEY"
                ;;
            "github")
                api_key_var="GITHUB_CLIENT_SECRET"
                ;;
            "supabase")
                api_key_var="SUPABASE_SERVICE_ROLE_KEY"
                ;;
        esac
        
        local api_key=$(grep "^${api_key_var}=" "$env_file" 2>/dev/null | cut -d'=' -f2 || echo "")
        
        if [[ -n "$api_key" && "$api_key" != "sk_test_YOUR_STRIPE_KEY" && "$api_key" != "sk-YOUR_OPENAI_KEY" ]]; then
            check_usage "$service" "$api_key"
        else
            log_info "Skipping $service (not configured or using placeholder)"
        fi
    done
}

# Rotate API key
rotate_key() {
    local service="$1"
    local env_file="${2:-.env.local}"
    
    log_info "Rotating $service API key..."
    
    # Backup current key
    local backup_file="backups/${service}_key_backup_$(date +%Y%m%d_%H%M%S).txt"
    mkdir -p backups
    
    case "$service" in
        "stripe")
            local current_key=$(grep "STRIPE_SECRET_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2 || echo "")
            if [[ -n "$current_key" ]]; then
                echo "Current Stripe key: $current_key" > "$backup_file"
                log_success "Current Stripe key backed up to $backup_file"
            fi
            log_info "Generate new key at: https://dashboard.stripe.com/test/apikeys"
            ;;
        "openai")
            local current_key=$(grep "OPENAI_API_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2 || echo "")
            if [[ -n "$current_key" ]]; then
                echo "Current OpenAI key: $current_key" > "$backup_file"
                log_success "Current OpenAI key backed up to $backup_file"
            fi
            log_info "Generate new key at: https://platform.openai.com/api-keys"
            ;;
        *)
            log_warning "Rotation not implemented for $service"
            return 1
            ;;
    esac
    
    log_warning "Remember to update $env_file with the new key"
}

# Validate API keys format
validate_keys() {
    local env_file="${1:-.env.local}"
    
    log_info "Validating API key formats..."
    
    local validation_failed=0
    
    # Stripe key format (sk_test_ or sk_live_)
    local stripe_key=$(grep "STRIPE_SECRET_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2 || echo "")
    if [[ -n "$stripe_key" && ! "$stripe_key" =~ ^sk_(test|live)_[a-zA-Z0-9]+$ ]]; then
        log_error "Invalid Stripe key format"
        validation_failed=1
    fi
    
    # OpenAI key format (sk-)
    local openai_key=$(grep "OPENAI_API_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2 || echo "")
    if [[ -n "$openai_key" && ! "$openai_key" =~ ^sk-[a-zA-Z0-9]+$ ]]; then
        log_error "Invalid OpenAI key format"
        validation_failed=1
    fi
    
    # Resend key format (re_)
    local resend_key=$(grep "RESEND_API_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2 || echo "")
    if [[ -n "$resend_key" && ! "$resend_key" =~ ^re_[a-zA-Z0-9]+$ ]]; then
        log_error "Invalid Resend key format"
        validation_failed=1
    fi
    
    if [[ $validation_failed -eq 0 ]]; then
        log_success "All API key formats are valid"
    else
        log_error "API key format validation failed"
        return 1
    fi
}

# Validate that dev envs do not use production keys
validate_dev_keys() {
    local env_file="${1:-.env.local}"

    log_info "Validating development-only API keys..."

    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        return 1
    fi

    local validation_failed=0

    local stripe_key=$(grep "^STRIPE_SECRET_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2- || echo "")
    stripe_key=$(trim_value "$stripe_key")
    if [[ -n "$stripe_key" && "$stripe_key" =~ ^sk_live_ ]]; then
        log_error "Stripe secret key is live (sk_live_)"
        validation_failed=1
    fi

    local stripe_publishable=$(grep "^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2- || echo "")
    stripe_publishable=$(trim_value "$stripe_publishable")
    if [[ -n "$stripe_publishable" && "$stripe_publishable" =~ ^pk_live_ ]]; then
        log_error "Stripe publishable key is live (pk_live_)"
        validation_failed=1
    fi

    local paddle_env=$(grep "^NEXT_PUBLIC_PADDLE_ENV=" "$env_file" 2>/dev/null | cut -d'=' -f2- || echo "")
    paddle_env=$(trim_value "$paddle_env")
    local paddle_key=$(grep "^PADDLE_API_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2- || echo "")
    paddle_key=$(trim_value "$paddle_key")
    if [[ -n "$paddle_key" ]]; then
        local effective_env="${paddle_env:-sandbox}"
        if [[ "$effective_env" != "production" && "$paddle_key" =~ ^(live_|pdl_live_) ]]; then
            log_error "Paddle API key looks live while NEXT_PUBLIC_PADDLE_ENV=${effective_env}"
            validation_failed=1
        fi
    fi

    if [[ $validation_failed -eq 0 ]]; then
        log_success "Development API keys look non-production"
    else
        log_error "Development-only API key validation failed"
        return 1
    fi
}

# Setup monitoring
setup_monitoring() {
    log_info "Setting up API key monitoring..."
    
    # Create alert directory
    mkdir -p scripts/alerts
    mkdir -p backups
    
    # Create monitoring script
    cat > scripts/monitor-api-keys.sh << 'EOF'
#!/bin/bash

# API Key Monitoring Script
# Run this script weekly to monitor usage

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=== API Key Usage Monitor ==="
echo "Date: $(date)"
echo ""

# Check all API keys
if command -v ./scripts/api-keys.sh &>/dev/null; then
    ./scripts/api-keys.sh monitor
fi

echo ""
echo "Recommendation: Run 'npm audit' to check for dependency vulnerabilities"
echo ""

EOF

    chmod +x scripts/monitor-api-keys.sh
    log_success "API key monitoring script created"
}

# Main menu
show_help() {
    echo -e "${BLUE}
🔑 Interdomestik API Key Management

Usage: $0 [command] [options]

Commands:
  monitor [file]       Check usage of all API keys
  rotate [service]      Rotate API key for specified service
  validate [file]      Validate API key formats
  validate-dev [file]  Validate dev env uses test/sandbox keys
  setup               Set up monitoring tools
  help                Show this help

Services: stripe, openai, resend, paddle, github, supabase

Examples:
  $0 monitor                  # Check all API key usage
  $0 monitor .env.production  # Check production keys
  $0 rotate stripe            # Generate Stripe rotation plan
  $0 validate                # Validate key formats
  $0 validate-dev            # Validate dev env keys are non-production
  $0 setup                  # Set up monitoring

${NC}"
}

# Main execution
main() {
    case "${1:-help}" in
        "monitor")
            monitor_all "${2:-.env.local}"
            ;;
        "rotate")
            rotate_key "${2:-stripe}" "${3:-.env.local}"
            ;;
        "validate")
            validate_keys "${2:-.env.local}"
            ;;
        "validate-dev")
            validate_dev_keys "${2:-.env.local}"
            ;;
        "setup")
            setup_monitoring
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Create necessary directories
mkdir -p scripts/alerts
mkdir -p backups

# Run main function
main "$@"
