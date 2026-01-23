#!/bin/bash
set -e

# Ensure we are in the project root
cd "$(dirname "$0")"/..

# Setup Logs
LOG_DIR="logs/nightly"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="$LOG_DIR/run_$TIMESTAMP.log"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Redirect all subsequent output to log file AND stdout
exec > >(tee -a "$LOG_FILE") 2>&1

echo -e "${GREEN}🌙 Starting Local Nightly E2E Run...${NC}"
echo "📅 Date: $TIMESTAMP"
echo "📂 Log: $PWD/$LOG_FILE"

# 1. Strict Rule Guards
echo -e "\n${GREEN}🛡️  Running Strict Rule Guards...${NC}"
if grep -R "page.goto" apps/web/e2e/golden apps/web/e2e/gate --include="*.spec.ts" | grep -v "apps/web/e2e/gate/tenant-resolution.spec.ts"; then
  echo -e "${RED}❌ Guard Failed: Raw page.goto found in restricted directories.${NC}"
  exit 1
fi
echo "✅ Guards Passed."

# 2. Database Seed
echo -e "\n${GREEN}🌱 Seeding E2E Database...${NC}"
pnpm --filter @interdomestik/database seed:e2e

# 2.5 Generate Auth States (Required after fresh seed)
echo -e "\n${GREEN}🔑 Generating Auth StorageStates...${NC}"
pnpm --filter @interdomestik/web test:e2e -- e2e/setup.state.spec.ts --project=setup-ks --project=setup-mk

# 3. Full Test Execution
echo -e "\n${GREEN}🚀 Running Full E2E Suite (All Projects)...${NC}"
pnpm --filter @interdomestik/web test:e2e

echo -e "\n${GREEN}✨ Nightly Run Complete! All systems operational.${NC}"
echo "📝 Full log saved to: $PWD/$LOG_FILE"
