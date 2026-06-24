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

# OBR-DG34 Post-T107 Next Slice Selection Gate

## Decision

Promote exactly one next governed slice: `T-110`.

Direct work remains blocked until this gate merges and `next-slice.mjs` resolves
exactly `T-110`.

## Evidence

- `T-107` closeout/current-authority PR `#1197` merged at
  `86e285cc0e20ff9078cbd59efc1472e47443578c` from final head
  `010b52df1588f5b9ce5b1868fa01e485a7b7d041`.
- Post-merge main health at `86e285cc` is green for CI run `28130841708`,
  including unit job `83306410114` and DB-backed `e2e-gate` job
  `83306410115`; Sonar Main Gate run `28130841694`; Secret Scan/gitleaks run
  `28130841703`; and CodeQL run `28130841013`. CD/Vercel is deployment-only
  evidence and is not readiness proof.
- Pre-gate resolver proof on clean `origin/main` at `86e285cc`:
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`.
- Canonical remaining status-bearing M0-M5 rows are `T-002b`, `T-110`, and
  direct destructive `T-503`.

## Candidate Comparison

| Candidate                  | Disposition | Rationale                                                                                                                                                                                                                                                   |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T-110`                    | Selected    | Small remaining M1 core work. Its dependency `T-108` is complete, it records entry-host telemetry as data distinct from tenant resolution, and it closes ida-first host-model debt before broader transition-invariant or destructive migration work.       |
| `T-002b`                   | Parked      | Valid remaining M0/M2-adjacent work, but its service/flight transition invariants touch the central claim-transition engine and VONESA/SVC-adjacent rules. It should follow a separate exact promotion after `T-110` or a fresh current-authority decision. |
| Direct destructive `T-503` | Parked      | Direct legacy `claims.status` removal remains destructive and still requires qualifying release evidence plus fresh explicit destructive approval.                                                                                                          |
| M6/product expansion       | Parked      | Out of scope while core M0-M5 remains incomplete unless separately authorized and current-authority selects exactly one governed slice.                                                                                                                     |

## Promoted Scope

`T-110` is limited to host telemetry as data, not tenant authority:

- record the entry `host_id` for relevant request/event telemetry where the
  existing host model already resolves the incoming host;
- keep `host_id` non-load-bearing for tenant, access-tenant, legal-entity,
  booking, recovery, routing, auth/session, and billing decisions;
- preserve completed `T-108`, `T-109`, `T-114`, `T-501`, `T-505`, and `T-107`
  host-model decisions;
- include focused proof that hostile/unknown/country-alias/IDA hosts do not
  change tenant resolution through `host_id`;
- update only current-authority/tracker surfaces required by validators.

## Forbidden Scope

This gate does not authorize proxy edits, canonical route changes, auth/session
or tenancy runtime refactors, schema/RLS/migrations unless explicitly required
by the implementation and separately justified inside the `T-110` envelope,
billing/product UI, README, AGENTS, direct destructive `T-503`, `T-002b`,
M6/product expansion, VONESA/SVC/CQRS/UI/UX implementation, Dependabot work,
Operational Brain runtime/live AI, or broad architecture rewrites.

## Required Future Evidence

The future `T-110` worker must provide:

- active-slice proof resolving exactly `T-110`;
- focused diff proof bounded to host telemetry and validator-required
  current-authority surfaces;
- proof that `host_id` is recorded only as telemetry/data and is not used for
  tenant resolution, access-tenant resolution, legal-entity selection, booking
  authority, recovery authority, auth/session authority, routing authority, or
  billing authority;
- focused unit/integration/E2E proof appropriate to the touched host/request
  surfaces, plus standard `git diff --check`, docs/plan/tracker validators,
  `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate` or current-head
  CI equivalents if local infrastructure blocks;
- explicit non-goals for proxy/routing/auth/session/tenancy refactors,
  schema/RLS/migrations outside the promoted envelope, billing/product UI,
  README, AGENTS, direct destructive `T-503`, `T-002b`, M6, and product
  expansion.
