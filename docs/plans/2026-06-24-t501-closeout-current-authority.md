---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-24
tracker_path: docs/plans/current-tracker.md
current_program_path: docs/plans/current-program.md
---

# T-501 Closeout And Current Authority

> Status: complete closeout note. Canonical authority remains
> `docs/plans/current-tracker.md`, `docs/plans/current-program.md`, and
> `docs/plans/architecture-finalization-tracker-2026-05-29.md`.

## Scope

T-501 completed the flagged `ida.*` sole live-login cutover and country-host 301
redirect behavior promoted by T-108 closeout. The implementation kept `ida.*` as
the neutral no-tenant public branding context, added the default booking tenant
hint flow for country-host redirects, preserved member/agent/staff/admin session
continuity, and added hostile/lookalike/stale-cookie/session-conflict negative
proof. No schema, RLS, migration, billing UI, T-502, T-503, T-505, additional
entity migration, README, AGENTS, Dependabot, or broad architecture work is
closed by this note.

## Merge Evidence

- Implementation PR: `#1186`.
- Final implementation head: `0ee8aa3fd799e7ab8198a7154c645ebc6f311694`.
- Merge/main SHA: `5fa1ed76fba9a0f7e8ae8eaeb2fc2961956f2d30`.
- Main health at `5fa1ed76`: CI run `28100625834` success, including `unit`
  job `83201422360` and `e2e-gate` job `83201422407`; Sonar Main Gate run
  `28100625943` success with `sonar-gate` job `83201368203`; Secret
  Scan/gitleaks run `28100625978` success; CodeQL run `28100625150` success for
  actions and JavaScript/TypeScript analyses.
- CD/Vercel is deployment-only evidence and is not product-readiness proof.

## Review And Risk Disposition

- Codex P1 review thread `PRRT_kwDOQ0Mhjc6L5Fch` was fixed and resolved by
  validating the IDA sign-in tenant hint server-side and feeding the validated
  hint into the email sign-in guard.
- Codex Security diff scan was blocked on manual-start friction; scan completion
  is not claimed.
- Routing/auth/session risk remains recorded as Tier 3 implementation risk for
  historical evidence. This closeout records the merged outcome; it does not
  authorize additional route, proxy, auth, or session changes.

## Current Authority

No replacement implementation slice is promoted by this closeout. After this
closeout merges, the expected resolver state is
`blocked_requires_current_authority` with `activeSlice=null` and reason
`umbrella_without_concrete_promoted_slice` until a fresh current-authority or
design-gate PR selects exactly one next governed action.
