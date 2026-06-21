---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-21
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 evidence packet for `T-503`. This record does not promote
> destructive migration work and does not authorize dropping or renaming
> `claims.status`.

# T-503 Release Evidence Packet

## Classification

Classified as promotion/design-gate evidence because this slice only inventories
repo and GitHub evidence for `T-503` readiness. Risk tier: Tier 0 because the
only changed surface is this docs/plans evidence artifact.

## Live Authority Snapshot

| Source               | Evidence                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current head         | `origin/main` is `36065c69f5834925e7a9b6b650c56fc44d2cd378`, PR `#1153`, merged 2026-06-21.                                                                                                                                             |
| Current main health  | GitHub main at `36065c69` has CodeQL, Secret Scan, Sonar Main Gate, and CI success. CI run `27916575448` completed successfully, including `e2e-gate`. CD remains pending deployment-only and was supervisor-waived/skippable by Arben. |
| Resolver             | `next-slice.mjs .` returns `blocked_requires_current_authority`, `activeSlice=null`, reason `umbrella_without_concrete_promoted_slice`.                                                                                                 |
| Prior readiness gate | PR `#1153` / `OBR-DG20` parks direct `T-503` implementation pending this release-cycle evidence packet.                                                                                                                                 |
| `T-202` authority    | PR `#1104` merged 2026-06-18 at `a7f93d3558f4005987424ae3ad46fda0504ca094`; PR checks were green, but its immediate post-merge main Sonar run failed and main CI was cancelled. Later main heads recovered.                             |

## Release-Cycle Proof Since T-202

No concrete qualifying production release-cycle proof was found.

- Current repo release-gate documents under `docs/release-gates/` end before
  `T-202`; no post-2026-06-18 production release report was found.
- GitHub deployments after `T-202` exist for staging only:
  `6ff96d6`, `d8787a1`, `7e7b943`, and `38227c8`.
- GitHub deployments for current main SHA `36065c69` returned `[]`.
- Current commit status shows Vercel `success` with description
  `Canceled by Ignored Build Step`, which is not production deployment proof.
- Current main CI/Sonar/security evidence supports repo health, not a deployed
  release cycle where lifecycle-state reads ran in an environment eligible for
  destructive schema removal.

Conclusion: the release-cycle requirement for `T-503` remains missing.

## Dual-Read / Dual-Write Inventory

Evidence that lifecycle fields are read-authoritative:

- `packages/domain-claims/src/claims/lifecycle-read-model.ts` resolves read
  status from `caseLifecycleState` and `recoveryLifecycleState` when both are
  valid, and falls back to legacy `status` only for null or invalid lifecycle
  pairs.
- `packages/domain-claims/src/claims/lifecycle-read-sql.ts` builds SQL
  predicates from lifecycle state pairs first, then falls back to legacy
  `status`.
- Runtime read consumers use `resolveClaimLifecycleReadProjection(...)` or
  `claimLifecycleStatus*` helpers across public/member/agent/staff/admin paths,
  including claim mappers, member claim detail, public tracking, agent claim
  groups, staff claim list/detail, admin analytics, admin overview, branch
  dashboard, stats, and admin/user summaries.

Evidence that dual-write/legacy write compatibility remains required:

- `packages/domain-claims/src/claims/create.ts` initializes `status: 'draft'`
  and lifecycle states.
- `packages/domain-claims/src/claims/submit.ts` initializes
  `status: 'submitted'` and lifecycle states.
- `packages/domain-claims/src/claims/transition.ts` writes
  `status: toStatus`, writes mapped lifecycle states, and uses
  `eq(claims.status, current.status)` in the transition compare-and-set.
- `packages/domain-claims/src/claims/transition-read-context.ts` reads
  `claims.status` as the transition command's current state.
- `scripts/check-claim-status-writers.mjs` passes and inventories 13 allowed
  `claims.status` writer surfaces, including the transition writer,
  initialization writers, and seed/E2E/pilot fixture writers.

Conclusion: the repo proves lifecycle read compatibility, but it does not prove
that legacy `claims.status` writes are removable. The current transition command
still depends on legacy status for current-state validation and CAS.

## Legacy claims.status Dependency Inventory

Runtime blockers:

- `packages/domain-claims/src/claims/transition.ts`: central transition writer
  persists and CAS-checks legacy status.
- `packages/domain-claims/src/claims/transition-read-context.ts`: transition
  reads current legacy status.
- `packages/domain-claims/src/claims/create.ts` and
  `packages/domain-claims/src/claims/submit.ts`: claim initialization still
  writes legacy status.
- `packages/database/src/schema/claims.ts`: schema still defines `status`,
  legacy status indexes, and status-based tenant indexes.
- `packages/domain-claims/src/admin-claims/*`,
  `packages/domain-claims/src/agent-claims/*`,
  `packages/domain-claims/src/staff-claims/*`, and
  `packages/domain-claims/src/update-claim-status.ts`: action boundaries still
  select legacy status as transition-command input.

Compatibility/read surfaces expected until a separate migration:

- Public/member/agent/staff/admin read DTOs still expose a `status` field as a
  compatibility projection.
- URL/filter and dashboard aggregate paths use lifecycle SQL helpers while
  preserving legacy status-shaped output.
- Timeline/history/domain-event copy still references claim status names and
  `claim.status_changed` event semantics.

Test, fixture, and script references expected:

- Unit tests mock `claims.status` and status-shaped DTOs to prove compatibility.
- E2E and pilot seeders use status-shaped data for deterministic scenarios.
- `scripts/ci/*claim-status-writer*` and `scripts/check-claim-status-writers.mjs`
  are guard evidence, not removal candidates.
- `packages/database/src/seed-*` and `scripts/pilot/*` still write status-shaped
  fixtures.

Docs historical references:

- `docs/architecture/adr-02-case-recovery-split.md` records lifecycle-state
  authority but explicitly requires release-cycle dual-read proof before status
  removal.
- `docs/architecture/adr-04-claim-status-transition-sole-writer.md` records
  status-transition writer authority and permits direct writes only for approved
  seeds, migrations, backfills, fixtures, or later canonical migration slices.
- `docs/plans/2026-06-21-obr-dg20-t503-readiness-gate.md` parks `T-503`
  implementation pending this evidence.

Potential removable follow-up:

- Direct `claims.status <> 'paid'` compatibility logic in
  `apps/web/src/actions/branch-dashboard.core.ts` should be reviewed in a
  future status-removal refactor because it is adjacent to lifecycle SQL helper
  filtering.
- Legacy status indexes must be removed only inside the final destructive
  migration after command/read dependencies are retired.

## Destructive Migration Readiness

Required evidence before dropping `claims.status`:

- A named production release or equivalent approved release-cycle window after
  `T-202` where lifecycle-state reads were deployed and exercised.
- Data-quality report proving every live claim has valid
  `case_lifecycle_state` and `recovery_lifecycle_state`, with no invalid pairs
  and no mismatches requiring legacy status recovery.
- A command-path migration plan replacing transition current-state validation
  and CAS with lifecycle-state inputs or a new compatibility-free command model.
- A backfill/data-repair script for null or inconsistent lifecycle pairs, plus
  dry-run and rollback evidence.
- A rollback plan that can restore status-equivalent behavior if the drop fails
  or if downstream consumers still need status-shaped data.
- Observability for post-migration lifecycle read mismatches, transition
  conflicts, invalid lifecycle pairs, and dashboard/filter regressions.
- RLS/index/migration proof showing status indexes and predicates are removed or
  replaced safely.

Current evidence status: not present.

## Recommendation

`T-503_BLOCKED_RUNTIME_DEPENDENCY`

Exact blockers:

- Missing post-`T-202` qualifying production release-cycle proof.
- Runtime transition command still reads, writes, and CAS-checks
  `claims.status`.
- Initialization, seed, E2E, and pilot fixture paths still write status-shaped
  data.
- No rollback/data-repair/backfill/observability package exists for destructive
  status removal.

Next smallest action:

Promote a non-destructive Tier 1/Tier 3 readiness slice that adds a read-only
claim lifecycle consistency inventory/report and a command-path deprecation
design for replacing legacy status CAS. Do not promote the destructive
`T-503` migration until that evidence and release-cycle proof exist.
