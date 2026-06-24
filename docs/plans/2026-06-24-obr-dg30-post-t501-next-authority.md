---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-24
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# OBR-DG30 Post-T501 Next Slice Selection Gate

## Decision

Promote exactly one next governed slice: `T-505`.

Direct work remains blocked until this gate merges and `next-slice.mjs` resolves
exactly `T-505`.

## Evidence

- `T-501` implementation PR `#1186` merged at
  `5fa1ed76fba9a0f7e8ae8eaeb2fc2961956f2d30` from final head
  `0ee8aa3fd799e7ab8198a7154c645ebc6f311694`.
- `T-501` closeout/current-authority PR `#1187` merged at
  `3e1161d19376c48ea2456c04cf303362c8856b6c` from final head `c5cda44a`.
- Post-closeout main health at `3e1161d1` is green for CI run `28103311666`,
  including `unit` job `83210791829` and `e2e-gate` job `83210791883`; Sonar
  Main Gate run `28103311712` succeeded with `sonar-gate` job `83210733615`;
  Secret Scan/gitleaks run `28103311718` succeeded; CodeQL run `28103310848`
  succeeded for actions and JavaScript/TypeScript analyses. CD/Vercel is
  deployment-only evidence and is not readiness proof.
- Pre-gate resolver proof on clean `origin/main`:
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`.

## Candidate Comparison

| Candidate                                  | Disposition | Rationale                                                                                                                                                                      |
| ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T-505`                                    | Selected    | `T-501` is complete and `T-505` is the smallest remaining M5 continuation: finalize ADR-06 live cutover and cookie/session precedence from the completed T-108/T-501 evidence. |
| `T-502`                                    | Parked      | It remains blocked by canonical prerequisite `T-307`, which is still `TODO`, and it deletes/consolidates broad route/layout surfaces.                                          |
| `T-503`                                    | Parked      | Direct destructive `claims.status` removal remains blocked by release/destructive-migration proof and fresh approval.                                                          |
| `T-307`                                    | Parked      | It is route/proxy separation-of-concerns work and not the smallest post-live-cutover closeout.                                                                                 |
| Other M3/M4/M5, Dependabot, CodeQL batches | Parked      | Not the smallest current M5 continuation and not promoted by this gate.                                                                                                        |

## Promoted Scope

`T-505` is limited to finalizing ADR-06 from the completed live-cutover evidence:

- record the accepted `ida.*` sole live-login behavior;
- record country-host redirect behavior and default booking tenant hint handling;
- record server-side sign-in tenant hint validation;
- record cookie/session precedence, stale-cookie/session-conflict handling, and
  no-tenant public branding expectations proven by `T-108` and `T-501`;
- update only the ADR/current-authority surfaces needed for that closeout.

## Forbidden Scope

This gate does not authorize product implementation. It also does not authorize
`T-502`, direct destructive `T-503`, `T-307`, proxy/routing/auth/session/tenancy
code changes, schema/RLS/migrations, billing/product UI, additional entity
migration work, Operational Brain runtime/live AI, high/medium CodeQL batches,
Dependabot work, README, AGENTS, broad M3/M4/M5, or broad architecture rewrites.

## Required Future Evidence

The future `T-505` worker must provide:

- active-slice proof resolving exactly `T-505`;
- diff proof limited to ADR/current-authority docs;
- focused docs proof: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, and `pnpm track:audit`;
- resolver proof after the closeout records no replacement implementation slice
  unless a later gate explicitly promotes one;
- explicit non-goals for `T-502`, direct destructive `T-503`, runtime route/auth
  changes, schema/RLS/migrations, billing/product UI, README, and AGENTS.
