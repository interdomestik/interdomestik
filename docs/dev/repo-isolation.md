# Repo Isolation

Interdomestik and NurseConnect must run as separate systems. Do not share MCP servers, Playwright profiles, evidence folders, or local dev ports between the repositories.

## Interdomestik Ownership

- Repository root: `/Users/arbenlila/development/interdomestik-crystal-home`
- Default web dev port: `3000`
- Local app URL: `http://localhost:3000`
- Repo MCP config: `.codex/config.toml`
- Repo QA MCP server: `interdomestik_qa`
- Playwright MCP profile: `/tmp/interdomestik-pilot-evidence/playwright-mcp-profile`
- Playwright MCP output: `/tmp/interdomestik-pilot-evidence/playwright-mcp-output`
- Evidence root: `/tmp/interdomestik-pilot-evidence`

## Boundaries

- Do not configure Interdomestik by editing another repo's `.codex/config.toml`.
- Do not reuse NurseConnect Playwright profiles, evidence roots, or MCP paths.
- Keep Interdomestik on port `3000`; NurseConnect local development owns port `3010`.
- Keep `interdomestik_qa` scoped to this repository only.

## Failure Signal

If a Codex session in this repo writes NurseConnect paths or talks to a NurseConnect-only tool, restart the session from `/Users/arbenlila/development/interdomestik-crystal-home` and verify `.codex/config.toml` is loaded.
