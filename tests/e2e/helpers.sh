#!/bin/bash
# Shared helpers for E2E booking email tests.
#
# Source this file from test scripts:
#   source "$(dirname "$0")/helpers.sh"

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
API_BASE="${API_BASE:-http://127.0.0.1:19555}"
MOCK_PORT="${MOCK_PORT:-19666}"
MOCK_OUTPUT_DIR="${MOCK_OUTPUT_DIR:-/tmp/mock-mailgun}"

# ---------------------------------------------------------------------------
# Mock Mailgun
# ---------------------------------------------------------------------------

start_mock_mailgun() {
    local port="${1:-$MOCK_PORT}"
    local output_dir="${2:-$MOCK_OUTPUT_DIR}"
    rm -rf "$output_dir"
    mkdir -p "$output_dir"

    python3 "$(dirname "$0")/mock-mailgun.py" "$port" "$output_dir" &
    MOCK_PID=$!
    export MOCK_PID

    # Wait for server to be ready
    for i in $(seq 1 20); do
        if curl -sf "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
            echo "[helpers] Mock Mailgun ready on port $port (pid $MOCK_PID)"
            return 0
        fi
        sleep 0.25
    done
    echo "[helpers] ERROR: Mock Mailgun failed to start" >&2
    return 1
}

stop_mock_mailgun() {
    if [ -n "${MOCK_PID:-}" ] && kill -0 "$MOCK_PID" 2>/dev/null; then
        kill "$MOCK_PID" 2>/dev/null
        wait "$MOCK_PID" 2>/dev/null || true
        echo "[helpers] Mock Mailgun stopped"
    fi
}

# ---------------------------------------------------------------------------
# Data seeding
# ---------------------------------------------------------------------------

seed_contractor() {
    local email="${1:-john@summit.com}"
    local first="${2:-John}"
    local last="${3:-Summit}"

    local resp
    resp=$(curl -sf -X POST "$API_BASE/api/user:create_user" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$email\",
            \"first_name\": \"$first\",
            \"last_name\": \"$last\",
            \"role\": \"contractor\",
            \"phone\": \"555-0100\"
        }")

    local user_id
    user_id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('record',{}).get('id',''))" 2>/dev/null || echo "")
    if [ -z "$user_id" ]; then
        echo "[helpers] ERROR: Failed to create contractor. Response: $resp" >&2
        return 1
    fi
    echo "$user_id"
}

seed_availability() {
    local user_id="$1"
    local days=("monday" "tuesday" "wednesday" "thursday" "friday")

    for day in "${days[@]}"; do
        curl -sf -X POST "$API_BASE/api/availability:create_availability" \
            -H "Content-Type: application/json" \
            -d "{
                \"user_id\": \"$user_id\",
                \"day_of_week\": \"$day\",
                \"start_time\": \"09:00\",
                \"end_time\": \"17:00\"
            }" >/dev/null
    done
    echo "[helpers] Seeded Mon-Fri 9-5 availability for $user_id"
}

seed_project() {
    local contractor_id="$1"
    local homeowner_name="${2:-Alice Johnson}"

    local resp
    resp=$(curl -sf -X POST "$API_BASE/api/project:create_project" \
        -H "Content-Type: application/json" \
        -d "{
            \"project_type\": \"kitchen\",
            \"homeowner_name\": \"$homeowner_name\",
            \"address_street\": \"123 Oak St\",
            \"address_city\": \"Austin\",
            \"address_state\": \"TX\",
            \"address_zip\": \"78701\"
        }")

    local project_id
    project_id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('record',{}).get('id',''))" 2>/dev/null || echo "")
    if [ -z "$project_id" ]; then
        echo "[helpers] ERROR: Failed to create project. Response: $resp" >&2
        return 1
    fi
    echo "$project_id"
}

book_visit() {
    local contractor_id="$1"
    local project_id="$2"
    local visit_token
    visit_token=$(python3 -c "import uuid; print(str(uuid.uuid4()))")

    local resp
    resp=$(curl -sf -X POST "$API_BASE/api/visit:request_visit" \
        -H "Content-Type: application/json" \
        -d "{
            \"project_id\": \"$project_id\",
            \"contractor_id\": \"$contractor_id\",
            \"visit_token\": \"$visit_token\",
            \"homeowner_name\": \"Alice Johnson\",
            \"homeowner_email\": \"alice@example.com\",
            \"homeowner_phone\": \"555-0200\",
            \"scheduled_date\": \"2026-04-01\",
            \"start_time\": \"10:00\",
            \"end_time\": \"11:00\",
            \"visit_type\": \"initial_consultation\",
            \"location_street\": \"123 Oak St\",
            \"location_city\": \"Austin\",
            \"location_state\": \"TX\",
            \"location_zip\": \"78701\",
            \"homeowner_notes\": \"Kitchen remodel - need new cabinets and countertops\"
        }")

    echo "$visit_token"
}

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------

assert_email_count() {
    local expected="$1"
    local dir="${2:-$MOCK_OUTPUT_DIR}"
    local actual
    actual=$(find "$dir" -name "email_*.json" -type f | wc -l | tr -d ' ')

    if [ "$actual" -ne "$expected" ]; then
        echo "FAIL: Expected $expected emails, got $actual" >&2
        ls -la "$dir"/ >&2 2>/dev/null || true
        return 1
    fi
    echo "  OK: $actual emails captured"
}

assert_email_field_contains() {
    local label="$1"
    local field="$2"
    local expected="$3"
    local dir="${4:-$MOCK_OUTPUT_DIR}"

    local found=0
    for f in "$dir"/email_*.json; do
        [ -f "$f" ] || continue
        local val
        val=$(python3 -c "
import sys, json
d = json.load(open('$f'))
print(d.get('data',{}).get('$field',''))
" 2>/dev/null || echo "")
        if echo "$val" | grep -qi "$expected"; then
            found=1
            break
        fi
    done

    if [ "$found" -eq 0 ]; then
        echo "FAIL [$label]: No email with $field containing '$expected'" >&2
        for f in "$dir"/email_*.json; do
            [ -f "$f" ] && cat "$f" >&2
        done
        return 1
    fi
    echo "  OK [$label]: Found '$expected' in $field"
}

assert_email_to_contains() {
    local label="$1"
    local expected="$2"
    assert_email_field_contains "$label" "to" "$expected"
}

assert_email_body_contains() {
    local label="$1"
    local expected="$2"
    local dir="${3:-$MOCK_OUTPUT_DIR}"

    local found=0
    for f in "$dir"/email_*.json; do
        [ -f "$f" ] || continue
        local html
        html=$(python3 -c "
import sys, json
d = json.load(open('$f'))
print(d.get('data',{}).get('html',''))
" 2>/dev/null || echo "")
        if echo "$html" | grep -qi "$expected"; then
            found=1
            break
        fi
    done

    if [ "$found" -eq 0 ]; then
        echo "FAIL [$label]: No email body containing '$expected'" >&2
        return 1
    fi
    echo "  OK [$label]: Found '$expected' in email body"
}

assert_email_subject_contains() {
    local label="$1"
    local expected="$2"
    assert_email_field_contains "$label" "subject" "$expected"
}

# ---------------------------------------------------------------------------
# Mailgun Events API (live mode)
# ---------------------------------------------------------------------------

assert_mailgun_events() {
    local expected="$1"
    local domain="${MAILGUN_DOMAIN:-mail.mzno.me}"
    local api_key="${MAILGUN_API_KEY:-}"

    if [ -z "$api_key" ]; then
        echo "FAIL: MAILGUN_API_KEY not set for live mode" >&2
        return 1
    fi

    # Mailgun events can be delayed; poll for up to 30 seconds
    local actual=0
    for i in $(seq 1 6); do
        actual=$(curl -sf -u "api:$api_key" \
            "https://api.mailgun.net/v3/$domain/events?limit=10&event=accepted" \
            | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null || echo "0")
        if [ "$actual" -ge "$expected" ]; then
            echo "  OK: $actual events found in Mailgun (expected $expected)"
            return 0
        fi
        sleep 5
    done

    echo "FAIL: Expected $expected Mailgun events, got $actual" >&2
    return 1
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

cleanup_all() {
    stop_mock_mailgun
    if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    echo "[helpers] Cleanup complete"
}
