#!/bin/bash
# MCP Tools Setup for Interdomestik
# This script ensures all MCP servers are properly configured and built

set -euo pipefail

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

# 3. Test QA MCP discovery
echo -e "\n${YELLOW}🧪 Testing QA MCP discovery...${NC}"
cd "$PROJECT_ROOT"
if PROJECT_ROOT="$PROJECT_ROOT" node --input-type=module - <<'EOF'
import { spawn } from 'node:child_process';

const projectRoot = process.env.PROJECT_ROOT;
if (!projectRoot) {
  throw new Error('PROJECT_ROOT is required');
}

const child = spawn('/bin/bash', ['scripts/start-repo-qa.sh'], {
  cwd: projectRoot,
  detached: true,
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, MCP_REPO_ROOT: projectRoot },
});

let stdout = '';
let settled = false;

const response = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error('Timed out waiting for tools/list response'));
  }, 10000);

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.id === 2) {
          clearTimeout(timeout);
          resolve(message);
          return;
        }
      } catch {
        // Ignore partial JSON until the full line arrives.
      }
    }
  });

  child.on('exit', code => {
    if (!settled) {
      clearTimeout(timeout);
      reject(new Error(`QA MCP server exited before responding (code=${code ?? 'null'})`));
    }
  });

  child.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'setup-mcp', version: '1.0.0' },
      },
    }) + '\n'
  );
  child.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }) + '\n'
  );
  child.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }) + '\n'
  );
});

settled = true;

if (child.pid && child.exitCode === null && !child.killed) {
  await new Promise(resolve => {
    const forceKillTimer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Process group already exited.
      }
    }, 2000);

    child.once('close', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      clearTimeout(forceKillTimer);
      resolve();
    }
  });
}

const toolNames = response.result?.tools?.map(tool => tool.name) ?? [];
for (const requiredTool of ['project_map', 'read_files', 'pr_verify', 'security_guard', 'e2e_gate']) {
  if (!toolNames.includes(requiredTool)) {
    throw new Error(`Missing QA MCP tool: ${requiredTool}`);
  }
}

console.log(`Live QA MCP tools: ${toolNames.length}`);
EOF
then
    echo -e "${GREEN}✅ QA MCP discovery is working${NC}"
else
    echo -e "${RED}❌ QA MCP discovery test failed${NC}"
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
