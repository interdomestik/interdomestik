#!/bin/bash

echo "🔥 QUICK STRESS TEST - Racing Conditions"
echo "======================================"

BASE_URL="http://127.0.0.1:3000"

# Test 1: 20 concurrent registrations
echo "🚀 Testing 20 concurrent registrations..."

for i in {1..20}; do
    {
        EMAIL="stress$i@test$(date +%s)${RANDOM}.com"
        NAME="StressUser$i"
        
        response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/auth/register" \
            -H "Content-Type: application/json" \
            -d "{
                \"email\": \"$EMAIL\",
                \"name\": \"$NAME\",
                \"role\": \"$(if [[ $((i % 2)) -eq 0 ]]; then echo 'agent'; else echo 'user'; fi)\",
                \"password\": \"testpassword123\"
            }" 2>/dev/null)
        
        status_code="${response: -3}"
        echo "Registration $i: HTTP $status_code"
        
        if [[ "$status_code" = "200" ]]; then
            echo "✅ SUCCESS: $EMAIL"
        elif [[ "$status_code" = "429" ]]; then
            echo "⚠️ RATE_LIMITED: $EMAIL"
        else
            echo "❌ FAILED: $EMAIL (HTTP $status_code)"
        fi
    } &
    
    # Launch 5 at a time
    if [[ $((i % 5)) -eq 0 ]]; then
        sleep 0.5
    fi
done

wait
echo "✅ Concurrent registrations completed"

# Test 2: Database stress
echo ""
echo "💾 Testing database connections..."

for i in {1..50}; do
    {
        response=$(curl -s -w "%{http_code}" "$BASE_URL/api/health" 2>/dev/null)
        
        if [[ "${response: -3}" = "200" ]]; then
            echo "✅ Health check $i: OK"
        else
            echo "❌ Health check $i: FAILED"
        fi
    } &
    
    if [[ $((i % 10)) -eq 0 ]]; then
        sleep 0.1
    fi
done

wait
echo "✅ Database stress test completed"

# Test 3: Race conditions on claims
echo ""
echo "🏁 Testing race conditions..."

for i in {1..10}; do
    {
        response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/claims" \
            -H "Content-Type: application/json" \
            -d "{
                \"title\": \"Race Test Claim\",
                \"description\": \"Testing race conditions\",
                \"category\": \"test\"
            }" 2>/dev/null)
        
        status_code="${response: -3}"
        echo "Race test $i: HTTP $status_code"
    } &
done

wait
echo "✅ Race condition test completed"

# Final health check
echo ""
echo "📊 Final health check..."
final_health=$(curl -s "$BASE_URL/api/health" 2>/dev/null)
if echo "$final_health" | grep -q '"status":"healthy"'; then
    echo "✅ Application remains healthy under stress"
    exit 0
else
    echo "❌ Application became unhealthy under stress"
    echo "$final_health"
    exit 1
fi
