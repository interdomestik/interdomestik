# MCP Tools - Quick Reference

## 🚀 Getting Started

### First Time Setup

```bash
pnpm mcp:setup
```

### Every Session

**MCP servers start automatically with Gemini CLI** - No setup needed!

---

## 📋 Common Commands

| Command          | Description                |
| ---------------- | -------------------------- |
| `pnpm mcp:setup` | Setup and verify MCP tools |
| `pnpm mcp:audit` | Run all QA audits          |
| `pnpm mcp:test`  | Run audits + unit tests    |
| `pnpm test`      | Run unit tests only        |
| `pnpm test:e2e`  | Run E2E tests              |

---

## 🔍 Using MCP Tools in Gemini CLI

Just ask naturally:

- "Run all QA audits"
- "Check the auth configuration"
- "Run unit tests with coverage"
- "Search for useTranslations in the codebase"
- "Show me the project structure"

---

## 🛠️ Available Audits

✅ **Health Check** - Type-check & lint  
✅ **Auth Audit** - Better Auth config  
✅ **Environment** - Env variables  
✅ **Navigation** - Routing & i18n  
✅ **Dependencies** - Package config  
✅ **Supabase** - Supabase setup  
✅ **Accessibility** - A11y config  
✅ **CSP** - Security headers  
✅ **Performance** - Performance config

---

## 📊 Test Coverage

Current: **94.3%**

- Statements: 94.3%
- Branches: 89.41%
- Functions: 88.63%
- Lines: 93.93%

---

## 🔧 Troubleshooting

### MCP Not Working?

```bash
# Rebuild QA package
cd packages/qa && pnpm build

# Verify config
cat ~/.config/google/gemini/mcp.json | jq '.mcpServers["ecohub-qa"]'

# Restart Gemini CLI
```

### Tests Failing?

```bash
# Check environment
cat .env | grep -E "DATABASE_URL|BETTER_AUTH_SECRET"

# Rebuild and test
pnpm mcp:setup
```

---

## 📚 Documentation

- **Full Guide**: [docs/MCP_TOOLS.md](./MCP_TOOLS.md)
- **QA Package**: [packages/qa/README.md](../packages/qa/README.md)
- **Workflow**: [.agent/workflows/mcp-tools.md](../.agent/workflows/mcp-tools.md)

---

## 💡 Tips

1. **Before Commits**: Run `pnpm mcp:audit`
2. **Before PRs**: Run `pnpm mcp:test`
3. **Daily**: Let MCP tools auto-start with Gemini CLI
4. **Coverage**: Aim for >90% on new code

---

_Last Updated: 2025-12-17_
