#!/bin/bash
# MCP Tools Setup for Interdomestik V2
# This script ensures all MCP servers are properly configured and built

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "🔧 Setting up MCP tools for Interdomestik V2"
echo "Project root: $PROJECT_ROOT"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Build the QA package
echo -e "\n${YELLOW}📦 Building QA package...${NC}"
cd "$PROJECT_ROOT/packages/qa"
if pnpm build; then
    echo -e "${GREEN}✅ QA package built successfully${NC}"
else
    echo -e "${RED}❌ Failed to build QA package${NC}"
    exit 1
fi

# 2. Verify MCP configuration
echo -e "\n${YELLOW}🔍 Verifying MCP configuration...${NC}"
MCP_CONFIG="$HOME/.config/google/gemini/mcp.json"

if [ ! -f "$MCP_CONFIG" ]; then
    echo -e "${RED}❌ MCP config not found at $MCP_CONFIG${NC}"
    exit 1
fi

# Check all MCP servers
SERVERS=("mcp-context-server" "ecohub-qa" "e2e-test-generator" "context7" "playwright" "markitdown")
ALL_CONFIGURED=true

for server in "${SERVERS[@]}"; do
    if grep -q "\"$server\"" "$MCP_CONFIG"; then
        if grep -A 5 "\"$server\"" "$MCP_CONFIG" | grep -q "interdomestikv2"; then
            echo -e "${GREEN}✅ $server configured for interdomestikv2${NC}"
        else
            echo -e "${YELLOW}⚠️  $server not configured for interdomestikv2${NC}"
            ALL_CONFIGURED=false
        fi
    else
        echo -e "${YELLOW}⚠️  $server not found in config${NC}"
        ALL_CONFIGURED=false
    fi
done

if [ "$ALL_CONFIGURED" = false ]; then
    echo -e "\n${YELLOW}Some servers need configuration. Please update $MCP_CONFIG${NC}"
    echo "Run: cat $MCP_CONFIG | jq '.mcpServers'"
fi

# 3. Test QA tools
echo -e "\n${YELLOW}🧪 Testing QA tools...${NC}"
cd "$PROJECT_ROOT/packages/qa"
if tsx -e "import { checkHealth } from './src/tools/health.js'; checkHealth().then(r => console.log('Health check:', r.content[0].text.split('\\n')[0])).catch(console.error)"; then
    echo -e "${GREEN}✅ QA tools are working${NC}"
else
    echo -e "${RED}❌ QA tools test failed${NC}"
    exit 1
fi

# 4. Summary
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ MCP Tools Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Available MCP servers:"
echo "  • ecohub-qa - QA audits, testing, and health checks"
echo "  • mcp-context-server - Code search and navigation"
echo "  • e2e-test-generator - Generate Playwright E2E tests"
echo "  • context7 - Advanced context management"
echo "  • playwright - Browser automation tools"
echo "  • markitdown - Markdown conversion tools"
echo ""
echo "Quick commands:"
echo "  • Run all audits: pnpm mcp:audit"
echo "  • Run audits + tests: pnpm mcp:test"
echo "  • Run unit tests: cd apps/web && pnpm test"
echo "  • Run E2E tests: cd apps/web && pnpm test:e2e"
echo ""
echo -e "${YELLOW}💡 Tip: MCP servers start automatically with Gemini CLI${NC}"
echo -e "${YELLOW}📚 Docs: docs/MCP_TOOLS.md | docs/MCP_QUICK_REFERENCE.md${NC}"
