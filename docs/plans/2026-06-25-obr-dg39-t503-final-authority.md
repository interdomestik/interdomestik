---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-25
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# OBR-DG39: T-503 Final M0-M5 Authority Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after `T-002b` closeout and promotes the final remaining M0-M5
governed action.

Risk tier for this PR: Tier 0, because this branch changes only
`docs/plans/**` current-authority and tracker documentation.

Risk tier for the later `T-503` implementation worker: Tier 3, because it is
destructive schema/runtime work that drops legacy `claims.status`, changes
claim-state compatibility posture, and requires DB/RLS/migration, rollback,
data-repair, observability, and reviewer/security proof.

## Revalidated Authority Evidence

| Source                         | Evidence                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch basis                   | `origin/main` was revalidated as `1831eca2328d94b7ce3490d5d4dde986645f9451`, the T-002b closeout/current-authority merge SHA, before branch `codex/obr-dg39-t503-final-authority` was created.                                                                                                                  |
| T-002b closeout                | PR `#1207` merged through `1831eca2328d94b7ce3490d5d4dde986645f9451`, recording T-002b implementation PR `#1206` / merge `fa018a53fd6c3423cd2a6240957f9efbc12f5aa2` and no replacement runtime slice.                                                                                                           |
| Post-closeout main health      | At `1831eca2`, main health is green for CI `28148443726`, Sonar Main Gate `28148443728`, Secret Scan/gitleaks `28148443763`, CodeQL `28148443379`, and manual main Security/pnpm-audit `28148459680`; CD `28148443742` is deployment-only and not readiness evidence.                                           |
| Resolver before this gate      | `next-slice.mjs .` returned `blocked_requires_current_authority`, `activeSlice=null`, reason `umbrella_without_concrete_promoted_slice`.                                                                                                                                                                        |
| T-503 readiness evidence       | `T-503a`, `T-503b`, and `T-503c` are complete. `T-503c` completed through PR `#1162` / merge `5b8b6c4d05adf2344625374a9b79402744159d53`, proving command-path lifecycle CAS readiness while retaining `claims.status` as compat/derived.                                                                        |
| Release/deployment observation | `gh release list` shows only `v3-pilot-baseline-2026-02-05`; GitHub deployments after T-202 are staging-only in the sampled API records, including no deployment for `1831eca2`. The future worker must refresh this evidence and stop if no qualifying release-cycle or explicitly approved equivalent exists. |

## Candidate Comparison

| Candidate                                     | Decision             | Rationale                                                                                                                                                                                                                                      |
| --------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct `T-503` status-column removal          | Promote exactly this | It is the only remaining status-bearing M0-M5 row. Prerequisites `T-202`, `T-503a`, `T-503b`, `T-503c`, `T-107`, `T-110`, `T-002b`, and M5 dependency rows are complete. Completing M0-M5 now requires resolving this final destructive slice. |
| Another non-destructive T-503 readiness slice | Reject               | The existing readiness ladder already completed lifecycle inventory, lifecycle completeness repair, initialization hardening, and command-path lifecycle CAS deprecation readiness.                                                            |
| M6/product expansion, VONESA/SVC/CQRS/UI work | Reject               | Core M0-M5 is not totally complete until `T-503` is closed. These workstreams remain unpromoted.                                                                                                                                               |
| Dependabot or general security backlog        | Reject               | These remain out of scope unless they become required branch-protection blockers or receive a separate current-authority gate.                                                                                                                 |

## Decision

Promote exactly one governed implementation slice: `T-503`.

The next active governed implementation goal is exactly one canonical tracker
slice: `T-503`.

Direct implementation must wait until this gate merges and the current-authority
resolver promotes exactly `T-503`.

## Bounded T-503 Runtime Envelope

The future `T-503` worker is limited to the final M0-M5 legacy status-column
retirement:

1. Refresh release-cycle evidence after `T-202` and after the later `T-503c`
   readiness work. If no qualifying production release-cycle or explicitly
   approved equivalent exists, stop before destructive migration and report the
   exact missing evidence.
2. Produce a current data-quality inventory proving every live claim has valid
   `case_lifecycle_state`, valid `recovery_lifecycle_state`, no invalid pairs,
   and no mismatch that requires legacy status recovery.
3. Remove runtime authority from legacy `claims.status`; lifecycle state pairs
   and `lifecycle_version` remain the command/read authority.
4. Add the destructive migration to drop legacy `claims.status` and remove or
   replace legacy status indexes/predicates safely.
5. Preserve public/member/agent/staff/admin compatibility only through explicit
   derived lifecycle projections where status-shaped output is still required.
6. Include rollback, data-repair, backfill, and observability proof for failed
   migration, invalid lifecycle pairs, transition conflicts, dashboard/filter
   regressions, and downstream compatibility issues.
7. Keep the change inside the claim lifecycle/status retirement envelope.

## Required Future Evidence

| Evidence area         | Required proof for `T-503`                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active authority      | Resolver on clean merged main resolves exactly `T-503`; no M6/product-expansion or unrelated security/dependency scope is active.                                                                                                       |
| Release-cycle proof   | A named production release-cycle after `T-202` and `T-503c`, or an explicitly approved equivalent, proves lifecycle-state reads and command-path lifecycle CAS ran long enough to make status removal safe.                             |
| Data quality          | Current inventory shows valid lifecycle pairs for live claims, no invalid pairs, no unrepaired null/incomplete rows, and no status/lifecycle mismatch requiring legacy status recovery.                                                 |
| Destructive migration | Forward migration drops `claims.status` and obsolete status indexes/predicates; rollback/data-repair posture is documented and tested according to repo migration practice.                                                             |
| Runtime compatibility | Public/member/agent/staff/admin read surfaces keep any necessary status-shaped DTO fields as derived compatibility output without using `claims.status` as a source of truth.                                                           |
| Tenant/RLS safety     | Low-privilege tenant/RLS proof shows status removal and replacement predicates preserve tenant isolation, access-tenant behavior, and claim/document visibility boundaries.                                                             |
| Gates/review          | Tier 3 implementation proof includes focused tests, migration/RLS proof, `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`, CI unit/e2e-gate, Sonar, gitleaks, CodeQL, Copilot/Codex feedback intake, and bounded senior review. |
| Approval              | Because this is destructive schema/runtime work, implementation merge readiness requires explicit human approval or written waiver after current-head evidence is available.                                                            |

## Explicit Non-Goals

- No runtime transition code in this gate.
- No tests, dependencies, lockfiles, README, AGENTS, proxy, routing,
  auth/session, tenancy runtime, billing, product UI, or worker startup in this
  gate.
- No M6/product expansion, broad VONESA/FLIGHT/SVC rollout, CQRS/read-model
  work, UI/UX implementation, Operational Brain runtime/live AI, Dependabot
  work, or broad architecture rewrite.
- No `apps/web/src/proxy.ts` edits unless separately and explicitly authorized.

## Expected Tier 0 Proof

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs .`

## Exit State

Authority is reconciled after `T-002b` closeout. The next active governed
implementation goal is exactly one canonical tracker slice: `T-503`.

Future direct `T-503` remains bounded by release-cycle proof, data-quality
inventory, destructive migration review, rollback/data-repair/observability
evidence, Tier 3 gates, and explicit human approval or waiver before merge
readiness.
