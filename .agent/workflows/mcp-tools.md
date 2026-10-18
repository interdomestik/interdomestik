---
description: Current MCP entrypoints and bounded failure handling
---

# Using MCP Tools for Supercharged Development

Read the active checkout's `AGENTS.md` and `.codex/config.toml`. Inspect actual
client registration and runtime discovery; configuration/listing is not execution.
Global registration can select a different source from the checkout. Never print
credentials or full private configuration. Historical headings remain for continuity.

## Available MCP Servers

### 1. Context Server (`mcp-context-server`)

Historical VSCode integration; distinct from Context7. A source path alone does not
prove current Codex availability. Use current `interdomestik_qa` for repository context.

### 2. Repo Context Server (`mcp-toolkit/repo-context-server`)

Historical separate server. Do not assume it is loaded or shares the QA contract.

### 3. Repo QA Server (`mcp-toolkit/repo-qa-server`)

Current Codex uses `interdomestik_qa` through `scripts/start-repo-qa.sh` and
`scripts/qa-mcp-control-runtime.mjs`. Check the enabled-tool list and actual response.
The historical `interdomestikv2` QA aliases in `.vscode/mcp.json` have retired paths;
do not run them or silently activate their DB/payment integrations.

### 4. E2E Test Generator (`e2e-test-generator-mcp`)

Historical registration, not a verified current capability. Use the existing
Playwright tests and current tooling; generated tests still require execution.

## Example Usage

### Explore Project Structure

Call `project_map` with the actual worktree's absolute `repoRoot`.
Verify `serverSourceRoot`/`serverSourceHead` and `targetRepoRoot`/`targetHead`.

### Search for Code Patterns

Call `code_search` with absolute `repoRoot` and `query: "useTranslations"`.
The parameter is `repoRoot`, not `projectRoot`. Never convert failure to empty success.

### Check Build Health

`check_health`, `pr_verify`, `security_guard` and `e2e_gate` execute verification;
they are not read-only discovery probes. Respect services and task ownership.

### Generate E2E Test

Use current repo fixtures and markers. Listing or generating tests is not execution
proof. Preserve required full verification and privacy-driven trace exceptions.

## Starting MCP Servers

There is no unconditional automatic Gemini startup guarantee. Check actual registration.
If discovery exposes no callable method, record the mechanisms checked. If startup
or invocation fails, retain the exact error and source/transport context. Use the
file/`rg` fallback when unavailable; absent session exposure alone is not server failure.
Control-runtime advancement and client reconnect require a safe maintenance boundary.

## Quick Commands

### Run All QA Audits

`pnpm mcp:audit` executes configured audits; inspect their scope before running.

### Run QA Audits + Unit Tests

`pnpm mcp:test` also runs tests. It is not a substitute for required delivery gates.

### Run Specific Audit

Only invoke an audit exposed by the current enabled-tool list, with absolute repoRoot.
Interpret its actual scope; a configuration audit is not runtime acceptance.

## Available Tools

### Interdomestik QA (`ecohub-qa`)

`ecohub-qa` is a historical alias. Current Codex discovery is `interdomestik_qa`.
Start with `git_status_compact`, `read_file_range`, `project_map` or `code_search`.
The installed `interdomestik` filesystem SKILL.md does not establish an
`interdomestik_skills` MCP server. Compare role/guide/manifest copies separately;
explicit reads are not proof of fresh-role automatic loading.

Context7 provides external library documentation. Reuse version-bound research.
On monthly quota failure, retain the error and use pinned local source or official
documentation; do not repeatedly retry, change keys or purchase capacity.

## Documentation

- [MCP tools documentation](../../docs/MCP_TOOLS.md) (compare with current registration)
- [QA package README](../../packages/qa/README.md)
- [Current program](../../docs/plans/current-program.md)
