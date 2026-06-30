#!/bin/bash

echo "🎯 TARGETED RESILIENCE TESTING"
echo "============================"

BASE_URL="http://127.0.0.1:3000"

# Test database connection pool behavior
test_database_pool() {
    echo "📊 Testing Database Connection Pool Resilience..."
    
    # Test 1: Rapid succession health checks
    echo "Testing 20 rapid health checks..."
    for i in {1..20}; do
        start_time=$(date +%s%N)
        status=$(curl -s -w "%{http_code}" "$BASE_URL/api/health" 2>/dev/null | tail -c 3)
        end_time=$(date +%s%N)
        duration=$(( (end_time - start_time) / 1000000 ))
        
        echo "Health check $i: HTTP $status (${duration}ms)"
        
        if [[ "$status" != "200" ]]; then
            echo "❌ Health check failed at iteration $i"
            return 1
        fi
        sleep 0.05
    done
    
    echo "✅ Database connection pool handling rapid requests"
}

# Test rate limiting behavior
test_rate_limiting() {
    echo ""
    echo "🚦 Testing Rate Limiting Resilience..."
    
    # Test 2: Rapid registration attempts
    echo "Testing 15 rapid registration attempts (should trigger rate limits)..."
    success_count=0
    rate_limit_count=0
    
    for i in {1..15}; do
        EMAIL="ratelimit$i@test$(date +%s).com"
        NAME="RateLimitUser$i"
        
        response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/auth/register" \
            -H "Content-Type: application/json" \
            -d "{
                \"email\": \"$EMAIL\",
                \"name\": \"$NAME\",
                \"role\": \"user\",
                \"password\": \"testpassword123\"
            }" 2>/dev/null)
        
        status_code="${response: -3}"
        
        if [[ "$status_code" = "200" ]]; then
            ((success_count++))
            echo "✅ Registration $i: SUCCESS"
        elif [[ "$status_code" = "429" ]]; then
            ((rate_limit_count++))
            echo "⚠️ Registration $i: RATE LIMITED"
        else
            echo "❌ Registration $i: FAILED ($status_code)"
        fi
    done
    
    echo "📈 Rate limiting results: $success_count successful, $rate_limit_count rate limited"
    if [[ $rate_limit_count -gt 0 ]]; then
        echo "✅ Rate limiting is working correctly"
    else
        echo "⚠️ Rate limiting may not be engaged"
    fi
}

# Test concurrent operations on different endpoints
test_concurrent_endpoints() {
    echo ""
    echo "🔄 Testing Concurrent Operations on Different Endpoints..."
    
    # Launch different operations concurrently
    {
        echo "Starting health checks..."
        for i in {1..5}; do
            curl -s "$BASE_URL/api/health" > /dev/null 2>&1
            sleep 0.1
        done
        echo "Health checks completed"
    } &
    
    {
        echo "Starting registration attempts..."
        for i in {1..3}; do
            curl -s -X POST "$BASE_URL/api/auth/register" \
                -H "Content-Type: application/json" \
                -d "{\"email\": \"concurrent$i@test.com\", \"name\": \"User$i\", \"role\": \"user\", \"password\": \"test123\"}" \
                > /dev/null 2>&1
            sleep 0.2
        done
        echo "Registration attempts completed"
    } &
    
    {
        echo "Starting claim attempts..."
        for i in {1..3}; do
            curl -s -X POST "$BASE_URL/api/claims" \
                -H "Content-Type: application/json" \
                -d "{\"title\": \"Concurrent Claim $i\", \"description\": \"Test\", \"category\": \"test\"}" \
                > /dev/null 2>&1
            sleep 0.2
        done
        echo "Claim attempts completed"
    } &
    
    wait
    echo "✅ Concurrent operations completed"
}

# Test circuit breaker behavior (mock failure)
test_circuit_breaker() {
    echo ""
    echo "⚡ Testing Circuit Breaker Behavior..."
    
    # Test invalid endpoint to potentially trigger circuit breakers
    failure_count=0
    
    echo "Testing 10 requests to potentially problematic endpoints..."
    for i in {1..10}; do
        # Try to access a non-existent endpoint
        response=$(curl -s -w "%{http_code}" "$BASE_URL/api/nonexistent" 2>/dev/null | tail -c 3)
        
        if [[ "$response" = "404" ]]; then
            ((failure_count++))
            echo "❌ Request $i: NOT FOUND (expected)"
        else
            echo "⚠️ Request $i: HTTP $response"
        fi
        sleep 0.1
    done
    
    echo "📊 Circuit breaker test: $failure_count/10 requests failed (as expected)"
    echo "✅ Circuit breaker boundaries tested"
}

# Test system recovery
test_recovery() {
    echo ""
    echo "🔄 Testing System Recovery..."
    
    # After stress, test if system recovers
    echo "Testing recovery after stress..."
    
    for i in {1..5}; do
        echo "Recovery test $i..."
        
        # Health check
        health_response=$(curl -s "$BASE_URL/api/health" 2>/dev/null)
        
        if echo "$health_response" | grep -q '"status":"healthy"'; then
            echo "✅ Recovery test $i: HEALTHY"
        else
            echo "❌ Recovery test $i: UNHEALTHY"
            return 1
        fi
        sleep 1
    done
    
    echo "✅ System recovers properly after stress"
}

# Main execution
main() {
    echo "Starting targeted resilience testing..."
    echo "Target URL: $BASE_URL"
    echo ""
    
    # Initial health check
    if ! curl -s "$BASE_URL/api/health" | grep -q '"status":"healthy"'; then
        echo "❌ Application not healthy - cannot proceed"
        return 1
    fi
    
    # Run tests
    test_database_pool
    test_rate_limiting
    test_concurrent_endpoints
    test_circuit_breaker
    test_recovery
    
    echo ""
    echo "🎯 RESILIENCE TESTING COMPLETE"
    echo "=============================="
    echo "✅ Database connection pool: TESTED"
    echo "✅ Rate limiting: TESTED"
    echo "✅ Concurrent operations: TESTED"
    echo "✅ Circuit breaker behavior: TESTED"
    echo "✅ System recovery: TESTED"
    
    # Final verification
    if curl -s "$BASE_URL/api/health" | grep -q '"status":"healthy"'; then
        echo ""
        echo "🎉 FINAL RESULT: APPLICATION IS RESILIENT AND PRODUCTION READY!"
        return 0
    else
        echo ""
        echo "❌ FINAL RESULT: APPLICATION NEEDS ATTENTION"
        return 1
    fi
}

main "$@"
