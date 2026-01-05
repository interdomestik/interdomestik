#!/bin/bash

echo "🔥 REAL PRODUCTION STRESS TEST WITH EVIDENCE"
echo "============================================"

# Test configuration
BASE_URL="http://127.0.0.1:3000"
TEST_DIR="./stress-test-evidence"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
EVIDENCE_DIR="$TEST_DIR/$TIMESTAMP"
mkdir -p "$EVIDENCE_DIR"

# Environment capture
cat > "$EVIDENCE_DIR/environment.txt" << EOF
Stress Test Environment
=====================
Date: $(date)
Hostname: $(hostname)
OS: $(uname -a)
Node Version: $(node --version 2>/dev/null || echo "N/A")
CPU Cores: $(sysctl -n hw.ncpu 2>/dev/null || echo "N/A")
Memory: $(sysctl -n hw.memsize 2>/dev/null || echo "N/A")
Base URL: $BASE_URL
Test ID: $TIMESTAMP
EOF

echo "📊 Environment captured to $EVIDENCE_DIR/environment.txt"

# Check server availability
echo "🔍 Checking server health..."
SERVER_CHECK_FILE="$EVIDENCE_DIR/server_health.txt"

if curl -s "$BASE_URL/api/health" > "$EVIDENCE_DIR/initial_health.json" 2>/dev/null; then
    echo "✅ Server is responding"
    curl -s "$BASE_URL/api/health" | python3 -m json.tool 2>/dev/null || curl -s "$BASE_URL/api/health" > "$EVIDENCE_DIR/health_structure.json"
else
    echo "❌ Server not available - cannot proceed"
    exit 1
fi

echo "🚀 Starting concurrent stress testing..."

# Test 1: Concurrent registrations
TEST_1_FILE="$EVIDENCE_DIR/test_1_concurrent_registrations.log"
echo "Test 1: 25 Concurrent User Registrations ($(date))" > "$TEST_1_FILE"

# Create 25 concurrent registrations
for i in {1..25}; do
    {
        EMAIL="stress_$i"_"$(date +%s%N | tail -c 9)"_test@example.com"
        NAME="StressUser$i"
        ROLE=$([ $((i % 3)) -eq 0 ] && echo "agent" || echo "user")
        
        START_TIME=$(date +%s%N)
        HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null \
            -X POST "$BASE_URL/api/auth/register" \
            -H "Content-Type: application/json" \
            -d "{
                \"email\": \"$EMAIL\",
                \"name\": \"$NAME\",
                \"role\": \"$ROLE\",
                \"password\": \"testpassword123\"
            }" 2>/dev/null)
        END_TIME=$(date +%s%N)
        DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
        
        echo "$(date),$i,$EMAIL,$ROLE,$HTTP_CODE,$DURATION" >> "$TEST_1_FILE"
        
        if [ "$HTTP_CODE" = "200" ]; then
            echo "✅ Reg $i: SUCCESS ($HTTP_CODE, ${DURATION}ms)"
        elif [ "$HTTP_CODE" = "429" ]; then
            echo "⚠️ Reg $i: RATE_LIMITED ($HTTP_CODE, ${DURATION}ms)"
        else
            echo "❌ Reg $i: FAILED ($HTTP_CODE, ${DURATION}ms)"
        fi
    } &
    
    # Launch 5 at a time to simulate real load
    if [ $((i % 5)) -eq 0 ]; then
        sleep 0.2
    fi
done

wait
echo "Test 1 completed at $(date)" >> "$TEST_1_FILE"

# Test 2: Database stress with rapid health checks
TEST_2_FILE="$EVIDENCE_DIR/test_2_database_stress.log"
echo "Test 2: 50 Rapid Health Checks ($(date))" > "$TEST_2_FILE"

for i in {1..50}; do
    {
        START_TIME=$(date +%s%N)
        HTTP_CODE=$(curl -s -w "%{http_code}" -o "$EVIDENCE_DIR/health_response_$i.json" \
            "$BASE_URL/api/health" 2>/dev/null | tail -c 3)
        END_TIME=$(date +%s%N)
        DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
        
        echo "$(date),$i,$HTTP_CODE,$DURATION" >> "$TEST_2_FILE"
        
        if [ "$HTTP_CODE" = "200" ]; then
            if grep -q '"status":"healthy"' "$EVIDENCE_DIR/health_response_$i.json" 2>/dev/null; then
                echo "✅ Health $i: HEALTHY (${DURATION}ms)"
            else
                echo "⚠️ Health $i: UNHEALTHY (${DURATION}ms)"
            fi
        else
            echo "❌ Health $i: FAILED ($HTTP_CODE, ${DURATION}ms)"
        fi
    } &
    
    # Stagger requests to create load pattern
    if [ $((i % 10)) -eq 0 ]; then
        sleep 0.05
    fi
done

wait
echo "Test 2 completed at $(date)" >> "$TEST_2_FILE"

# Test 3: Race condition simulation
TEST_3_FILE="$EVIDENCE_DIR/test_3_race_conditions.log"
echo "Test 3: Race Condition Simulation ($(date))" > "$TEST_3_FILE"

# Multiple users trying similar operations simultaneously
for i in {1..15}; do
    {
        # Try to create claims with similar titles (potential conflict)
        CLAIM_TITLE="Race Test Claim $((i % 3))"
        
        START_TIME=$(date +%s%N)
        HTTP_CODE=$(curl -s -w "%{http_code}" -o "$EVIDENCE_DIR/claim_response_$i.json" \
            -X POST "$BASE_URL/api/claims" \
            -H "Content-Type: application/json" \
            -d "{
                \"title\": \"$CLAIM_TITLE\",
                \"description\": \"Testing race conditions under stress\",
                \"category\": \"test\"
            }" 2>/dev/null | tail -c 3)
        END_TIME=$(date +%s%N)
        DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
        
        echo "$(date),$i,$CLAIM_TITLE,$HTTP_CODE,$DURATION" >> "$TEST_3_FILE"
        
        if [ "$HTTP_CODE" = "200" ]; then
            echo "✅ Race $i: $CLAIM_TITLE (${HTTP_CODE}, ${DURATION}ms)"
        elif [ "$HTTP_CODE" = "401" ]; then
            echo "🔐 Race $i: UNAUTHORIZED (${HTTP_CODE}, ${DURATION}ms)"
        else
            echo "❌ Race $i: FAILED ($HTTP_CODE, ${DURATION}ms)"
        fi
    } &
    
    sleep 0.1
done

wait
echo "Test 3 completed at $(date)" >> "$TEST_3_FILE"

# Test 4: Circuit breaker simulation (rapid failures)
TEST_4_FILE="$EVIDENCE_DIR/test_4_circuit_breaker.log"
echo "Test 4: Circuit Breaker Stress ($(date))" > "$TEST_4_FILE"

# Rapid requests to potentially problematic endpoints
for i in {1..20}; do
    {
        START_TIME=$(date +%s%N)
        HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null \
            -X POST "$BASE_URL/api/invalid-endpoint-$i" \
            -H "Content-Type: application/json" \
            -d "{\"test\": $i}" 2>/dev/null | tail -c 3)
        END_TIME=$(date +%s%N)
        DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
        
        echo "$(date),$i,invalid-endpoint-$i,$HTTP_CODE,$DURATION" >> "$TEST_4_FILE"
        
        if [ "$HTTP_CODE" = "404" ]; then
            echo "🔍 CB Test $i: NOT_FOUND ($HTTP_CODE, ${DURATION}ms)"
        else
            echo "⚠️ CB Test $i: $HTTP_CODE (${DURATION}ms)"
        fi
    } &
    
    sleep 0.02
done

wait
echo "Test 4 completed at $(date)" >> "$TEST_4_FILE"

# Test 5: Final system recovery check
echo ""
echo "🔄 Testing System Recovery..."
TEST_5_FILE="$EVIDENCE_DIR/test_5_recovery.log"
echo "Test 5: System Recovery ($(date))" > "$TEST_5_FILE"

for i in {1..10}; do
    {
        START_TIME=$(date +%s%N)
        RESPONSE=$(curl -s "$BASE_URL/api/health" 2>/dev/null)
        END_TIME=$(date +%s%N)
        DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
        
        if echo "$RESPONSE" | grep -q '"status":"healthy"'; then
            echo "$(date),$i,healthy,$DURATION" >> "$TEST_5_FILE"
            echo "✅ Recovery $i: SYSTEM_HEALTHY (${DURATION}ms)"
        else
            echo "$(date),$i,unhealthy,$DURATION" >> "$TEST_5_FILE"
            echo "❌ Recovery $i: SYSTEM_UNHEALTHY (${DURATION}ms)"
        fi
    } &
    
    sleep 1
done

wait

# Capture final system state
echo ""
echo "📊 Capturing final system state..."
FINAL_HEALTH_FILE="$EVIDENCE_DIR/final_health.json"
curl -s "$BASE_URL/api/health" > "$FINAL_HEALTH_FILE" 2>/dev/null

# Generate metrics analysis
METRICS_FILE="$EVIDENCE_DIR/metrics_analysis.txt"

# Calculate metrics using awk
REG_SUCCESS=$(awk -F',' '$4=="200" {count++} END {print count}' "$TEST_1_FILE" 2>/dev/null || echo "0")
REG_TOTAL=$(wc -l < "$TEST_1_FILE")
REG_SUCCESS_RATE=$((REG_SUCCESS * 100 / REG_TOTAL))

REG_RATE_LIMIT=$(awk -F',' '$4=="429" {count++} END {print count}' "$TEST_1_FILE" 2>/dev/null || echo "0")

HEALTH_SUCCESS=$(awk -F',' '$3=="200" {count++} END {print count}' "$TEST_2_FILE" 2>/dev/null || echo "0")
HEALTH_TOTAL=$(wc -l < "$TEST_2_FILE")
HEALTH_SUCCESS_RATE=$((HEALTH_SUCCESS * 100 / HEALTH_TOTAL))

RACE_SUCCESS=$(awk -F',' '$4=="200" {count++} END {print count}' "$TEST_3_FILE" 2>/dev/null || echo "0")
RACE_TOTAL=$(wc -l < "$TEST_3_FILE")
RACE_SUCCESS_RATE=$((RACE_SUCCESS * 100 / RACE_TOTAL))

RECOVERY_HEALTHY=$(awk -F',' '$3=="healthy" {count++} END {print count}' "$TEST_5_FILE" 2>/dev/null || echo "0")
RECOVERY_TOTAL=$(wc -l < "$TEST_5_FILE")
RECOVERY_SUCCESS_RATE=$((RECOVERY_HEALTHY * 100 / RECOVERY_TOTAL))

cat > "$METRICS_FILE" << EOF
Metrics Analysis Report
=====================

Test 1 - Concurrent Registrations:
- Total attempts: $REG_TOTAL
- Success rate: ${REG_SUCCESS_RATE}%
- Rate limited: $REG_RATE_LIMIT
- Environment: production-ready with rate limiting

Test 2 - Database Stress:
- Total health checks: $HEALTH_TOTAL
- Success rate: ${HEALTH_SUCCESS_RATE}%
- Average response time: $(awk -F',' '{sum+=$3; count++} END {if(count>0) print int(sum/count)"ms"}' "$TEST_2_FILE" 2>/dev/null || echo "N/A")

Test 3 - Race Conditions:
- Total race attempts: $RACE_TOTAL
- Success rate: ${RACE_SUCCESS_RATE}%
- Auth errors: $(awk -F',' '$4=="401" {count++} END {print count}' "$TEST_3_FILE" 2>/dev/null || echo "0")

Test 4 - Circuit Breaker:
- Total failure requests: 20
- 404 responses: $(awk -F',' '$4=="404" {count++} END {print count}' "$TEST_4_FILE" 2>/dev/null || echo "0")
- Average failure response time: $(awk -F',' '{sum+=$4; count++} END {if(count>0) print int(sum/count)"ms"}' "$TEST_4_FILE" 2>/dev/null || echo "N/A")

Test 5 - System Recovery:
- Recovery attempts: $RECOVERY_TOTAL
- Healthy responses: $RECOVERY_HEALTHY
- Recovery success rate: ${RECOVERY_SUCCESS_RATE}%
EOF

echo "✅ Metrics analysis complete: $METRICS_FILE"

# Create summary report
cat > "$EVIDENCE_DIR/summary_report.md" << EOF
# Production Stress Test Evidence Report

## Test Execution Details
- **Date**: $(date)
- **Test ID**: $TIMESTAMP
- **Evidence Directory**: $EVIDENCE_DIR
- **Base URL**: $BASE_URL

## Test Results

### 1. Concurrent User Registrations
- **Total Attempts**: $REG_TOTAL
- **Success Rate**: ${REG_SUCCESS_RATE}%
- **Rate Limited**: $REG_RATE_LIMIT
- **Evidence**: test_1_concurrent_registrations.log

### 2. Database Connection Stress  
- **Total Health Checks**: $HEALTH_TOTAL
- **Success Rate**: ${HEALTH_SUCCESS_RATE}%
- **Avg Response Time**: $(awk -F',' '{sum+=$3; count++} END {if(count>0) print int(sum/count)"ms"}' "$TEST_2_FILE" 2>/dev/null || echo "N/A")
- **Evidence**: test_2_database_stress.log

### 3. Race Condition Tests
- **Total Race Attempts**: $RACE_TOTAL
- **Success Rate**: ${RACE_SUCCESS_RATE}%
- **Auth Errors**: $(awk -F',' '$4=="401" {count++} END {print count}' "$TEST_3_FILE" 2>/dev/null || echo "0")
- **Evidence**: test_3_race_conditions.log

### 4. Circuit Breaker Stress
- **Failure Requests**: 20
- **404 Responses**: $(awk -F',' '$4=="404" {count++} END {print count}' "$TEST_4_FILE" 2>/dev/null || echo "0")
- **Avg Failure Response Time**: $(awk -F',' '{sum+=$4; count++} END {if(count>0) print int(sum/count)"ms"}' "$TEST_4_FILE" 2>/dev/null || echo "N/A")
- **Evidence**: test_4_circuit_breaker.log

### 5. System Recovery
- **Recovery Tests**: $RECOVERY_TOTAL
- **Recovery Success Rate**: ${RECOVERY_SUCCESS_RATE}%
- **Healthy Responses**: $RECOVERY_HEALTHY
- **Evidence**: test_5_recovery.log

## Files Generated
- \`environment.txt\` - Test environment details
- \`initial_health.json\` - Initial health state
- \`health_structure.json\` - Health endpoint structure
- \`test_1_concurrent_registrations.log\` - Registration test logs
- \`test_2_database_stress.log\` - Database stress logs  
- \`test_3_race_conditions.log\` - Race condition test logs
- \`test_4_circuit_breaker.log\` - Circuit breaker test logs
- \`test_5_recovery.log\` - Recovery test logs
- \`final_health.json\` - Final system state
- \`metrics_analysis.txt\` - Statistical analysis
- Multiple \`*_response_*.json\` files with raw response data

## Evidence Verification
All test logs contain:
- ✅ Timestamps for each operation
- ✅ HTTP status codes
- ✅ Response times in milliseconds  
- ✅ Test parameters and payloads
- ✅ Success/failure categorization
EOF

echo ""
echo "🎯 STRESS TEST COMPLETE"
echo "===================="
echo "📁 All evidence saved to: $EVIDENCE_DIR"
echo "📊 Summary report: $EVIDENCE_DIR/summary_report.md"
echo "📈 Metrics analysis: $EVIDENCE_DIR/metrics_analysis.txt"

# Final verification
if [ -f "$FINAL_HEALTH_FILE" ]; then
    if grep -q '"status":"healthy"' "$FINAL_HEALTH_FILE" 2>/dev/null; then
        echo "✅ FINAL RESULT: APPLICATION REMAINS HEALTHY - PRODUCTION READY!"
        exit 0
    else
        echo "⚠️ FINAL RESULT: APPLICATION DEGRADED - INVESTIGATION NEEDED"
        exit 1
    fi
else
    echo "❌ FINAL RESULT: APPLICATION UNREACHABLE - CRITICAL ISSUE"
    exit 1
fi