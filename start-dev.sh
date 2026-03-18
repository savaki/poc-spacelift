#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="$SCRIPT_DIR/.dev"
APP_PORT=19555

# --- Clone / update repos ---------------------------------------------------
# manzano depends on ../grove and console depends on ../../manzano-ui,
# so all three must be siblings under .dev/

clone_or_update() {
    local name=$1 repo=$2 dir="$DEV_DIR/$1"
    if [ ! -d "$dir" ]; then
        echo "Cloning $name..."
        git clone "$repo" "$dir"
    else
        echo "Updating $name..."
        git -C "$dir" pull --ff-only 2>/dev/null || echo "  (pull skipped — local changes or detached HEAD)"
    fi
}

mkdir -p "$DEV_DIR"
clone_or_update manzano    git@github.com:manzanohq/manzano.git
clone_or_update grove      git@github.com:manzanohq/grove.git
clone_or_update manzano-ui git@github.com:manzanohq/manzano-ui.git

# --- Build console (embedded into manzano-cli) ------------------------------
CONSOLE_DIR="$DEV_DIR/manzano/console"
if [ ! -d "$CONSOLE_DIR/build" ] || [ "$1" = "--rebuild-console" ]; then
    echo ""
    echo "Building console UI..."
    (cd "$CONSOLE_DIR" && npm install && npm run build)
fi

# --- Build manzano-cli ------------------------------------------------------
echo ""
echo "Building manzano-cli..."
cargo build -p manzano-cli \
    --manifest-path "$DEV_DIR/manzano/Cargo.toml"
echo ""

# --- Run with auto-restart ---------------------------------------------------
echo "Starting manzano dev with auto-restart..."
echo ""
echo "  Console  : http://localhost:$APP_PORT"
echo ""
echo "  Watching: apps/, modules/, .dev/grove/grove-*/src/"
echo "  Press Ctrl+C to stop."
echo ""

exec watchexec \
    --restart \
    --watch "$SCRIPT_DIR/apps" \
    --watch "$SCRIPT_DIR/modules" \
    --watch "$SCRIPT_DIR/grove.toml" \
    --watch "$DEV_DIR/grove/grove-server/src" \
    --watch "$DEV_DIR/grove/grove-core/src" \
    --watch "$DEV_DIR/grove/grove-cli/src" \
    --watch "$DEV_DIR/manzano/manzano-cli/src" \
    --exts yaml,sql,html,js,css,rs,toml,grove \
    -- \
    cargo run -p manzano-cli \
        --manifest-path "$DEV_DIR/manzano/Cargo.toml" \
        -- dev "$SCRIPT_DIR" --port $APP_PORT
