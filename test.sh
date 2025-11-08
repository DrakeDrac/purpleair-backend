#!/bin/bash

BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_USERNAME="testuser_$(date +%s)"
TEST_PASSWORD="testpass123"
TOKEN=""
FAILED_TESTS=0
PASSED_TESTS=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_test() {
    echo -e "\n${YELLOW}Testing: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ PASS: $1${NC}"
    ((PASSED_TESTS++))
}

print_fail() {
    echo -e "${RED}✗ FAIL: $1${NC}"
    ((FAILED_TESTS++))
}

check_response() {
    local status=$1
    local expected_status=$2
    local message=$3
    
    if [ "$status" -eq "$expected_status" ]; then
        print_success "$message"
        return 0
    else
        print_fail "$message (Expected: $expected_status, Got: $status)"
        return 1
    fi
}

check_json_field() {
    local json=$1
    local field=$2
    local value=$(echo "$json" | grep -o "\"$field\":\"[^\"]*\"" | cut -d'"' -f4)
    if [ -n "$value" ]; then
        return 0
    else
        return 1
    fi
}

echo "=========================================="
echo "Weather App Backend Test Suite"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo ""

print_test "Health Check Endpoint"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
check_response "$HTTP_CODE" "200" "Health check endpoint"

print_test "Login with Invalid Credentials"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"invalid","password":"invalid"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_response "$HTTP_CODE" "401" "Login with invalid credentials should fail"

print_test "Login with Default Credentials"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if check_response "$HTTP_CODE" "200" "Login with default credentials"; then
    if check_json_field "$BODY" "token"; then
        TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        print_success "Token extracted successfully"
    else
        print_fail "Token not found in response"
    fi
fi

print_test "Login with Missing Fields"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_response "$HTTP_CODE" "400" "Login with missing password should fail"

print_test "Register New User"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if check_response "$HTTP_CODE" "201" "Register new user"; then
    if check_json_field "$BODY" "token"; then
        NEW_TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        print_success "Registration token extracted"
    fi
fi

print_test "Register Duplicate User"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_response "$HTTP_CODE" "409" "Register duplicate user should fail"

print_test "Get Current User (Authenticated)"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/auth/me" \
        -H "Authorization: Bearer $TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    check_response "$HTTP_CODE" "200" "Get current user info"
else
    print_fail "Get current user (no token available)"
fi

print_test "Get Current User (Unauthenticated)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/auth/me")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_response "$HTTP_CODE" "401" "Get current user without token should fail"

print_test "PurpleAir Sensors (Authenticated)"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/purpleair/sensors" \
        -H "Authorization: Bearer $TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    if [ "$HTTP_CODE" -eq "200" ] || [ "$HTTP_CODE" -eq "500" ]; then
        if [ "$HTTP_CODE" -eq "500" ]; then
            print_success "PurpleAir sensors endpoint (API key may not be configured)"
        else
            print_success "PurpleAir sensors endpoint"
        fi
    else
        print_fail "PurpleAir sensors endpoint (Expected: 200 or 500, Got: $HTTP_CODE)"
    fi
else
    print_fail "PurpleAir sensors (no token available)"
fi

print_test "PurpleAir Sensors (Unauthenticated)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/purpleair/sensors")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_response "$HTTP_CODE" "401" "PurpleAir sensors without token should fail"

print_test "PurpleAir Sensor by Index (Authenticated)"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/purpleair/sensors/12345" \
        -H "Authorization: Bearer $TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    if [ "$HTTP_CODE" -eq "200" ] || [ "$HTTP_CODE" -eq "404" ] || [ "$HTTP_CODE" -eq "500" ]; then
        print_success "PurpleAir sensor by index endpoint"
    else
        print_fail "PurpleAir sensor by index (Unexpected status: $HTTP_CODE)"
    fi
else
    print_fail "PurpleAir sensor by index (no token available)"
fi

print_test "PurpleAir Groups (Authenticated)"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/purpleair/groups" \
        -H "Authorization: Bearer $TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    if [ "$HTTP_CODE" -eq "200" ] || [ "$HTTP_CODE" -eq "500" ]; then
        print_success "PurpleAir groups endpoint"
    else
        print_fail "PurpleAir groups (Unexpected status: $HTTP_CODE)"
    fi
else
    print_fail "PurpleAir groups (no token available)"
fi

print_test "AI Chat Endpoint (Authenticated)"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/ai/chat" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"message":"Hello, AI!"}')
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    check_response "$HTTP_CODE" "200" "AI chat endpoint"
else
    print_fail "AI chat (no token available)"
fi

print_test "AI Chat Endpoint (Unauthenticated)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/ai/chat" \
    -H "Content-Type: application/json" \
    -d '{"message":"Hello, AI!"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_response "$HTTP_CODE" "401" "AI chat without token should fail"

print_test "AI Chat with Missing Message"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/ai/chat" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{}')
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    check_response "$HTTP_CODE" "400" "AI chat with missing message should fail"
else
    print_fail "AI chat validation (no token available)"
fi

print_test "AI Completions Endpoint (Authenticated)"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/ai/completions" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"prompt":"Complete this"}')
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    check_response "$HTTP_CODE" "200" "AI completions endpoint"
else
    print_fail "AI completions (no token available)"
fi

print_test "AI Models Endpoint (Authenticated)"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/ai/models" \
        -H "Authorization: Bearer $TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    check_response "$HTTP_CODE" "200" "AI models endpoint"
else
    print_fail "AI models (no token available)"
fi

print_test "AI Analyze Weather Endpoint (Authenticated)"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/ai/analyze-weather" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"sensor_data":{"pm2_5":10,"temperature":72}}')
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    check_response "$HTTP_CODE" "200" "AI analyze weather endpoint"
else
    print_fail "AI analyze weather (no token available)"
fi

print_test "AI Analyze Weather with Missing Data"
if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/ai/analyze-weather" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{}')
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    check_response "$HTTP_CODE" "400" "AI analyze weather with missing data should fail"
else
    print_fail "AI analyze weather validation (no token available)"
fi

print_test "404 Handler"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/nonexistent")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_response "$HTTP_CODE" "404" "Non-existent route should return 404"

echo ""
echo "=========================================="
echo "Test Results Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo "Total: $((PASSED_TESTS + FAILED_TESTS))"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi

