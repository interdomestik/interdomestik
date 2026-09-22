# Interdomestik AGENTS.md

Use this file for repository-wide instructions. For reviews also follow `code_review.md`.

## Current Authority

- `docs/plans/current-program.md` is the sole authority for current phase, priority and sequence.
- `docs/plans/current-tracker.md` is the single active tracker. Completed detail lives in the linked
  historical ledgers; do not copy it back into active context.
- Obsidian/AI OS/Brain/Wiki are advisory. Repository source, tests, accepted ADRs, current program
  and tracker remain authoritative.
- Use the installed Interdomestik skill for bounded research, implementation and verification. The
  local skill is installed separately and is not distributed by repository PRs.
- Legacy Lean and slice runners are explicit-only. Their inactive or malformed state cannot select
  or block ordinary owner-authorized work.

## Non-Negotiable Boundaries

- `apps/web/src/proxy.ts` is the sole routing, access-control and tenant-isolation authority. It is
  read-only unless the owner explicitly authorizes a justified change.
- Canonical routes `/member`, `/agent`, `/staff` and `/admin` must not be renamed or bypassed.
- `page-ready` and `*-page-ready` markers are contractual and covered by E2E gates.
- Supabase Auth is the identity/session system of record, `better-auth` is the orchestrator and
  `@interdomestik/shared-auth` is the provider-agnostic boundary. Do not collapse this layering.
- Authentication must never be bypassed, including in development.
- Tenant/RLS, document lifecycle, privacy and data-integrity protections remain mandatory.
- Paddle is the only V3 pilot billing provider.
- No routing, auth, tenancy, domain, schema, billing or other architectural refactor unless the
  owner explicitly requests it. Conditional M0–M5 work follows the dedicated architecture program
  and tracker linked from the current program.
- `README.md`, `AGENTS.md` and architecture documents are governance-owned; change them only when
  the owner explicitly requests it.
- Framework and dependency versions come from workspace manifests, especially
  `apps/web/package.json`; do not duplicate version claims in instructions.

## Ordinary Delivery

- Use one bounded protected PR for scope, acceptance, implementation and tests. Do not create
  routine promotion, qualification, closeout, status-only or bookkeeping-only PRs.
- Keep one implementation owner. Give helpers disjoint ownership; preserve unrelated worktree
  changes and do not revert other contributors.
- Use focused tests while editing. Runtime, security, CI/trust and other meaningful behavior changes
  require `pnpm pr:verify` and `pnpm security:guard` before delivery. `pr:verify` includes E2E gate
  evidence for the same source/configuration/environment; do not rerun it separately by habit.
- Instruction-only changes run the current plan/contracts relevant to their surface. Protected
  hosted checks remain separate trust evidence.
- `pnpm plan:audit` validates active authority. Retired manifest/projection/Lean validation and the
  full Harness suite run only through explicit legacy commands or CI selection when those artifacts,
  their actual consumers or the selection policy change.
- Ordinary `pnpm repo:size:check` growth is advisory except for the retained coarse largest-file and
  class-aware modularity limits. No exact allocation, shared-budget edit or byte-specific approval
  is required for routine source, test or catalog work.
- Review integrated current-head behavior, review bodies, inline comments and actionable check
  annotations. Consolidate accepted corrections before one expensive final verification lane.
- Passing checks authorize only the requested scope. Keep prepared, tested, merged, deployed and
  user-validated states distinct. Never auto-merge or deploy without explicit authority.

## Model And Review Routing

- GPT-5.6 Sol is the normal integration owner. Choose reasoning depth from the demonstrated risk.
  Reserve Astra escalation for a concrete unresolved gate, security, concurrency, data-loss or
  cross-domain architecture ambiguity.
- A routine deterministic change needs no fixed model panel. Use one relevant subscription helper
  when independent input is useful; add a distinct second perspective for real cross-domain,
  security or concurrency risk.
- High-risk work requires independent review separate from implementation judgment. Reuse accepted
  evidence while its inputs remain unchanged and verify the model actually served.
- When a provider is exhausted, use an approved adequate alternative for low/medium risk and record
  the blocker. Do not require a routine waiver ceremony, use a paid API fallback or retry solely to
  repair advisory formatting.

## MCP-First Tooling

- Confirm `.codex/config.toml`, then use `interdomestik_qa` first for repo status, reads, search,
  project mapping and relevant audits. If a call fails, report the exact error before fallback.
- Use Playwright MCP first for watched browser validation; use repo commands when MCP is unavailable
  or the required deterministic lane is command-owned.
- Use Context7 for framework behavior that may have changed. Use OpenAI documentation only when an
  OpenAI product or API is directly relevant.

## Core Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm type-check
pnpm test
pnpm test:unit:domains
pnpm test:e2e

pnpm plan:status
pnpm plan:audit
pnpm test:delivery-safety
pnpm legacy:validate     # complete explicit legacy validation
pnpm plan:audit:legacy   # explicit legacy authority validation
pnpm test:harness-v2     # explicit full legacy Harness suite

pnpm pr:verify
pnpm security:guard
pnpm pr:verify:hosts
pnpm prod:ready:code
pnpm release:evidence:check
```

Use package filters for focused checks, for example:

```bash
pnpm --filter @interdomestik/web test:unit --run path/to/test.test.tsx
pnpm --filter @interdomestik/domain-claims test:unit --run path/to/test.test.ts
pnpm --filter @interdomestik/web test:e2e -- --project=chromium --grep "specific test"
```

## Implementation Conventions

- TypeScript is strict. Prefer explicit public return types, discriminated results and narrow input
  validation. Keep files cohesive; executable modularity policy, not a universal 150-line rule,
  determines required decomposition.
- Follow repository Prettier/ESLint configuration. Use kebab-case files, PascalCase components/types,
  camelCase functions/variables and UPPER_SNAKE_CASE constants.
- For tenant-scoped data, validate the session and use the established tenant/RLS query boundary.
  Use transactions for multi-write invariants and fail closed on authorization ambiguity.
- Reuse existing components and locale catalogs. Preserve EN/SQ/MK/SR where the feature exercises
  user-facing copy. Test relevant loading/error/empty/retry, keyboard/focus, responsive and WCAG
  behavior in addition to the happy path.
- Use conventional commits such as `feat:`, `fix:`, `test:`, `refactor:` or `docs:`.
- Never commit production secrets. Local Supabase services bind to loopback; environment files stay
  development-only and gitignored.

<!-- FAST-TOOLS PROMPT v1 | codex-mastery | watermark:do-not-alter -->

## CRITICAL: Use ripgrep, not grep

NEVER use grep for project-wide searches (slow, ignores .gitignore). ALWAYS use rg.

- `rg "pattern"` — search content
- `rg --files | rg "name"` — find files
- `rg -t python "def"` — language filters

## File finding

- Prefer `fd` (or `fdfind` on Debian/Ubuntu). Respects .gitignore.

## JSON

- Use `jq` for parsing and transformations.

## Install Guidance

- macOS: `brew install ripgrep fd jq`
- Debian/Ubuntu: `sudo apt update && sudo apt install -y ripgrep fd-find jq` (alias `fd=fdfind`)

## Agent Instructions

- Replace commands: grep→rg, find→rg --files/fd, ls -R→rg --files, cat|grep→rg pattern file
- Cap reads at 250 lines; prefer `rg -n -A 3 -B 3` for context
- Use `jq` for JSON instead of regex

<!-- END FAST-TOOLS PROMPT v1 | codex-mastery -->

The fast-tools rule applies to shell repository searches; Playwright's `--grep` flag is unaffected.
