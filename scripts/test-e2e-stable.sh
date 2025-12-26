#!/bin/bash
set -e

# E2E Test Runner for Stable Execution
# Usage: ./scripts/test-e2e-stable.sh

echo "🔍 Checking for running dev server..."
if ! lsof -i :3000 > /dev/null; then
    echo "🚀 Starting new dev server for testing..."
    pnpm dev &
    SERVER_PID=$!
    echo "Waiting for server to be ready..."
    # Simple wait loop or use wait-on if available
    sleep 10
else
    echo "✅ Dev server already running on port 3000"
fi

echo "🧪 Running E2E Tests (Chromium, 2 Workers)..."
export PLAYWRIGHT_EXTERNAL_SERVER=1
pnpm exec playwright test --project=chromium --workers=2

# Cleanup if we started the server
if [ ! -z "$SERVER_PID" ]; then
    echo "🧹 Stopping test server (PID $SERVER_PID)..."
    kill $SERVER_PID
fi

echo "✅ Tests completed successfully!"
