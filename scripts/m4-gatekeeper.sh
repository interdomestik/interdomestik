#!/bin/bash
set -e

echo "🚧 Starting M4 Gatekeeper Reset..."

# 1. Stop and Reset DB (This wipes the DB and applies ONLY Supabase Storage/Infra migrations)
echo "🧹 Resetting Supabase DB (clean slate)..."
npx supabase db reset --no-seed

# 2. Migrate Schema (Applies Drizzle Schema - Tables, Enums, Relations)
echo "🏗️  Applying Application Schema (Drizzle)..."
pnpm db:migrate

# 3. Seed Data (Deterministic E2E Seed)
echo "🌱 Seeding Data (Mode: E2E, Reset: True)..."
pnpm seed:e2e -- --reset

echo "✅ Gatekeeper Ready! Database is clean, migrated, and deterministically seeded."
