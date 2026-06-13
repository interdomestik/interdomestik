---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-05
superseded_by:
---

# Plugin Usage Playbook

> Status: Input document. This playbook recommends tool usage only. The active execution
> authority remains `docs/plans/current-program.md`, `docs/plans/current-tracker.md`, and the
> active architecture-finalization program/tracker where applicable.

## Purpose

Use available plugins as fixed evidence lanes during Interdomestik slice delivery. Start with
repo-local evidence, then add plugin evidence only when it matches the slice risk.

- `interdomestik_qa`: repo map, code search, changed files, scope audit, and local gate wrappers.
- GitHub: PR state, CI checks, review threads, Sonar disposition, merge, and cleanup proof.
- Context7: current framework/library behavior for Next.js, React, Supabase, Drizzle, Playwright,
  Tailwind, or package-specific APIs.
- Notion: external program sync or workspace search only. Repo docs remain authoritative.
- Skips: record irrelevant plugin lanes as `not_applicable`.

## Slice Class Matrix

| Slice class                                                                                | Required plugin lanes                                   | Conditional plugin lanes                                                                                                                                          | Normally not needed                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Docs, tracker, or promotion only                                                           | `interdomestik_qa`, GitHub                              | Notion after merge, Context7 for docs about current tooling                                                                                                       | Supabase, Figma, Sentry, Browser, Canva |
| Product UI or workflow                                                                     | `interdomestik_qa`, GitHub, Browser/Playwright          | Figma for design source or visual contract, Context7 for UI framework details, Codex Security for sensitive flows                                                 | Supabase unless persistence changes     |
| Database, schema, migration, RLS, or tenant-scoped persistence                             | `interdomestik_qa`, GitHub, Supabase, Codex Security    | Context7 for Supabase/Drizzle behavior, Sentry for production-impacting observability                                                                             | Figma, Canva                            |
| Auth, tenancy, routing, proxy, uploads, webhooks, billing, PII, events, or audit semantics | `interdomestik_qa`, GitHub, Codex Security, Context7    | Supabase for database/RLS/auth logs, Browser/Playwright for affected user flows, Sentry for runtime-risk proof                                                    | Canva, Coursera                         |
| Runtime, release, deployment, or observability                                             | `interdomestik_qa`, GitHub, Sentry                      | Supabase logs/advisors for backend symptoms, Browser/Playwright for live smoke, Vercel evidence through GitHub checks when direct connector tools are unavailable | Figma unless UI changed                 |
| Product design or visual polish                                                            | `interdomestik_qa`, GitHub, Browser/Playwright, Figma   | Context7 for frontend APIs, accessibility skills for a11y-heavy changes                                                                                           | Supabase unless persistence changes     |
| AI or OpenAI API behavior                                                                  | `interdomestik_qa`, GitHub, OpenAI Docs, Codex Security | Context7 for framework glue, Sentry for runtime monitoring                                                                                                        | Figma unless UI changed                 |
| Analytics, KPI, or business report                                                         | `interdomestik_qa`                                      | GitHub when repo-backed, Data Analytics widgets, Notion, Spreadsheets, Sentry/Supabase if data comes from live systems                                            | Figma unless presenting a design        |

## Required Evidence By Plugin

### `interdomestik_qa`

Use before shell-only fallback when available: `project_map`, `code_search`, `changed_files`,
`scope_audit`, and the gate wrappers that match the slice risk.

### GitHub

Use on every PR-bound slice to fetch PR metadata/diffs/comments, monitor CodeQL, SonarCloud,
CI, PR E2E, Pilot Gate, gitleaks, pnpm-audit, validation-surface, and `pr-finalizer`,
then confirm merge SHA and branch cleanup.

### Codex Security

Use for auth, tenancy, routing/proxy, RLS, database policy, uploads, webhooks, billing, PII/privacy,
events/outbox, audit projection, and AI trust surfaces. Treat findings as must-fix unless clearly
false positive with written rationale.

### Supabase

Use for database/runtime backend evidence: advisors after DDL/RLS/index/storage/auth-sensitive work,
logs for backend investigations, and development branches for experimental DDL. Do not apply
production migrations through the connector unless explicitly authorized.

### Browser/Playwright

Use for user-visible changes: affected routes, desktop/mobile sizes, accessibility snapshots for
interaction-heavy changes, and screenshots when visual proof matters.

### Sentry

Use for runtime/release confidence: SLO alert checks and pre/post deployment issue windows. Keep
evidence limited to safe operational metadata.

### Figma

Use when design quality or parity is part of the slice. Do not require it for backend, docs-only, or
narrow operational changes.

### Context7 And OpenAI Docs

Use Context7 for current framework/library behavior. Use OpenAI Docs for OpenAI API, Agents SDK,
ChatGPT Apps, or platform behavior.

### Notion

Use as external memory only. Search/fetch Program records when needed and append post-merge sync
after merge plus local `main` sync. Do not redefine repo status ahead of canonical docs.

### Situational Plugins

Use Data Analytics, Documents, Presentations, Spreadsheets, Canva, Slack, Linear, Gmail, Coursera,
Build iOS Apps, or PolicyNote only when the task explicitly needs that surface.

## PR Evidence Format

For non-trivial PRs, include a short plugin/tool evidence section:

```md
### Plugin / Tool Evidence

- Repo MCP: project map, code search, changed files, and scope audit completed.
- GitHub: CI, SonarCloud, CodeQL, Pilot Gate, and pr-finalizer monitored.
- Security: Codex Security diff scan <passed | not_applicable | blocked: reason>.
- Supabase: advisors/logs <passed | not_applicable | blocked: reason>.
- Browser/Playwright: UI proof <passed | not_applicable>.
- Sentry: runtime window or alert proof <passed | not_applicable | blocked: reason>.
- Notion: post-merge sync <completed after merge | not_applicable>.
```

Use exact command names, PR numbers, merge SHAs, and evidence paths where available. Do not claim a
plugin lane passed unless evidence covers the touched surface.

## Skip Discipline

Skipping a plugin is acceptable when irrelevant. Make the skip explicit when the plugin would
normally apply to the touched surface.

Examples:

- UI-only copy change: `Supabase not_applicable`.
- Docs-only promotion: `Browser/Playwright not_applicable`.
- Database migration with no live project access: `Supabase advisors blocked: connector credentials
unavailable; local migration/RLS/security gates used instead`.
- Runtime deployment slice with no Sentry credentials: `Sentry blocked: missing SENTRY_AUTH_TOKEN,
SENTRY_ORG, or SENTRY_PROJECT`.

## Non-Goals

- This playbook does not change Phase C guardrails.
- This playbook does not authorize edits to `apps/web/src/proxy.ts`.
- This playbook does not promote work or modify active tracker status.
- This playbook does not require direct Vercel, Slack, Linear, or PolicyNote connector usage when no
  relevant callable tool is exposed in the current session.
