#!/bin/bash
set -e

# Production E2E Test Script
# Runs tests against a production build to avoid Turbopack/Dev-server flakes.

echo "🏗️  Building application..."
cd apps/web
pnpm build

echo "🚀 Starting production server..."
# Start server in background
pnpm start --port 3000 > server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to be ready
echo "⏳ Waiting for server to be ready..."
until curl -s -I http://localhost:3000 > /dev/null; do
  sleep 1
done
echo "✅ Server is up!"

# Run tests
echo "🧪 Running E2E tests..."
# Go back to root for playwright command context (or run via filter)
cd ../..
pnpm --filter @interdomestik/web test:e2e --reporter=list

# Cleanup
echo "🧹 Cleaning up..."
kill $SERVER_PID
echo "Done."
