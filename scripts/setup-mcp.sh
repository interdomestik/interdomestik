#!/bin/bash
# MCP Tools Setup for Interdomestik
# This script ensures all MCP servers are properly configured and built

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "🔧 Setting up MCP tools for Interdomestik"
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
CODEX_CONFIG="$PROJECT_ROOT/.codex/config.toml"
GEMINI_CONFIG="$HOME/.config/google/gemini/mcp.json"
ALL_CONFIGURED=true

if [[ ! -f "$CODEX_CONFIG" ]]; then
    echo -e "${RED}❌ Codex config not found at $CODEX_CONFIG${NC}"
    exit 1
fi

CODEX_SERVERS=("openai_docs" "context7" "playwright" "interdomestik_qa")
for server in "${CODEX_SERVERS[@]}"; do
    if grep -q "\\[mcp_servers\\.$server\\]" "$CODEX_CONFIG"; then
        echo -e "${GREEN}✅ Codex MCP server configured: $server${NC}"
    else
        echo -e "${RED}❌ Missing Codex MCP server in .codex/config.toml: $server${NC}"
        ALL_CONFIGURED=false
    fi
done

if [[ -f "$GEMINI_CONFIG" ]]; then
    GEMINI_SERVERS=("context7" "playwright")
    for server in "${GEMINI_SERVERS[@]}"; do
        if grep -q "\"$server\"" "$GEMINI_CONFIG"; then
            echo -e "${GREEN}✅ Gemini MCP server configured: $server${NC}"
        else
            echo -e "${YELLOW}⚠️  Gemini MCP server missing from $GEMINI_CONFIG: $server${NC}"
        fi
    done
else
    echo -e "${YELLOW}⚠️  Gemini MCP config not found at $GEMINI_CONFIG (optional for Codex users)${NC}"
fi

if [ "$ALL_CONFIGURED" = false ]; then
    echo -e "\n${RED}Codex MCP configuration is incomplete. Update $CODEX_CONFIG before continuing.${NC}"
    exit 1
fi

# 3. Test QA tools
echo -e "\n${YELLOW}🧪 Testing QA tools...${NC}"
cd "$PROJECT_ROOT/packages/qa"
if node --input-type=module -e "import { tools } from './dist/tools/list-tools.js'; console.log(\`Loaded QA tools: \${tools.length}\`);"; then
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
echo "Available Codex MCP servers:"
echo "  • openai_docs - Official OpenAI developer docs MCP"
echo "  • context7 - Advanced context and documentation lookup"
echo "  • playwright - Browser automation tools"
echo "  • interdomestik_qa - Repo QA audits, testing, and health checks"
echo ""
echo "Quick commands:"
echo "  • Run all audits: pnpm mcp:audit"
echo "  • Run audits + tests: pnpm mcp:test"
echo "  • Run unit tests: cd apps/web && pnpm test"
echo "  • Run E2E tests: cd apps/web && pnpm test:e2e"
echo ""
echo -e "${YELLOW}💡 Tip: Codex reads repo-scoped MCP settings from .codex/config.toml${NC}"
echo -e "${YELLOW}💡 Tip: Gemini users can still keep ~/.config/google/gemini/mcp.json in sync${NC}"
echo -e "${YELLOW}📚 Docs: docs/MCP_TOOLS.md | docs/MCP_QUICK_REFERENCE.md${NC}"
