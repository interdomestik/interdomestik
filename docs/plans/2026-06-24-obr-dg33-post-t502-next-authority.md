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

# OBR-DG33 Post-T502 Next Slice Selection Gate

## Decision

Promote exactly one next governed slice: `T-107`.

Direct work remains blocked until this gate merges and `next-slice.mjs` resolves
exactly `T-107`.

## Evidence

- `T-502` implementation PR `#1194` merged at
  `6610a392532a5b7f2d3e8d0f139c9fc4a896967b` from final head
  `39ed70ddade9bf6f85e51f4f778e45620eb4ad31`.
- `T-502` closeout/current-authority PR `#1195` merged at
  `d098c202721d10ebbf2bf16515f21af3102fadd0`.
- Post-closeout main health at `d098c202` is green for CI run `28127500665`,
  including unit job `83295005224` and DB-backed `e2e-gate` job
  `83295005252`; Sonar Main Gate run `28127500667`; Secret Scan/gitleaks run
  `28127500649`; and CodeQL run `28127500281`. CD/Vercel is deployment-only
  evidence and is not readiness proof.
- Pre-gate resolver proof on clean `origin/main` at `d098c202`:
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`.
- Canonical remaining status-bearing M0-M5 rows are `T-002b`, `T-110`,
  `T-107`, and direct destructive `T-503`.

## Candidate Comparison

| Candidate                                 | Disposition | Rationale                                                                                                                                                                                                                                       |
| ----------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T-107`                                   | Selected    | ADR/current-authority closeout only. Its listed dependencies `T-101`, `T-104`, `T-108`, `T-111`, and `T-114` are complete, and closing the ADR set reduces governance debt before additional implementation or destructive status-removal work. |
| `T-110`                                   | Parked      | Still implementation/telemetry work around distinct `host_id` evidence. It remains valid M1 work but is higher risk than the ADR closeout and should follow a fresh exact promotion.                                                            |
| `T-002b`                                  | Parked      | Service/flight transition invariants touch the claim-transition engine and VONESA/SVC-adjacent rules. It is valid core work, but it is broader than the documentation closeout and should be separately promoted.                               |
| Direct destructive `T-503`                | Parked      | Direct legacy `claims.status` removal remains destructive and still requires qualifying release evidence plus fresh explicit destructive approval.                                                                                              |
| M6, product expansion, Dependabot, CodeQL | Parked      | Out of scope while core M0-M5 remains incomplete unless separately authorized and current-authority selects exactly one governed slice.                                                                                                         |

## Promoted Scope

`T-107` is limited to ADR/current-authority closeout from completed dependency
evidence:

- finalize ADR-01 tenant decomposition from the completed tenant/legal/host
  foundation evidence;
- finalize ADR-03 event stream from the completed outbox/event-payload/relay
  evidence;
- finalize the ADR-06 model half for `ida.*` neutral-host behavior without
  reopening live-login runtime work;
- finalize ADR-10 entity-of-record from the completed governing-law,
  terms-version, and entity-of-record foundation evidence;
- update only current-authority/tracker surfaces required by validators.

## Forbidden Scope

This gate does not authorize runtime/source changes, tests, dependencies,
proxy/routing/auth/session/tenancy code, schema/RLS/migrations, billing/product
UI, M6/product expansion, VONESA/SVC/CQRS/UI/UX implementation, Dependabot
work, README, AGENTS, broad architecture rewrites, direct destructive `T-503`,
`T-110`, or `T-002b`.

## Required Future Evidence

The future `T-107` worker must provide:

- active-slice proof resolving exactly `T-107`;
- diff proof limited to ADR/current-authority docs;
- focused docs proof: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, and `pnpm track:audit`;
- resolver proof after the closeout records no replacement implementation slice
  unless a later gate explicitly promotes one;
- explicit non-goals for runtime/source changes, proxy/routing/auth/session,
  schema/RLS/migrations, billing/product UI, README, AGENTS, direct destructive
  `T-503`, `T-110`, `T-002b`, M6, and product expansion.
