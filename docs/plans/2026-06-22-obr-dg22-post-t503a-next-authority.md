---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-22
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself and does not implement runtime work.

# OBR-DG22: Post-T-503a Next Authority

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after `T-503a` closeout and selects the next governed action.

Risk tier for this PR: Tier 0, because this branch changes only
`docs/plans/**` current-authority records.

Risk tier for the promoted future slice: Tier 3, because the future work touches
claim lifecycle data repair, database-backed claim rows, seed and E2E fixture
shape, and destructive-`T-503` readiness evidence. The future slice must run
the full protected-surface design and verification path before merge readiness.

## Revalidated Authority Evidence

| Source                        | Evidence                                                                                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch basis                  | `codex/obr-dg22-post-t503a-next-authority` was created from `origin/main` at `ec1eb6569ca14013857b09d4a10a2e0d3032ea94`.                                                                                                                                                            |
| PR `#1156`                    | Merged 2026-06-21 from head `02d00ff23779cf40584a5b858327035d8e368676` with squash/main `f708da4fa8fb24b705dbb2ddf1ffec817876fbf8`.                                                                                                                                                 |
| PR `#1157`                    | Merged 2026-06-21 from head `91fff40d299365b751e018a9784b3d90a3f481bd` with squash/main `ec1eb6569ca14013857b09d4a10a2e0d3032ea94`.                                                                                                                                                 |
| Main                          | `origin/main` and protected GitHub `main` resolve to `ec1eb6569ca14013857b09d4a10a2e0d3032ea94`.                                                                                                                                                                                    |
| Main health                   | Current main has CI success, Sonar Main Gate success, Secret Scan success, CodeQL/Push-on-main success, and Vercel commit status success. GitHub Actions `CD` remains pending and is deployment-only evidence, not a runtime readiness signal for this Tier 0 gate.                 |
| Resolver before this gate     | `next-slice.mjs .` returned `blocked_requires_current_authority`, `activeSlice=null`, reason `umbrella_without_concrete_promoted_slice`.                                                                                                                                            |
| Tracker read-path disposition | Local `current-tracker.md` is `3128099` bytes; GitHub contents API reports `encoding:"none"`, so contents API no-hit behavior is a read-path limitation. Local tracker rows record `T-503a` completed and no replacement slice promoted before this gate.                           |
| T-503a evidence               | `docs/plans/2026-06-21-t503a-lifecycle-inventory-report.md` records `121` aggregate `null_incomplete` lifecycle rows and maps legacy `claims.status` dependencies across transition current-state reads, status CAS, initialization writes, seed paths, and status-shaped fixtures. |

## Decision

Promote exactly one next governed implementation-readiness slice:
`T-503b Lifecycle Completeness Backfill And Initialization Hardening`.

Direct destructive `T-503` remains blocked. The next safe action is not to drop
or rename `claims.status`; it is to make lifecycle data complete enough that the
later command-path CAS deprecation and destructive migration can be evaluated
against real lifecycle state instead of null/incomplete rows.

## Why T-503b Is Next

`T-503a` changed the risk picture. The release evidence packet showed direct
`T-503` was missing required proof. The inventory then found every locally
aggregated claim row in the checked path was `null_incomplete`, not clean. A
future command-CAS migration would either fail on those rows or silently fall
back to `status`, which would preserve the dependency that `T-503` is meant to
remove.

`T-503b` is therefore the smallest safe next step because it addresses the live
data/readiness blocker without destructive schema work:

- non-destructive lifecycle completeness repair/backfill for existing rows;
- lifecycle-shaped initialization and fixture posture for new/test rows;
- inventory guard proof that `null_incomplete` no longer hides behind a false
  zero;
- rollback, observability, and handoff criteria for the later command-CAS slice.

## Rejected Candidates

| Candidate                                               | Disposition                                                                                                                                                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct `T-503`                                          | Blocked by missing qualifying release-cycle proof, `claims.status` current-state/CAS dependency, status-shaped initialization and fixtures, missing rollback/backfill/observability package, and `121` null/incomplete lifecycle rows. |
| Command-path CAS deprecation immediately after `T-503a` | Deferred until lifecycle completeness is repaired or explicitly isolated. Otherwise the command model would either reject existing rows broadly or retain `status` as fallback authority.                                              |
| `T-504`, `T-507`, `T-501`, `T-502`, `T-505`, `T-506`    | Not promoted. These are adjacent M5/entity/cutover actions and remain out of scope until their blockers and authority gates are satisfied.                                                                                             |
| Operational Brain runtime/live AI                       | Not promoted. This gate uses advisory OP Brain evidence only; it does not start runtime AI, model/provider calls, prompts, or agentic execution.                                                                                       |

## Promoted Slice Scope

Future `T-503b` is limited to:

- add or update an idempotent, dry-run-first lifecycle completeness repair path
  for existing `claims` rows whose lifecycle fields are null/incomplete but have
  a mappable legacy `status`;
- keep repair non-destructive: no `claims.status` drop/rename, no destructive
  schema migration, no data deletion, and no route/auth/tenancy/billing changes;
- update claim initialization and seed/test/E2E fixture factories so new rows are
  lifecycle-shaped first, with legacy `status` derived or compatibility-only;
- extend the lifecycle inventory or an equivalent focused guard so the future
  worker can prove repaired rows, remaining exceptions, and no false-zero report;
- define rollback/data-repair controls, owner-visible observability, and handoff
  criteria for the later command-path lifecycle CAS deprecation slice.

## Acceptance Evidence

| Acceptance criterion                          | Required proof                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repair path is non-destructive and reviewable | Dry-run output, apply guard, tenant/system scope explanation, and rollback instructions.                                                                        |
| Null/incomplete lifecycle debt is handled     | Before/after inventory proof classifies valid, invalid, null/incomplete, and mismatch counts without row-level PII.                                             |
| New rows are lifecycle-shaped                 | Focused tests or seed/fixture proof show initialization and key fixture paths set lifecycle fields directly.                                                    |
| Legacy `status` is not dropped                | Diff contains no `claims.status` drop/rename, destructive migration, proxy/routing/auth/session/tenancy/billing change, product UI change, or broad M5 cutover. |
| Future CAS work has a clean handoff           | Handoff states remaining status dependencies, any unrepaired exceptions, observability signals, and the exact blocker state for later `T-503`/CAS work.         |

## Boundaries For The Future Worker

- No direct destructive `T-503`.
- No `claims.status` drop, rename, or destructive migration.
- No `apps/web/src/proxy.ts`, canonical route, clarity-marker, auth/session,
  tenancy, billing/Paddle, product UI, README, AGENTS, or broad architecture-doc
  work.
- No `T-504`, `T-507`, `T-501`, `T-502`, `T-505`, or `T-506` implementation.
- No Operational Brain runtime/live AI, model/provider calls, prompts, or
  agentic execution.

If `T-503b` discovers unmappable rows, tenant-isolation uncertainty, production
data posture gaps, or rollback requirements that need schema/RLS/proxy/auth
changes, it must stop and return to current authority instead of expanding
scope.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs/current-authority gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof, resolver proof, and scope audit.

## Exit State

Authority is reconciled after `T-503a`. The resolver must now return exactly one
active slice: `T-503b`. Future direct `T-503` remains blocked until `T-503b`,
the later command-path CAS work, qualifying release-cycle proof,
rollback/backfill/observability evidence, and a fresh destructive-migration gate
are all complete.
