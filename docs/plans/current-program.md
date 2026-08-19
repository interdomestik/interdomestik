---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-19
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This is the only document allowed to define the current phase, committed priorities, and sequencing for repository execution.

## Current Phase

T-115 P0A canonical front-door composition and P0B pending-session continuity remain
complete. The separate OD#17 public-shell performance residual is not complete.

The protected-main projection capability remains merged through
[PR #1598](https://github.com/interdomestik/interdomestik/pull/1598); its canonical
closeout [PR #1600](https://github.com/interdomestik/interdomestik/pull/1600)
established exact measurement base `bf9849744866e8dd84294b2638e03ddb73cf0d65`.

Runtime R1 materialized inert commit `8f091436945849851672503734c85e9e7b6cc78a`
and frozen tree-identical head `3a9689b94cb9a353ab2db8435d32ac5e8534123f`.
The sole automatic Preview was Vercel deployment
`dpl_DH8E1oGWTsf8s4xi2Mg6i7Ck87Wx` at
[its immutable URL](https://interdomestik-k0m820rtz-ecohub.vercel.app); it never
reached READY and ended `BUILD_EXCEEDED_MAXIMUM_TIME`. GitHub deployment
`5987940626` / status `17029471770` recorded failure. Raw provider evidence is
5,074 bytes, SHA-256
`ac745d3bb4b092d2d8e786e37aef4f1c0f493bd0b118baa82e83ca7d60da393d`.
No measurement PR, preparation, canary, metrics, audit, finalizer or merge occurred.

The fixed disposition is
`INCONCLUSIVE — measurement_capability_missing/provider_failure`, subreason
`Vercel BUILD_EXCEEDED_MAXIMUM_TIME / no READY`. Both task variables and the task
Trusted Source were re-read absent; `deployment_status Events` and
`repository_dispatch Events` were OFF. Standard Protection remained ON and deployment
history was retained. Runtime R1 is consumed and
`runtime_authorized:false`; no retry is authorized. The capability stays merged.
No successor is promoted; `T-118`, `T-117` and `T-116` remain blocked pending a
new separate strategic decision.

The compact roadmap below preserves the live M0-M5 implementation blueprint. Full task
contracts, acceptance criteria and milestone detail remain canonical in the
[architecture-finalization program](./architecture-finalization-program-2026-05-29.md) and
its [tracker](./architecture-finalization-tracker-2026-05-29.md).

## M0-M5 Implementation Blueprint

| Phase | Purpose                                                                                                  | Current implementation frontier                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| M0    | Fail-closed transition, tenant-leak, role, brand and host-lane guardrails without schema change.         | Core T-* rows are complete; no remaining M0 T-* candidate.                                              |
| M1    | Neutral `ida.*` foundation, additive lifecycle/event/legal-entity data and unified UI shell foundations. | T-115 P0A/P0B are complete; OD#17 performance proof remains before dependent `T-117`, `T-118`, `T-116`. |
| M2    | Authoritative case/recovery lifecycle, jurisdiction handoff and event-backed projections.                | Core rows are complete; `T-210` remains after its M1 UI projection dependencies.                        |
| M3    | One session-owned tenant context, `access_tenant_id` isolation and read-only attribution.                | Core rows are complete; `T-310` remains as the session-context theme boundary.                          |
| M4    | Structural membership/product/AI/entity rules and safe member interaction surfaces.                      | Core rows are complete; `T-410` and `T-411` remain conditional UI candidates.                           |
| M5    | Neutral-host live cutover, legacy retirement and legal-entity migration.                                 | All canonical M5 T-* rows are complete; no remaining M5 T-* candidate.                                  |

## Ordered Candidate Priorities

| Priority | Candidate                                                         | Dependencies                                                | Promotion constraint                                                                                            |
| -------: | ----------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
|        1 | `T-115` OD#17 public-shell performance proof                      | T-115 P0A/P0B complete                                      | Terminal INCONCLUSIVE under DG51; no retry. Any successor requires a new separate strategic decision.           |
|        2 | `T-118` `ui/crystal` presentational primitives                    | T-115 including OD#17 complete                              | Requires its own fresh design gate; keep domain imports at zero and preserve accessibility/performance budgets. |
|        3 | `T-117` unified member dashboard shell                            | T-115 including OD#17, T-114 complete                       | May run beside T-118 only under its own gate; preserve RSC, query and neutral-host constraints.                 |
|        4 | `T-116` exhaustive `CaseSummary` projection and renderer registry | `T-103` complete, T-115 including OD#17, T-118              | Promote only after both UI foundations are complete.                                                            |
|        5 | `T-210` event timeline renderer registry                          | `T-206` complete, `T-116`                                   | Promote only after the shared case projection exists; preserve unknown-event and PII-safe fallbacks.            |
|        6 | `T-310` session-context theme tokens                              | `T-302`, `T-302b` complete                                  | Independent conditional M3 candidate; never derive tenant branding from host.                                   |
|        7 | `T-410` reversible optimistic-action boundary                     | `T-401`, `T-002` complete                                   | Independent conditional M4 candidate; status, money and legal mutations remain pessimistic.                     |
|        8 | `T-411` shared Smart Next Step library                            | `T-401` complete; `SVC-CORE` and `FLIGHT-03` still required | Blocked until both non-T prerequisites have their own completed authority and evidence.                         |

These are the remaining unimplemented T-* nodes, not active authorization. The order is a
dependency-aware selection guide: parallel-capable rows still require separate slices. Each
candidate needs a fresh content-addressed design gate, repository convergence and, when the
risk contract requires it, a separately approved exact runtime receipt before implementation.

## Selection Constraints

- Paddle is the only billing provider for the V3 pilot; do not add Stripe or a parallel provider.
- Select one outcome and one slice; do not combine product, architecture, CI, AI OS, or
  housekeeping work.
- Do not infer promotion from this roadmap. Resolver state remains blocked until one exact
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
The next active governed implementation goal is blocked pending a fresh current-authority/design-gate selection; resolver target is `blocked_requires_current_authority`, `activeSlice=null`.
