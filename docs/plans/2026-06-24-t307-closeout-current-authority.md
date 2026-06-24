---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-24
tracker_path: docs/plans/current-tracker.md
current_program_path: docs/plans/current-program.md
---

# T-307 Closeout And Current Authority

> Status: complete closeout note. Canonical authority remains
> `docs/plans/current-tracker.md`, `docs/plans/current-program.md`, and
> `docs/plans/architecture-finalization-tracker-2026-05-29.md`.

## Scope

T-307 completed the OBR-DG31-promoted proxy logic split. The implementation
decomposed `apps/web/src/lib/proxy-logic.ts` into focused resolve, security
header, gate, and session-state helpers while preserving the public
`proxy(request)` behavior, canonical `/member`, `/agent`, `/staff`, and
`/admin` routes, tenant/session handling, public IDA behavior, country-host
compatibility, login redirects, stale-cookie/session-conflict handling, CSP/HSTS
behavior, and the E2E gate baseline.

`apps/web/src/proxy.ts` was untouched. This closeout does not authorize `T-502`,
direct destructive `T-503`, canonical route changes, clarity marker changes,
schema/RLS/migrations, billing/product UI, additional entity migration,
Operational Brain runtime/live AI, Dependabot work, README, AGENTS, broad
architecture rewrites, or broad M3/M4/M5 work.

## Merge Evidence

- Implementation PR: `#1191`
  (`https://github.com/interdomestik/interdomestik/pull/1191`).
- Final implementation head: `143cc1a175674651a6a6a343990216cdcb795802`.
- Merge/main SHA: `33c8bde2ad397e5a2af448a9f7806596e186fb7c`.
- Main health at `33c8bde2`: CI run `28114069661` success, including
  `validation-surface` job `83248805145`, `audit` job `83248805154`, `static`
  job `83248850993`, `unit` job `83248851018`, `ai-eval` job `83248851052`,
  and DB-backed `e2e-gate` job `83248850988`; Sonar Main Gate run
  `28114069705` success with `sonar-gate` job `83248805096` and SonarCloud Code
  Analysis success; Secret Scan/gitleaks run `28114069669` success with
  `gitleaks` job `83248805022`; CodeQL run `28114069295` success for Actions
  job `83248808069` and JavaScript/TypeScript job `83248808031`.
- CD/Vercel is deployment-only evidence and is not product-readiness proof.

## Review And Risk Disposition

- Visible current-head PR evidence before merge was green for CI, PR E2E, Pilot
  Gate, Secret Scan/gitleaks, Security/pnpm-audit, Commitlint,
  `pr-finalizer`, and Sonar PR Quality Gate; review threads were empty and no
  review submissions were visible.
- Local `pnpm pr:verify` and `pnpm e2e:gate` were blocked by local environment:
  no local Postgres/Supabase on `127.0.0.1:54322` and Docker daemon unavailable.
  Current-head PR and post-merge main CI supplied the DB-backed proof, including
  RLS Integration Test success inside `e2e-gate`.
- T-307 was route/security-gate adjacent Tier 3 work, but the merged scope stayed
  mechanical and did not edit `apps/web/src/proxy.ts`.

## Current Authority

No replacement implementation slice is promoted by this closeout. `T-502`
remains parked until a fresh current-authority/design-gate PR explicitly selects
it or another exact governed slice. Direct destructive `T-503` remains parked
behind release/destructive-migration proof and fresh explicit risk review.

After this closeout merges, the expected resolver state is
`blocked_requires_current_authority` with `activeSlice=null` and reason
`umbrella_without_concrete_promoted_slice` until a fresh current-authority or
design-gate PR selects exactly one next governed action.
