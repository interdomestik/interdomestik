#!/bin/bash
set -e

# Define restricted patterns
# 1. Path segments: /sq/, /mk/, /en/
# 2. page.goto with hardcoded locale start: page.goto('/en', page.goto('/sq', etc.
# 3. Usage of DEFAULT_LOCALE constant in e2e (should derive from testInfo)
PATTERN="(/sq/|/mk/|/en/|page\.goto\(['\"]/(sq|mk|en)|DEFAULT_LOCALE)"

echo "🔍 Checking for hardcoded locales in E2E tests..."

MATCHES=$(grep -rE "$PATTERN" apps/web/e2e \
  --exclude="routes.ts" \
  --exclude="navigation.ts" \
  --exclude-dir=".auth" \
  || true)

if [ -n "$MATCHES" ]; then
  echo "❌ Error: Hardcoded locales or DEFAULT_LOCALE found in E2E tests!"
  echo "   Please use 'gotoApp' helper and 'routes' from e2e/utils/navigation.ts & e2e/routes.ts"
  echo "   Do NOT use DEFAULT_LOCALE; derive it from testInfo.project.use.baseURL"
  echo ""
  echo "$MATCHES"
  exit 1
else
  echo "✅ No hardcoded locales found. Good job!"
  exit 0
fi