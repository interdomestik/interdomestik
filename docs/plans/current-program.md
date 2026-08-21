---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-20
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This is the only document allowed to define the current phase, committed priorities, and sequencing for repository execution.

## Current Phase

T-115 P0A canonical front-door composition and P0B pending-session continuity remain
complete. Historical T-115 OD#17 remains terminal at
[PR #1601](https://github.com/interdomestik/interdomestik/pull/1601), merged as
`cb33cd616abcb79c4298c1024d592d8ae998c1cc`:
`INCONCLUSIVE — measurement_capability_missing/provider_failure`, subreason
`Vercel BUILD_EXCEEDED_MAXIMUM_TIME / no READY`. Its runtime R1 is consumed,
`runtime_authorized:false`, all task provider controls were restored, deployment history
was retained, and no retry or historical relabel is authorized.

The parent DG52 authority converged through
[PR #1602](https://github.com/interdomestik/interdomestik/pull/1602), merged as
`182fe71b3a50ad076f2a8746bf1b6401a724d2d0`. Its original eleven-writer Phase-B map and
admission remain immutable historical evidence but are superseded for execution by the
exact-approved
[`IDA-DG52-A1-OD17-ATTESTED-PREBUILT-PREVIEW-SPLIT`](./2026-08-20-ida-dg52-a1-od17-attested-prebuilt-preview-split.md)
at 24,802 bytes / SHA-256
`4fa5b4f67eb2207c81c1c0ef03333d5fee50f9090c2c056f2019b3b63653617b`.

PR #1603 merged A1 as `d384f8182b1441315d724a58b788a5383e3b53db`. Its three V1
admissions remain immutable historical evidence and are superseded for future execution by
the exact-approved
[`IDA-DG52-A2-OD17-CHILD-FAIL-CLOSED-REPAIR-R1`](./2026-08-20-ida-dg52-a2-od17-child-fail-closed-repair.md)
at 17,847 bytes / SHA-256
`9710a3f0dd1bc285ffc2905c93d4edb499c34d829bf63364a30e13ff51084b33`.

A2's independently passing V2 admissions are Artifact Foundation at 10,696 bytes / SHA-256
`12f2a2ac5a5076bf90733870bc2c706d6414ab6c4858e2caf51c858e635b6a41`, Deployment
Confinement at 10,745 bytes / SHA-256
`4a12313ebed84cb12226c41035cc850a180f6273e44fda6ebfa86d7716699a8e`, and Measurement
Integration at 11,324 bytes / SHA-256
`4eba84f1680f2992076a7f62bd0e639ded88bb796c576eac0aad9967c6e4ab96`, all bound to
`main@d384f8182b1441315d724a58b788a5383e3b53db`.

[PR #1604](https://github.com/interdomestik/interdomestik/pull/1604) merged A2 as
`755c02d052999c76ccf184dfa3f6746e5b61ad52`. The Child-A checkpoint is now fixed by its
[failure closeout](./2026-08-20-ida-od17-attested-prebuilt-preview-artifact-foundation-failure-closeout.md)
as `NOT_RUN — strategic_stop_before_R1_A`. No R1-A was approved or materialized, no
semantic or provider operation occurred, and the A1/A2 Child-A execution path is terminated
without retry. `runtime_authorized:false`, `activeSlice=null`, and the resolver target is
`blocked_requires_current_authority`.

Historical T-115 remains terminal INCONCLUSIVE and is not relabeled. No successor `PASS`
witnesses `OD17_READY`; Deployment Confinement, Measurement Integration, R2, `T-118`,
`T-117`, and `T-116` remain blocked. A future OD17 approach requires a fresh strategic
decision and none is promoted automatically.

Separately, R2 supersedes R1 for A1 execution after R1 omitted the required Z620 parity-digest
writer. The exact-approved
[`IDA-CI-DG01-PR-UNIT-SELECTION-R2`](./2026-08-20-ida-ci-dg01-pr-unit-selection-r2.md) is
30,348 bytes / SHA-256 `5f5700cc19717e5519979b3d5d4f492c29cb0cbfffaafdceac94ed7668961ced`;
the passing
[`IDA-CI01-PR-UNIT-SHADOW-A1-ADMISSION-V2`](./2026-08-20-ida-ci-pr-unit-shadow-a1-admission-v2.json)
is 33,351 bytes / SHA-256 `b2f681f1834b2b7be0316f086f5d1d72e47ad0ca03511ba9924bf1c05274a368`.
Both are bound to `main@ca91e67e0535c96a94e55d6dde12716823172e26`.

R2 promotes only `IDA-CI01-PR-UNIT-SHADOW-A1` (Tier 3) to
`awaiting_runtime_authority`. `runtime_authorized:false`, `activeSlice:null`; this
convergence authorizes only R2 governance materialization. No semantic implementation,
prototype transfer, test skipping, provider/runtime operation, or A2 activation is authorized
before healthy exact R2 rebind main and a separately drafted, byte-exact approved A1 R2 runtime
receipt bound to that returned main SHA.

The compact roadmap below preserves the live M0-M5 implementation blueprint. Full task
contracts, acceptance criteria and milestone detail remain canonical in the
[architecture-finalization program](./architecture-finalization-program-2026-05-29.md) and
its [tracker](./architecture-finalization-tracker-2026-05-29.md).

## M0-M5 Implementation Blueprint

| Phase | Purpose                                                                                                  | Current implementation frontier                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| M0    | Fail-closed transition, tenant-leak, role, brand and host-lane guardrails without schema change.         | Core T-* rows are complete; no remaining M0 T-* candidate.                                                                    |
| M1    | Neutral `ida.*` foundation, additive lifecycle/event/legal-entity data and unified UI shell foundations. | T-115 P0A/P0B are complete; OD17 successors are blocked after Child A stopped before R1-A, and dependents await `OD17_READY`. |
| M2    | Authoritative case/recovery lifecycle, jurisdiction handoff and event-backed projections.                | Core rows are complete; `T-210` remains after its M1 UI projection dependencies.                                              |
| M3    | One session-owned tenant context, `access_tenant_id` isolation and read-only attribution.                | Core rows are complete; `T-310` remains as the session-context theme boundary.                                                |
| M4    | Structural membership/product/AI/entity rules and safe member interaction surfaces.                      | Core rows are complete; `T-410` and `T-411` remain conditional UI candidates.                                                 |
| M5    | Neutral-host live cutover, legacy retirement and legal-entity migration.                                 | All canonical M5 T-* rows are complete; no remaining M5 T-* candidate.                                                        |

## Ordered Candidate Priorities

| Priority | Candidate                                                         | Dependencies                                                | Promotion constraint                                                                                                                                             |
| -------: | ----------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|        1 | `T-115` OD#17 public-shell performance proof                      | T-115 P0A/P0B complete                                      | Historical terminal INCONCLUSIVE; A2/V2 Child A is NOT_RUN with no retry. Any successor needs fresh authority and only its merged PASS can witness `OD17_READY`. |
|        2 | `T-118` `ui/crystal` presentational primitives                    | T-115 including OD#17 complete                              | Requires its own fresh design gate; keep domain imports at zero and preserve accessibility/performance budgets.                                                  |
|        3 | `T-117` unified member dashboard shell                            | T-115 including OD#17, T-114 complete                       | May run beside T-118 only under its own gate; preserve RSC, query and neutral-host constraints.                                                                  |
|        4 | `T-116` exhaustive `CaseSummary` projection and renderer registry | `T-103` complete, T-115 including OD#17, T-118              | Promote only after both UI foundations are complete.                                                                                                             |
|        5 | `T-210` event timeline renderer registry                          | `T-206` complete, `T-116`                                   | Promote only after the shared case projection exists; preserve unknown-event and PII-safe fallbacks.                                                             |
|        6 | `T-310` session-context theme tokens                              | `T-302`, `T-302b` complete                                  | Independent conditional M3 candidate; never derive tenant branding from host.                                                                                    |
|        7 | `T-410` reversible optimistic-action boundary                     | `T-401`, `T-002` complete                                   | Independent conditional M4 candidate; status, money and legal mutations remain pessimistic.                                                                      |
|        8 | `T-411` shared Smart Next Step library                            | `T-401` complete; `SVC-CORE` and `FLIGHT-03` still required | Blocked until both non-T prerequisites have their own completed authority and evidence.                                                                          |

These are the remaining unimplemented T-* nodes, not active authorization. The order is a
dependency-aware selection guide: parallel-capable rows still require separate slices. Each
candidate needs a fresh content-addressed design gate, repository convergence and, when the
risk contract requires it, a separately approved exact runtime receipt before implementation.

## Selection Constraints

- Paddle is the only billing provider for the V3 pilot; do not add Stripe or a parallel provider.
- Select one outcome and one slice; do not combine product, architecture, CI, AI OS, or
  housekeeping work.
- Do not infer promotion from this roadmap. Resolver state changes only when one exact
  candidate is admitted by current program and tracker together.
- Prefer direct user/business value, bounded dependencies, low protected-surface risk,
  focused proof, and explicit rollback.
- Repository source, `AGENTS.md`, tests, current program/tracker, relevant architecture
  tracker, resolver, PR checks, finalizer, and merged evidence are final authority.
- Obsidian and AI OS are advisory memory. They cannot promote or authorize repository work.
- Treat Mac as the control plane and light writer: record a free-disk preflight, use
  GitHub-hosted Ubuntu for CI/E2E, and route truly required local DB/E2E heavy work to Z620
  only through the governed heavy-job controller; do not start local Supabase/Docker by default.
- Current docs replace their one compact state at selection and closeout. Detailed gate,
  review, PR, CI, runtime, and rollback evidence belongs in the stable per-slice artifact and
  is linked rather than copied here.

## Historical Authority

All authority history through Rev 243 is recoverable byte-for-byte from Git through
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-CI01-PR-UNIT-SHADOW-A1` (Tier 3; `runtime_authorized:false`).
