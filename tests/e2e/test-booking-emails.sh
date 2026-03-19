#!/bin/bash
# E2E test: booking a visit triggers email notifications.
#
# Usage:
#   ./tests/e2e/test-booking-emails.sh          # mock mode (default)
#   ./tests/e2e/test-booking-emails.sh --live    # hits real Mailgun
#
# Environment variables (live mode):
#   MAILGUN_API_KEY   — Mailgun API key
#   MAILGUN_DOMAIN    — Mailgun sending domain

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

source "$SCRIPT_DIR/helpers.sh"

MODE="${1:-mock}"
MOCK_PORT=19666
MOCK_OUTPUT_DIR="/tmp/mock-mailgun"

# ---------------------------------------------------------------------------
# Cleanup trap
# ---------------------------------------------------------------------------
trap cleanup_all EXIT INT TERM

# ---------------------------------------------------------------------------
# 1. Start mock Mailgun (unless --live)
# ---------------------------------------------------------------------------
if [ "$MODE" != "--live" ]; then
    echo "=== Starting mock Mailgun server ==="
    start_mock_mailgun "$MOCK_PORT" "$MOCK_OUTPUT_DIR"
    MAILGUN_BASE="http://127.0.0.1:$MOCK_PORT"
else
    echo "=== Live mode: using real Mailgun API ==="
    MAILGUN_DOMAIN="${MAILGUN_DOMAIN:-mail.mzno.me}"
    MAILGUN_BASE="https://api.mailgun.net/v3/$MAILGUN_DOMAIN"
fi

# ---------------------------------------------------------------------------
# 2. Write test .secrets.yaml
# ---------------------------------------------------------------------------
echo "=== Configuring secrets ==="
cat > "$PROJECT_DIR/.secrets.yaml" <<EOF
mailgun_api_key: "${MAILGUN_API_KEY:-test-key-for-mock}"
mailgun_domain: "${MAILGUN_DOMAIN:-mock.mailgun.org}"
mailgun_base_url: "${MAILGUN_BASE}"
EOF
echo "  Mailgun base URL: $MAILGUN_BASE"

# ---------------------------------------------------------------------------
# 3. Start dev server (if not already running)
# ---------------------------------------------------------------------------
if curl -sf "$API_BASE/healthz" >/dev/null 2>&1; then
    echo "=== Dev server already running ==="
else
    echo "=== Starting dev server ==="
    cd "$PROJECT_DIR"
    bash start-dev.sh &
    SERVER_PID=$!
    export SERVER_PID

    # Wait for server
    for i in $(seq 1 30); do
        if curl -sf "$API_BASE/healthz" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    echo "  Server ready (pid $SERVER_PID)"
fi

# ---------------------------------------------------------------------------
# 4. Seed test data
# ---------------------------------------------------------------------------
echo ""
echo "=== Seeding test data ==="

echo "  Creating contractor..."
USER_ID=$(seed_contractor "john@summit.com" "John" "Summit")
echo "  Contractor ID: $USER_ID"

echo "  Creating availability..."
seed_availability "$USER_ID"

echo "  Creating project..."
PROJECT_ID=$(seed_project "$USER_ID" "Alice Johnson")
echo "  Project ID: $PROJECT_ID"

# ---------------------------------------------------------------------------
# 5. Book a visit (triggers visit_requested event → email workflow)
# ---------------------------------------------------------------------------
echo ""
echo "=== Booking visit ==="
VISIT_TOKEN=$(book_visit "$USER_ID" "$PROJECT_ID")
echo "  Visit token: $VISIT_TOKEN"

# ---------------------------------------------------------------------------
# 6. Wait for workflow to execute
# ---------------------------------------------------------------------------
echo ""
echo "=== Waiting for email workflow... ==="
sleep 5

# ---------------------------------------------------------------------------
# 7. Assert emails were sent
# ---------------------------------------------------------------------------
echo ""
echo "=== Checking results ==="

if [ "$MODE" != "--live" ]; then
    # Mock mode: check captured emails
    assert_email_count 2

    # Both emails should go to matt@manzano.studio (hardcoded in workflow)
    assert_email_to_contains "homeowner-recipient" "matt@manzano.studio"
    assert_email_to_contains "contractor-recipient" "matt@manzano.studio"

    # Homeowner email should contain the visit token (return link)
    assert_email_body_contains "homeowner-visit-link" "$VISIT_TOKEN"

    # Homeowner email should contain the scheduled date
    assert_email_body_contains "homeowner-date" "2026-04-01"

    # Contractor email should contain the homeowner notes
    assert_email_body_contains "contractor-notes" "Kitchen remodel"

    # Contractor email should contain the homeowner name
    assert_email_subject_contains "contractor-subject" "Alice Johnson"

    # Homeowner email should contain the contractor name
    assert_email_body_contains "homeowner-contractor" "John Summit"
else
    # Live mode: check Mailgun events API
    assert_mailgun_events 2
fi

echo ""
echo "========================================="
echo "  PASS: All email tests passed"
echo "========================================="
