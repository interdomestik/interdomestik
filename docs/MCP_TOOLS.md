# MCP Tools for Interdomestik V2

This document describes the Model Context Protocol (MCP) tools configured for the Interdomestik V2 project.

## Quick Start

### First Time Setup

```bash
./scripts/setup-mcp.sh
```

This will:

- Build the QA package
- Verify MCP configuration
- Test that tools are working
- Display available commands

### Every Development Session

The MCP servers start automatically when you launch Gemini CLI. No manual setup needed!

---

## Available MCP Servers

### 1. **ecohub-qa** (Interdomestik QA Tools)

**Location**: `/Users/arbenlila/development/interdomestikv2/packages/qa`

**Tools**:

- `audit_auth` - Verify Better Auth configuration
- `audit_env` - Check environment variables
- `audit_navigation` - Validate routing and i18n
- `audit_dependencies` - Check package configuration
- `audit_supabase` - Verify Supabase setup
- `audit_accessibility` - Check a11y configuration
- `audit_csp` - Verify Content Security Policy
- `audit_performance` - Check performance config
- `check_health` - Run type-check and lint
- `run_unit_tests` - Execute Vitest tests
- `run_coverage` - Run tests with coverage
- `run_e2e_tests` - Execute Playwright tests
- `tests_orchestrator` - Run unit/e2e/smoke suites (alias: `test_runner`)
- `project_map` - Generate project structure
- `read_files` - Read file contents
- `git_status` - Get git status
- `git_diff` - View git changes
- `code_search` - Search codebase
- `query_db` - Query local database
- `get_paddle_resource` - Fetch Paddle data

**Usage Examples**:

```typescript
// In Gemini CLI, these tools are available automatically
// Example: "Run all QA audits"
// Example: "Check the health of the project"
// Example: "Run unit tests with coverage"
```

### 2. **mcp-context-server** (Code Navigation)

**Tools**:

- `project_map` - Map project structure
- `code_search` - Search for code patterns
- `read_files` - Read multiple files
- `git_status` - Git repository status
- `git_diff` - View git differences

### 3. **e2e-test-generator** (Test Generation)

**Tools**:

- `generate_basic_test` - Create basic E2E tests
- `generate_page_object` - Generate page objects
- `generate_auth_test` - Create auth flow tests
- `generate_api_test` - Generate API tests

---

## Manual Commands

### Run All QA Audits

```bash
cd packages/qa
tsx run-all-audits.ts
```

### Run Specific Audit

```bash
cd packages/qa
tsx -e "import { auditAuth } from './src/tools/audits.js'; auditAuth().then(r => console.log(r.content[0].text))"
```

### Run Unit Tests

```bash
cd apps/web
pnpm test
```

### Run Unit Tests with Coverage

```bash
cd apps/web
pnpm vitest run --coverage
```

### Run E2E Tests

```bash
cd apps/web
pnpm test:e2e
```

---

## Configuration Files

### MCP Server Configuration

**File**: `~/.config/google/gemini/mcp.json`

```json
{
  "mcpServers": {
    "ecohub-qa": {
      "command": "node",
      "args": ["/Users/arbenlila/development/interdomestikv2/packages/qa/dist/index.js"],
      "cwd": "/Users/arbenlila/development/interdomestikv2"
    }
  }
}
```

### QA Package Configuration

**File**: `packages/qa/package.json`

Scripts:

- `build` - Compile TypeScript to JavaScript
- `start` - Run the MCP server
- `dev` - Run in development mode
- `check` - Test all tools

---

## Troubleshooting

### MCP Server Not Responding

1. Rebuild the QA package:

   ```bash
   cd packages/qa && pnpm build
   ```

2. Restart Gemini CLI

3. Check MCP configuration:
   ```bash
   cat ~/.config/google/gemini/mcp.json | jq '.mcpServers["ecohub-qa"]'
   ```

### QA Tools Returning Errors

1. Ensure you're in the project root
2. Check that `.env` file exists
3. Verify database is running (if using db tools)

### Path Issues

If tools are scanning the wrong directory:

1. Check `packages/qa/src/utils/paths.ts`
2. Verify `REPO_ROOT` calculation (should go up 4 levels)
3. Rebuild: `cd packages/qa && pnpm build`

---

## Development Workflow

### 1. Start Development

```bash
# MCP servers start automatically with Gemini CLI
# No manual setup needed!
```

### 2. Before Committing

```bash
# Run all QA checks
./scripts/setup-mcp.sh

# Or manually:
cd packages/qa && tsx run-all-audits.ts
cd apps/web && pnpm test
```

### 3. Continuous Integration

The QA tools can be integrated into CI/CD:

```yaml
# Example GitHub Actions
- name: Run QA Audits
  run: |
    cd packages/qa
    pnpm build
    tsx run-all-audits.ts
```

---

## Extending MCP Tools

### Adding New Audit Tools

1. Create new tool in `packages/qa/src/tools/`
2. Add tool definition to `packages/qa/src/tools/list-tools.ts`
3. Add handler to `packages/qa/src/tool-router.ts`
4. Rebuild: `pnpm build`

### Example New Tool

```typescript
// packages/qa/src/tools/my-audit.ts
export async function auditMyFeature() {
  // Your audit logic
  return {
    content: [
      {
        type: 'text',
        text: 'MY AUDIT: SUCCESS\n\n✅ All checks passed',
      },
    ],
  };
}
```

---

## Best Practices

1. **Run audits before commits** - Catch issues early
2. **Use coverage reports** - Aim for >90% coverage
3. **Keep QA package updated** - Rebuild after changes
4. **Document new tools** - Update this file when adding tools
5. **Test in isolation** - Use separate test databases

---

## Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [Vitest Documentation](https://vitest.dev)
- [Playwright Documentation](https://playwright.dev)
- [Better Auth Documentation](https://better-auth.com)

---

## Support

For issues or questions:

1. Check this documentation
2. Review `packages/qa/README.md`
3. Check tool implementation in `packages/qa/src/tools/`
4. Review test files for usage examples
