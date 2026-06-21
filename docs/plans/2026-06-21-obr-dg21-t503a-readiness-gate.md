---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-21
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself and does not authorize destructive migration work.

# OBR-DG21: T-503a Readiness Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after PR `#1154` and promotes the next concrete implementation-readiness
slice. Risk tier: Tier 0 because this PR touches only docs/plans authority.

## Authority Evidence

| Source                     | Evidence                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker branch              | `codex/obr-dg21-t503a-readiness-gate` was created from live `origin/main` at `c54f406d4f73f3c9d43635c8d58c4c28d30c3df8`; worktree was clean before edits.                                   |
| PR `#1154`                 | Merged 2026-06-21 at `c54f406d4f73f3c9d43635c8d58c4c28d30c3df8`, adding `docs/plans/2026-06-21-t503-release-evidence-packet.md`.                                                            |
| Post-merge main health     | Main at `c54f406d` has CI success including `e2e-gate`, Sonar Main Gate success, CodeQL success, and Secret Scan success. CD remains pending deployment-only and waived/skippable by Arben. |
| Resolver before this gate  | `next-slice.mjs .` returned `blocked_requires_current_authority`, `activeSlice=null`, reason `umbrella_without_concrete_promoted_slice`.                                                    |
| Evidence packet conclusion | `T-503_BLOCKED_RUNTIME_DEPENDENCY`: direct destructive `T-503` is unsafe.                                                                                                                   |

## Blockers For Direct T-503

Direct `T-503` status removal remains blocked by:

- missing qualifying post-`T-202` release-cycle proof;
- runtime transition/current-state/CAS dependency on `claims.status`;
- status-shaped initialization, seed, E2E, and pilot fixture paths;
- missing rollback, data-repair/backfill, and observability package for a
  destructive status-column migration.

## Promoted Slice

The next active governed implementation goal is exactly one canonical tracker
slice: `T-503a`.

`T-503a` goal: produce the non-destructive implementation-readiness package
needed before destructive `T-503` can be reconsidered. The slice must add or
produce a read-only lifecycle consistency inventory/report for claim lifecycle
pair validity and status/lifecycle mismatch risk, and design/spec the command
path deprecation route for replacing legacy `claims.status` current-state
validation and CAS.

## T-503a Scope

Future `T-503a` implementation scope:

- Add or produce a read-only lifecycle consistency inventory/report covering
  `case_lifecycle_state`, `recovery_lifecycle_state`, legacy `status`, null
  lifecycle fields, invalid lifecycle pairs, and status/lifecycle mismatches.
- Classify report output into valid, invalid, null/incomplete, and mismatch
  categories, with counts and enough command output or artifact evidence for a
  reviewer to verify the risk.
- Map runtime command dependencies on `claims.status`, especially transition
  current-state reads and status CAS, initialization writes, and status-shaped
  fixtures.
- Design the command-path deprecation route for replacing status current-state
  validation/CAS with lifecycle-state inputs or an equivalent compatibility-free
  command model.
- State the rollback/non-destructive boundary and handoff criteria required
  before future destructive `T-503` promotion.

## Acceptance Evidence For Future T-503a

| Acceptance criterion                           | Required proof                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventory command exists or report is produced | A named command or checked-in report artifact is present and documented, with expected output shape.                                                                            |
| Classification is explicit                     | Output separates valid lifecycle pairs, invalid pairs, null/incomplete lifecycle rows, and status/lifecycle mismatches.                                                         |
| Runtime dependency map is concrete             | Report/design names command-path `claims.status` dependencies, including current-state read, CAS, initialization, and fixture/status-shaped setup paths.                        |
| Destructive boundary is preserved              | Diff contains no `claims.status` drop/rename, no destructive schema migration, and no RLS/schema rewrite.                                                                       |
| Rollback/handoff criteria are defined          | Design states what evidence future `T-503` needs: release-cycle proof, clean inventory or repair plan, command-path deprecation complete, rollback/backfill, and observability. |

Expected focused proof for future `T-503a` depends on touched surfaces. If it
stays docs/script/report-only, use focused proof plus relevant package tests. If
it touches runtime transition commands, schema, migrations, RLS, CI/gates, or
protected paths, the worker must stop for reclassification before expanding
scope.

## Hard Boundaries

- No `claims.status` drop, rename, or destructive migration.
- No schema/RLS migration unless separately reauthorized.
- No proxy, routing, auth/session, tenancy, billing, entity migration, product
  UI, or Operational Brain runtime/live AI work.
- No broad M5 and no `T-504`, `T-507`, `T-501`, `T-502`, `T-505`, or `T-506`.
- No README or AGENTS changes.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no implementation
diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof plus scope audit.

## Exit State

Authority is reconciled after PR `#1154`; direct destructive `T-503` remains
blocked, and `T-503a` is the only promoted next implementation-readiness slice.
The next worker should implement exactly `T-503a` without rediscovering scope.
