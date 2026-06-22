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

# OBR-DG23: T-503c Lifecycle CAS Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after `T-503b` closeout and selects the next governed
implementation-readiness action.

Risk tier for this PR: Tier 0, because this branch changes only
`docs/plans/**` current-authority records.

Risk tier for the promoted future slice: Tier 3, because the future work touches
claim lifecycle command semantics, current-state reads, CAS predicates,
`lifecycle_version`, event/history/audit behavior, fixture posture, and
protected runtime verification.

## Revalidated Authority Evidence

| Source                    | Evidence                                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch basis              | `codex/obr-dg23-t503c-lifecycle-cas-gate` is attached at `550bb219909ce82ce4888a2c56825b9949b9b648`, equal to or newer than the delegated `origin/main` authority.                                                                                    |
| `T-503b` implementation   | PR `#1159` merged from final head `4f2508bb00adbb85ba85a9f5695a913648181475` with squash merge `1776e5095f021373878001697ee1c4ccb10ffe1c`.                                                                                                            |
| `T-503b` closeout         | PR `#1160` is recorded by the supervisor as merged before this gate; current authority now records `T-503b` complete with no replacement runtime slice started.                                                                                       |
| Main health at handoff    | Remote `main` at `550bb219909ce82ce4888a2c56825b9949b9b648` had CI, Sonar Main Gate, Secret Scan, and CodeQL green; CD remained pending/deployment-only.                                                                                              |
| Resolver before this gate | `next-slice.mjs .` returned `blocked_requires_current_authority`, `activeSlice=null`, reason `umbrella_without_concrete_promoted_slice`; evidence row records `T-503b` complete and no replacement runtime slice started.                             |
| OP Brain recommendation   | Read-only advisory recommends a Tier 0 `OBR-DG23` current-authority/design-gate PR for exactly `T-503c`, because direct `T-503` remains blocked by release-cycle proof and runtime transition/current-state/CAS dependency on legacy `claims.status`. |

## Decision

Promote exactly one next governed implementation-readiness slice:
`T-503c Command-Path Lifecycle CAS Deprecation Readiness`.

Direct destructive `T-503` remains blocked. The promoted work is
non-destructive: prove command-path transition/current-state/CAS behavior can
move away from runtime dependence on `claims.status` while retaining
`claims.status` as a compat/derived field. No drop, rename, destructive
migration, or status-column removal is authorized.

## Why T-503c Is Next

`T-503b` completed lifecycle completeness repair/backfill and initialization
hardening, so the next unresolved blocker is the command path itself. The
transition command still needs proof that current-state reads and CAS can rely
on lifecycle states plus `lifecycle_version` instead of legacy status.

`T-503c` is the smallest safe next step because it addresses that command-path
dependency without crossing into destructive schema work or M5 cutover.

## Promoted Slice Scope

Future `T-503c` is limited to implementation-readiness for command-path
lifecycle CAS deprecation:

- transition current-state reads must use lifecycle state inputs and
  `lifecycle_version` without treating `claims.status` as source of truth;
- CAS predicates must prove stale lifecycle pair/version conflicts are rejected
  before side effects;
- `claims.status` remains retained as compat/derived output during the slice;
- lifecycle-version behavior must stay monotonic and event/audit compatible;
- event, history, and audit behavior must remain deterministic and structural;
- fixtures, seeds, and initialization used by the command path must be
  lifecycle-shaped or explicitly isolated as compatibility inputs.

## Acceptance Evidence Inventory

| Evidence area            | Required proof for the future worker                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command transition paths | Named transition entry points no longer authorize or CAS from legacy `claims.status` as authoritative current state.                                                              |
| Current-state read paths | Read context returns expected case lifecycle state, recovery lifecycle state, and `lifecycle_version`; legacy status is absent from the command authority contract or derived.    |
| CAS predicate behavior   | Tests prove stale lifecycle-pair and stale-version writes fail before side effects, history rows, audit rows, or domain events are recorded.                                      |
| Lifecycle version        | Version increments stay monotonic, one-winner concurrency proof remains intact, and event aggregate version behavior is preserved.                                                |
| Event/history/audit      | Status-shaped public history remains compatible while internal command proof records lifecycle-derived transitions without creating duplicate or misleading audit/event evidence. |
| Status compatibility     | `claims.status` is retained as compat/derived data; no drop, rename, destructive migration, or removal of status-shaped public DTOs occurs.                                       |
| Fixtures/initialization  | Command-path fixtures and initialization are lifecycle-shaped first, with any status-shaped setup explicitly isolated as compatibility posture.                                   |
| Tests and gates          | Focused transition, conflict, event/history/audit, fixture, and regression proof plus Tier 3 protected-surface gates required by the eventual implementation diff.                |

## Non-Goals

- No direct `T-503`.
- No `claims.status` drop or rename.
- No destructive schema or RLS migration.
- No proxy, routing, auth, session, tenancy, billing, Paddle, or product UI
  change.
- No Operational Brain runtime/live AI, model/provider calls, prompts, or
  agentic execution.
- No broad M3, M4, or M5.
- No `T-501`, `T-502`, `T-504`, `T-505`, `T-506`, or `T-507`.
- No README, AGENTS, or broad architecture-doc rewrite.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs/current-authority gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof, resolver proof, and scope audit.

## Exit State

Authority is reconciled after `T-503b`. The next active governed implementation
goal is exactly one canonical tracker slice: `T-503c`.

Future direct `T-503` remains blocked until `T-503c`, qualifying release-cycle
proof, rollback/backfill/observability evidence, and a fresh destructive
migration gate are complete.
