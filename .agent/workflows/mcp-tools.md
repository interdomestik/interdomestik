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
**Tools:** `generate_basic_test`, `generate_page_object`, `generate_auth_test`, `generate_api_test`, `generate_marketplace_flow`

Use for:
- Creating Playwright tests from descriptions
- Generating page object models
- Building auth flow tests
- Creating marketplace-specific test flows

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

Run the MCP toolkit health check to ensure all servers are available:
```bash
node ~/development/mcp-toolkit/scripts/check-mcp-health.mjs --project-root=$(pwd)
```
