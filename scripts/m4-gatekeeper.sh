#!/bin/bash
set -e

echo "🚧 Starting M4 Gatekeeper Reset..."

# 0. Kill stale processes to ensure fresh env/config
echo "💀 Killing any stale processes on port 3000..."
PIDS="$(lsof -ti:3000 2>/dev/null || true)"
if [ -n "$PIDS" ]; then
  kill -9 $PIDS 2>/dev/null || true
fi
echo "✅ Port 3000 clear."

echo "🧹 Resetting Supabase DB (clean slate)..."

MAX_RETRIES=3
RETRY_COUNT=0
RESET_SUCCESS=false
RESET_PATH="UNKNOWN"

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  RETRY_COUNT=$((RETRY_COUNT+1))
  echo "📍 Attempt $RETRY_COUNT/$MAX_RETRIES..."
  
  if npx supabase db reset --no-seed; then
    RESET_SUCCESS=true
    RESET_PATH="RESET_OK"
    echo "✅ Supabase reset succeeded (Attempt $RETRY_COUNT)"
    break
  else
    echo "⚠️  Reset failed (Attempt $RETRY_COUNT/$MAX_RETRIES)"
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "   Retrying in 2s..."
      sleep 2
    fi
  fi
done

if [ "$RESET_SUCCESS" = false ]; then
  echo "❌ RESET FAILED after $MAX_RETRIES attempts."
  echo "🔄 ACTIVATING FALLBACK MODE..."
  RESET_PATH="FALLBACK"

  # Ensure Supabase is up (this is the key reliability gain)
  echo "fallback: ▶️  Ensuring Supabase is running..."
  npx supabase start >/dev/null 2>&1 || true

  echo "fallback: 🏗️  Applying Application Schema (Drizzle)..."
  pnpm db:migrate

  echo "fallback: 🌱 Seeding Data (Mode: E2E, Reset: True)..."
  pnpm seed:e2e -- --reset

  echo "✅ FALLBACK SEQUENCE COMPLETE."
  # NOTE: Do NOT exit here - allow tests to proceed
else
  # Normal path: Migrate and Seed after successful reset
  echo "🏗️  Applying Application Schema (Drizzle)..."
  pnpm db:migrate

  echo "🌱 Seeding Data (Mode: E2E, Reset: True)..."
  pnpm seed:e2e -- --reset
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Gatekeeper Ready! Path: $RESET_PATH | Attempts: $RETRY_COUNT"
echo "   Database is clean, migrated, and deterministically seeded."
echo "   Proceeding to tests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"