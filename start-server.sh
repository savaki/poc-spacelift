#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GROVE_DIR="$SCRIPT_DIR/../grove-2"
APP_PORT=19555

cleanup() {
    echo ""
    echo "Stopping server..."
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null
    fi
    wait 2>/dev/null
    echo "Server stopped."
    exit 0
}

trap cleanup EXIT INT TERM

echo ""
echo "Starting Spacelift Grove (project mode)..."
echo ""
echo "  admin      : curl -H 'X-Tenant-ID: spacelift-admin'      http://127.0.0.1:$APP_PORT"
echo "  consultant : curl -H 'X-Tenant-ID: spacelift-consultant'  http://127.0.0.1:$APP_PORT"
echo "  contractor : curl -H 'X-Tenant-ID: spacelift-contractor'  http://127.0.0.1:$APP_PORT"
echo ""

cd "$GROVE_DIR"
cargo run -p grove-server -- --project "$SCRIPT_DIR" --listen "127.0.0.1:$APP_PORT" &
SERVER_PID=$!

echo "Server running on port $APP_PORT. Press Ctrl+C to stop."
wait
