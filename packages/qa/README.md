# Interdomestik QA Tools

MCP-based QA tools for the Interdomestik monorepo.

The package exists to make the repo's real verification contract callable from Codex and other MCP clients without forcing every check through raw shell commands.

## What This Package Does

- Exposes repo-aware audit, verification, repo, database, and Paddle tools over MCP stdio
- Mirrors the current Phase C verification contract instead of older generic health checks
- Returns structured command results for verification tools, including command, duration, exit code, failure stage, and output tails

## Current Verification Contract

For Interdomestik Phase C work, the important contract is:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

`check_health` now runs exactly that contract.

The testing/orchestration surface also exposes smaller repo-real commands:

- `build_ci`
- `check_fast`
- `e2e_state_setup`
- `e2e_gate_pr_fast`
- `pr_verify_hosts`

## Quick Start

### Build The Package

```bash
pnpm --filter @interdomestik/qa build
```

### Run Local Package Helpers

```bash
pnpm --filter @interdomestik/qa check
pnpm --filter @interdomestik/qa run-all-audits
```

### Use Via MCP

The server is a stdio MCP server whose default name is `interdomestik-qa`.

If you are using the repo's Codex setup, the server is configured from the project-scoped MCP config. If you are wiring another MCP client manually, point it at:

```bash
node packages/qa/dist/index.js
```

Example prompts:

- `Run check_health and summarize the first failing stage`
- `Run tests_orchestrator with suite=pr_verify_hosts`
- `Audit auth and env assumptions for this repo`
- `Query the local database for a tenant-scoped record`

## Tool Surface

### Audit Tools

- `audit_auth` - Verify Better Auth configuration, auth env assumptions, and related repo files
- `audit_env` - Validate repo env expectations
- `audit_navigation` - Verify routing/i18n layout structure
- `audit_dependencies` - Check critical dependency/package configuration
- `dependency_audit` - Alias for `audit_dependencies`
- `audit_supabase` - Verify Supabase env/config presence
- `audit_accessibility` - Check accessibility testing/config setup
- `audit_csp` - Verify Content Security Policy setup
- `audit_performance` - Check performance-related configuration

### Verification And Test Tools

- `check_health` - Run `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`
- `pr_verify` - Run `pnpm pr:verify`
- `security_guard` - Run `pnpm security:guard`
- `e2e_gate` - Run `pnpm e2e:gate`
- `build_ci` - Run the CI-grade web build used in repo verification
- `check_fast` - Run `pnpm check:fast`
- `e2e_state_setup` - Run deterministic Playwright auth-state setup only
- `e2e_gate_pr_fast` - Run the fast PR gate path without the full PR verify contract
- `pr_verify_hosts` - Run the host-routed PR verification variant
- `run_unit_tests` - Run web unit tests
- `run_coverage` - Run web unit tests with coverage
- `run_e2e_tests` - Run web Playwright tests
- `tests_orchestrator` - Run one named suite from the supported suite list
- `test_runner` - Alias for `tests_orchestrator`

Supported `tests_orchestrator` suites:

- `unit`
- `e2e`
- `smoke`
- `pr_verify`
- `security_guard`
- `e2e_gate`
- `build_ci`
- `check_fast`
- `e2e_state_setup`
- `e2e_gate_pr_fast`
- `pr_verify_hosts`
- `full`

### Repo And Integration Tools

- `project_map` - Generate a repo structure map
- `read_files` - Read multiple files
- `git_status` - Get git status
- `git_diff` - Get git diff
- `code_search` - Search the codebase
- `query_db` - Execute SQL against local Postgres
- `get_paddle_resource` - Fetch Paddle resources such as subscriptions, customers, products, or prices

## Structured Results

The verification tools return structured MCP content in addition to text output. The structured payload includes:

- `tool`
- `label`
- `status`
- `command`
- `cwd`
- `durationMs`
- `exitCode`
- `failedStage`
- `failureCategory`
- `stdoutTail`
- `stderrTail`
- truncation and timeout metadata

This is intended to make Codex- and agent-driven fix loops more precise than raw shell transcript parsing.

## Environment Resolution

The QA server loads the first repo-root env file that exists in this order:

1. `.env.local`
2. `.env.development.local`
3. `.env`

That matches the current repo assumptions better than the older `.env`-only behavior.

Relevant variables depend on the tool you call, but common local expectations include:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

These audits do not require GitHub OAuth credentials.

## Development Notes

### Project Structure

```text
packages/qa/
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── tool-router.ts
│   ├── tools/
│   │   ├── audits.ts
│   │   ├── health.ts
│   │   ├── tests.ts
│   │   ├── repo.ts
│   │   ├── db.ts
│   │   └── paddle.ts
│   └── utils/
│       ├── exec.ts
│       ├── paths.ts
│       └── tool-results.ts
├── dist/
├── run-all-audits.ts
└── test-tools.ts
```

### Adding Or Updating A Tool

1. Add or update the implementation under `src/tools/` or `src/utils/`
2. Register the tool in `src/tool-router.ts`
3. Add the tool definition in `src/tools/list-tools.ts`
4. Rebuild with `pnpm --filter @interdomestik/qa build`
5. Update or add the relevant contract tests under `scripts/ci/`

For tool-surface changes, keep `tool-router.ts`, `list-tools.ts`, and the QA contract tests in sync.

## Troubleshooting

### MCP Server Does Not Start

1. Rebuild the package: `pnpm --filter @interdomestik/qa build`
2. Verify the client is pointing at `packages/qa/dist/index.js`
3. Check that the repo root resolves correctly from `src/utils/paths.ts`

### Audits Fail On Env Detection

1. Verify one of `.env.local`, `.env.development.local`, or `.env` exists at repo root
2. Prefer `.env.local` for normal local development
3. Confirm the required local services are actually running before assuming the QA tool is wrong

### Verification Tools Fail

1. Re-run the exact failing repo command directly
2. Inspect `failedStage`, `failureCategory`, and the stdout/stderr tails in the structured result
3. If the failure is environment-specific, fix that first before changing the QA package

## License

Private - Interdomestik
