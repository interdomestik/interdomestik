#!/bin/bash
set -e

echo "🚀 Starting Interdomestik System (Full Automation)"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"

# Check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    print_success "Docker is running"

# Check if Supabase is running
check_supabase() {
    if docker ps --filter "name=supabase" --format "{{.Names}}" | grep -q "supabase"; then
        print_success "Supabase services are already running"
        return 0
    else
        print_warning "Supabase services not detected. Starting Supabase..."
        return 1
    fi

# Start Supabase if needed
start_supabase() {
    print_status "Starting Supabase services..."
    # Assuming Supabase is started via a separate docker-compose in supabase/ directory
    if [ -d "supabase" ] && [ -f "supabase/docker-compose.yml" ]; then
        cd supabase
        docker-compose up -d
        cd ..
        print_success "Supabase started"
    else
        print_warning "Supabase docker-compose not found in supabase/ directory"
        print_warning "Please ensure Supabase is running manually or update this script"
    fi

# Start infrastructure services
start_infrastructure() {
    print_status "Starting infrastructure services (Redis, Mailpit, MinIO)..."
    docker-compose --profile infra up -d
    print_success "Infrastructure services started"
    echo "   - Redis:    localhost:6379"
    echo "   - Mailpit:  http://localhost:8025"
    echo "   - MinIO:    http://localhost:9001"

# Wait for services to be healthy
wait_for_services() {
    print_status "Waiting for services to be ready..."

    # Wait for Redis
    print_status "Waiting for Redis..."
    timeout=30
    while [ $timeout -gt 0 ]; do
        if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
            print_success "Redis is ready"
            break
        fi
        sleep 1
        timeout=$((timeout - 1))
    done

    if [ $timeout -eq 0 ]; then
        print_warning "Redis didn't respond within 30 seconds, continuing anyway..."
    fi

    # Wait for MinIO
    print_status "Waiting for MinIO..."
    timeout=30
    while [ $timeout -gt 0 ]; do
        if curl -s http://localhost:9000/minio/health/ready >/dev/null 2>&1; then
            print_success "MinIO is ready"
            break
        fi
        sleep 1
        timeout=$((timeout - 1))
    done

    if [ $timeout -eq 0 ]; then
        print_warning "MinIO didn't respond within 30 seconds, continuing anyway..."
    fi

# Setup MinIO buckets
setup_minio() {
    print_status "Setting up MinIO buckets..."
    docker-compose --profile infra up createbuckets
    print_success "MinIO buckets created"

# Run database migrations and seeding
setup_database() {
    print_status "Setting up database..."

    # Generate database client
    print_status "Generating database client..."
    pnpm db:generate

    # Run migrations
    print_status "Running database migrations..."
    pnpm db:migrate

    # Seed database for e2e testing
    print_status "Seeding database for testing..."
    pnpm --filter @interdomestik/database seed:e2e -- --reset
    pnpm --filter @interdomestik/database seed:assert-e2e

    print_success "Database setup complete"

# Start the web application
start_web_app() {
    print_status "Starting web application..."
    docker-compose --profile gate up -d web --build
    print_success "Web application started"
    echo "   - Web App:  http://localhost:3000"

# Run smoke tests to verify everything works
run_smoke_tests() {
    print_status "Running smoke tests to verify system health..."
    if ./scripts/docker-run.sh pnpm test:smoke; then
        print_success "Smoke tests passed!"
    else
        print_error "Smoke tests failed!"
        exit 1
    fi

# Main execution
main() {
    echo "Interdomestik Automated Startup"
    echo "==============================="

    check_docker

    if ! check_supabase; then
        start_supabase
        # Give Supabase time to start
        print_status "Waiting 30 seconds for Supabase to initialize..."
        sleep 30
    fi

    start_infrastructure
    wait_for_services
    setup_minio
    setup_database
    start_web_app

    # Optional: run smoke tests
    read -p "Run smoke tests to verify everything works? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        run_smoke_tests
    fi

    echo ""
    print_success "🎉 System is ready!"
    echo ""
    echo "Access your application at:"
    echo "   - Web App:     http://localhost:3000"
    echo "   - Mailpit:     http://localhost:8025"
    echo "   - MinIO:       http://localhost:9001"
    echo "   - Supabase:    http://localhost:54323"
    echo ""
    echo "To stop everything: docker-compose down"
    echo "To stop everything including volumes: docker-compose down -v"


# Run main function
main "$@"</content>
<parameter name="filePath">/Users/arbenlila/development/interdomestik/scripts/start-system.sh}
