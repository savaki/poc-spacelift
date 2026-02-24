#!/bin/bash
# Seed data script for Spacelift Grove POC
# Posts data via the API to create test entities
set -e

BASE="http://127.0.0.1:19555"
TENANT="spacelift-admin"

echo "Seeding Spacelift Grove data..."

# 1. Create an organization
echo "Creating organization..."
ORG_RESULT=$(curl -s -X POST "$BASE/api/organization:create_organization" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT" \
  -d '{
    "name": "Summit Builders",
    "organization_type": "general_contractor",
    "email": "info@summitbuilders.com",
    "phone": "555-0100",
    "website": "https://summitbuilders.com",
    "description": "Full-service general contractor specializing in residential renovations"
  }')
echo "  Org result: $ORG_RESULT"
ORG_ID=$(echo "$ORG_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['record']['id'])" 2>/dev/null || echo "org-unknown")
echo "  Organization: $ORG_ID"

# 2. Create users
echo "Creating users..."
ADMIN_RESULT=$(curl -s -X POST "$BASE/api/user:create_user" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT" \
  -d '{
    "email": "admin@spacelift.com",
    "first_name": "Sarah",
    "last_name": "Admin",
    "role": "admin"
  }')
ADMIN_ID=$(echo "$ADMIN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['record']['id'])" 2>/dev/null || echo "admin-unknown")
echo "  Admin: $ADMIN_ID"

CONSULTANT_RESULT=$(curl -s -X POST "$BASE/api/user:create_user" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT" \
  -d '{
    "email": "maria@spacelift.com",
    "first_name": "Maria",
    "last_name": "Consultant",
    "role": "consultant"
  }')
CONSULTANT_ID=$(echo "$CONSULTANT_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['record']['id'])" 2>/dev/null || echo "consultant-unknown")
echo "  Consultant: $CONSULTANT_ID"

CONTRACTOR_RESULT=$(curl -s -X POST "$BASE/api/user:create_user" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT" \
  -d "{
    \"email\": \"bob@summitbuilders.com\",
    \"first_name\": \"Bob\",
    \"last_name\": \"Builder\",
    \"role\": \"contractor\",
    \"organization_id\": \"$ORG_ID\",
    \"phone\": \"555-0301\"
  }")
CONTRACTOR_ID=$(echo "$CONTRACTOR_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['record']['id'])" 2>/dev/null || echo "contractor-unknown")
echo "  Contractor: $CONTRACTOR_ID"

# 3. Create projects
echo "Creating projects..."
PROJECT1_RESULT=$(curl -s -X POST "$BASE/api/project:create_project" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT" \
  -d "{
    \"project_type\": \"kitchen\",
    \"homeowner_name\": \"John Smith\",
    \"homeowner_email\": \"john@example.com\",
    \"homeowner_phone\": \"555-0201\",
    \"address_street\": \"123 Oak Street\",
    \"address_city\": \"Austin\",
    \"address_state\": \"TX\",
    \"address_zip\": \"78701\",
    \"budget_min\": 25000,
    \"budget_max\": 50000
  }")
PROJECT1_ID=$(echo "$PROJECT1_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['record']['id'])" 2>/dev/null || echo "proj1-unknown")
echo "  Project 1 (Kitchen): $PROJECT1_ID"

PROJECT2_RESULT=$(curl -s -X POST "$BASE/api/project:create_project" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT" \
  -d "{
    \"project_type\": \"bathroom\",
    \"homeowner_name\": \"Jane Doe\",
    \"homeowner_email\": \"jane@example.com\",
    \"homeowner_phone\": \"555-0202\",
    \"address_street\": \"456 Elm Avenue\",
    \"address_city\": \"Austin\",
    \"address_state\": \"TX\",
    \"address_zip\": \"78702\",
    \"budget_min\": 15000,
    \"budget_max\": 30000
  }")
PROJECT2_ID=$(echo "$PROJECT2_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['record']['id'])" 2>/dev/null || echo "proj2-unknown")
echo "  Project 2 (Bathroom): $PROJECT2_ID"

# Note: Assign/approve/update operations require grove-server support for
# targeting existing records (not yet implemented in route handlers).
# Currently only @create actions work via route.grove.

echo ""
echo "Seed data created successfully!"
echo ""
echo "IDs for reference:"
echo "  Organization: $ORG_ID"
echo "  Admin User:   $ADMIN_ID"
echo "  Consultant:   $CONSULTANT_ID"
echo "  Contractor:   $CONTRACTOR_ID"
echo "  Project 1:    $PROJECT1_ID"
echo "  Project 2:    $PROJECT2_ID"
