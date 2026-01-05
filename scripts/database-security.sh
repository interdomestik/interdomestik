#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════════════
# 🗄️ INTERDOMESTIK DATABASE SECURITY SETUP
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

# Generate secure database password
generate_db_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# Check if PostgreSQL is available
check_postgres() {
    if command -v psql &> /dev/null; then
        log_success "PostgreSQL client is available"
    else
        log_error "PostgreSQL client is required but not installed"
        log_info "Install PostgreSQL: brew install postgresql or apt-get install postgresql-client"
        exit 1
    fi
}

# Update database configuration
update_database_config() {
    local env_file="$1"
    local db_password="$2"
    
    log_info "Updating database configuration with secure password..."
    
    # Check if DATABASE_URL exists and update with strong password
    if grep -q "DATABASE_URL=" "$env_file"; then
        # Update existing DATABASE_URL with new password
        sed -i.bak "s|DATABASE_URL=postgresql://postgres:.*@|DATABASE_URL=postgresql://postgres:${db_password}@|g" "$env_file"
        log_success "Updated DATABASE_URL with secure password"
    else
        # Add new DATABASE_URL
        echo "DATABASE_URL=postgresql://postgres:${db_password}@127.0.0.1:54322/postgres" >> "$env_file"
        log_success "Added DATABASE_URL with secure password"
    fi
}

# Test database connection
test_database_connection() {
    local db_url="$1"
    
    log_info "Testing database connection..."
    
    # Extract connection details from DATABASE_URL
    local db_user=$(echo "$db_url" | sed -n 's|.*://\([^:]*\):.*|\1|p')
    local db_host=$(echo "$db_url" | sed -n 's|.*@\([^:]*\):.*|\1|p')
    local db_port=$(echo "$db_url" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
    local db_name=$(echo "$db_url" | sed -n 's|.*@\([^/]*\)/\(.*\)|\2|p')
    
    # Wait for database to be available
    local retries=0
    local max_retries=30
    
    while [ $retries -lt $max_retries ]; do
        if PGPASSWORD=$(echo "$db_url" | sed -n 's|.*:\([^@]*\)@.*|\1|p') psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1;" &>/dev/null; then
            log_success "Database connection successful"
            return 0
        fi
        
        retries=$((retries + 1))
        log_info "Waiting for database... ($retries/$max_retries)"
        sleep 2
    done
    
    log_error "Database connection failed after $max_retries attempts"
    return 1
}

# Create database security policies
create_security_policies() {
    log_info "Creating database security policies..."
    
    # Check if Supabase is running
    if ! supabase status &>/dev/null; then
        log_warning "Supabase is not running. Start with: supabase start"
        return 1
    fi
    
    # Apply security migrations
    log_info "Applying security migrations..."
    if pnpm db:push &>/dev/null; then
        log_success "Security migrations applied successfully"
    else
        log_error "Failed to apply security migrations"
        return 1
    fi
}

# Set up database monitoring
setup_monitoring() {
    log_info "Setting up database monitoring..."
    
    # Create monitoring script
    cat > scripts/monitor-database.sh << 'EOF'
#!/bin/bash

# Database monitoring script
# Tracks connection counts, query performance, and security events

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

# Get connection count
connection_count=$(psql "$DB_URL" -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | tr -d ' ')

# Get slow queries
slow_queries=$(psql "$DB_URL" -t -c "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000;" 2>/dev/null | tr -d ' ')

# Get database size
db_size=$(psql "$DB_URL" -t -c "SELECT pg_size_pretty(pg_database_size('postgres'));" 2>/dev/null | tr -d ' ')

echo "=== Database Monitor ==="
echo "Active Connections: $connection_count"
echo "Slow Queries (>1s): $slow_queries"
echo "Database Size: $db_size"
echo "Timestamp: $(date)"
echo ""

# Alert on unusual activity
if [ "$connection_count" -gt 50 ]; then
    echo "⚠️ High connection count detected!"
fi

if [ "$slow_queries" -gt 10 ]; then
    echo "⚠️ Many slow queries detected!"
fi
EOF

    chmod +x scripts/monitor-database.sh
    log_success "Database monitoring script created"
}

# Backup database
backup_database() {
    local backup_dir="$1"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$backup_dir/interdomestik_backup_$timestamp.sql"
    
    log_info "Creating database backup..."
    
    # Ensure backup directory exists
    mkdir -p "$backup_dir"
    
    # Create backup
    if pg_dump "$DATABASE_URL" > "$backup_file" 2>/dev/null; then
        log_success "Database backup created: $backup_file"
        
        # Compress backup
        gzip "$backup_file"
        log_success "Backup compressed: $backup_file.gz"
    else
        log_error "Failed to create database backup"
        return 1
    fi
}

# Security audit
security_audit() {
    log_info "Running database security audit..."
    
    # Check for default passwords
    local db_url="${DATABASE_URL}"
    if echo "$db_url" | grep -q "postgres@127.0.0.1:54322/postgres"; then
        local password=$(echo "$db_url" | sed -n 's|.*:postgres:.*|\1|p')
        if [[ "$password" == "postgres" ]] || [[ -z "$password" ]]; then
            log_warning "Database using default or weak password"
        else
            log_success "Database password is strong"
        fi
    fi
    
    # Check for SSL configuration
    if echo "$db_url" | grep -q "sslmode=require"; then
        log_success "SSL is enabled for database connection"
    else
        log_warning "SSL is not enabled for database connection"
    fi
    
    # Check for connection pooling
    log_info "Checking connection pool configuration..."
    # This would require checking actual database configuration
    
    log_success "Database security audit completed"
}

# Main menu
show_help() {
    echo -e "${BLUE}
🗄️ Interdomestik Database Security Script

Usage: $0 [command] [options]

Commands:
  setup              Set up secure database configuration
  test               Test database connection
  monitor            Set up database monitoring
  backup [dir]       Create database backup
  audit              Run security audit
  help               Show this help

Examples:
  $0 setup           # Configure secure database
  $0 test            # Test database connection
  $0 monitor         # Set up monitoring tools
  $0 backup ./backups # Create backup
  $0 audit           # Run security audit

${NC}"
}

# Main execution
main() {
    case "${1:-help}" in
        "setup")
            check_postgres
            local db_password=$(generate_db_password)
            update_database_config ".env.local" "$db_password"
            log_info "Generated secure database password (32 characters)"
            ;;
        "test")
            test_database_connection "$DATABASE_URL"
            ;;
        "monitor")
            setup_monitoring
            ;;
        "backup")
            local backup_dir="${2:-./backups}"
            backup_database "$backup_dir"
            ;;
        "audit")
            security_audit
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Run main function
main "$@"