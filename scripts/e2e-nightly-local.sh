#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🌙 Starting Local Nightly E2E Run...${NC}"

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

# 3. Test Suites
echo -e "\n${GREEN}🚀 Running E2E Gate (KS + MK)...${NC}"
pnpm --filter @interdomestik/web run e2e:gate

echo -e "\n${GREEN}🚀 Running Subscription Lifecycle...${NC}"
pnpm --filter @interdomestik/web exec playwright test apps/web/e2e/golden/subscription-lifecycle.spec.ts --project=ks-sq --project=mk-mk

echo -e "\n${GREEN}🚀 Running Phase 5 Deterministic Batch...${NC}"
pnpm --filter @interdomestik/web run test:e2e:phase5

echo -e "\n${GREEN}🚀 Running Smoke Tests...${NC}"
pnpm --filter @interdomestik/web run test:smoke

echo -e "\n${GREEN}✨ Nightly Run Complete! All systems operational.${NC}"
