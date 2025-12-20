---
description: How to use MCP tools for rapid development
---

# Using MCP Tools for Supercharged Development

This workflow describes how to leverage the MCP (Model Context Protocol) tools configured for this project.

## Available MCP Servers

### 1. Context Server (`mcp-context-server`)

**Tools:** `project_map`, `code_search`, `read_files`, `git_status`, `git_diff`

// turbo-all
Use for:

- Exploring project structure
- Finding code patterns across the codebase
- Understanding git changes before commits

### 2. Repo Context Server (`mcp-toolkit/repo-context-server`)

**Tools:** `project_map`, `code_search`, `read_files`

Use for:

- Repository-aware code exploration
- Allow-list filtered searching

### 3. Repo QA Server (`mcp-toolkit/repo-qa-server`)

**Tools:** `build_health`, `test_runner`, `navigation_audit`

Use for:

- Checking build, lint, and type-check health
- Running test suites (unit, e2e, smoke)
- Auditing navigation links

### 4. E2E Test Generator (`e2e-test-generator-mcp`)

**Tools:** `generate_basic_test`, `generate_page_object`, `generate_auth_test`, `generate_api_test`

Use for:

- Creating Playwright tests from descriptions
- Generating page object models
- Building auth flow tests

## Example Usage

### Explore Project Structure

```
Use project_map with projectRoot=/Users/arbenlila/development/interdomestikv2
```

### Search for Code Patterns

```
Use code_search with projectRoot=/Users/arbenlila/development/interdomestikv2 and query="useTranslations"
```

### Check Build Health

```
Use build_health with projectRoot=/Users/arbenlila/development/interdomestikv2
```

### Generate E2E Test

```
Use generate_basic_test with:
- description: "User registers with email and password"
- testName: "user-registration"
- baseUrl: "http://localhost:3000"
```

## Starting MCP Servers

**Automatic Setup (Recommended)**:
MCP servers start automatically when you launch Gemini CLI. No manual setup needed!

**First Time Setup**:

```bash
// turbo
pnpm mcp:setup
```

**Verify Configuration**:

```bash
// turbo
cat ~/.config/google/gemini/mcp.json | jq '.mcpServers["ecohub-qa"]'
```

## Quick Commands

### Run All QA Audits

```bash
// turbo
pnpm mcp:audit
```

### Run QA Audits + Unit Tests

```bash
// turbo
pnpm mcp:test
```

### Run Specific Audit

Use Gemini CLI natural language:

- "Run the auth audit"
- "Check environment variables"
- "Verify navigation and i18n setup"

## Available Tools

### Interdomestik QA (`ecohub-qa`)

**All tools work automatically in Gemini CLI**

**Audit Tools**:

- `audit_auth` - Better Auth configuration
- `audit_env` - Environment variables
- `audit_navigation` - Routing and i18n
- `audit_dependencies` - Package configuration
- `audit_supabase` - Supabase setup
- `audit_accessibility` - Accessibility config
- `audit_csp` - Content Security Policy
- `audit_performance` - Performance config

**Testing Tools**:

- `check_health` - Type-check and lint
- `run_unit_tests` - Vitest tests
- `run_coverage` - Tests with coverage
- `run_e2e_tests` - Playwright tests

**Development Tools**:

- `project_map` - Project structure
- `read_files` - File contents
- `git_status` - Git status
- `git_diff` - Git changes
- `code_search` - Search codebase
- `query_db` - Query database
- `get_stripe_resource` - Fetch Stripe data

## Documentation

For detailed information, see:

- [MCP Tools Documentation](../docs/MCP_TOOLS.md)
- [QA Package README](../packages/qa/README.md)
