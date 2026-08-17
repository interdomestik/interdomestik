---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-17
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This is the only document allowed to define the current phase, committed priorities, and sequencing for repository execution.

## Current Phase

No implementation slice is active. `IDA-T115-P0A-CANONICAL-FRONT-DOOR` completed
in [PR #1577](https://github.com/interdomestik/interdomestik/pull/1577), exact head
`39a5fb07c3c56991cabfcb7bd15d2415d193c419`, squash merge
`70c7c1f324fa3ddd8d6da7d21f31dc5df13aca34`. The locale root now has one
repository-controlled `HomePageRuntime` composition with literal `hero_v2`; the direct
legacy Hero/intake/sticky composition is no longer mounted. Public/no-JS continuity,
resolved-member continuation and all protected route/auth/tenant boundaries remain
unchanged.

This closes only the P0A active-path prerequisite. T-115 still needs a fresh exact gate
for its neutral session-pending skeleton and OD#17 completion; T-117/T-118/T-116 and
every other roadmap candidate remain unpromoted. Detailed implementation and closeout
evidence is linked from `current-tracker.md` rather than copied here.

The compact roadmap below preserves the live M0-M5 implementation blueprint. Full task
contracts, acceptance criteria and milestone detail remain canonical in the
[architecture-finalization program](./architecture-finalization-program-2026-05-29.md) and
its [tracker](./architecture-finalization-tracker-2026-05-29.md).

## M0-M5 Implementation Blueprint

| Phase | Purpose                                                                                                  | Current implementation frontier                                                                |
| ----- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| M0    | Fail-closed transition, tenant-leak, role, brand and host-lane guardrails without schema change.         | Core T-* rows are complete; no remaining M0 T-* candidate.                                     |
| M1    | Neutral `ida.*` foundation, additive lifecycle/event/legal-entity data and unified UI shell foundations. | T-115 P0A is complete; its skeleton/performance residual and `T-117`, `T-118`, `T-116` remain. |
| M2    | Authoritative case/recovery lifecycle, jurisdiction handoff and event-backed projections.                | Core rows are complete; `T-210` remains after its M1 UI projection dependencies.               |
| M3    | One session-owned tenant context, `access_tenant_id` isolation and read-only attribution.                | Core rows are complete; `T-310` remains as the session-context theme boundary.                 |
| M4    | Structural membership/product/AI/entity rules and safe member interaction surfaces.                      | Core rows are complete; `T-410` and `T-411` remain conditional UI candidates.                  |
| M5    | Neutral-host live cutover, legacy retirement and legal-entity migration.                                 | All canonical M5 T-* rows are complete; no remaining M5 T-* candidate.                         |

## Ordered Candidate Priorities

| Priority | Candidate                                                         | Dependencies                                                | Promotion constraint                                                                                 |
| -------: | ----------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
|        1 | `T-115` session-pending skeleton and OD#17 residual               | P0A, `T-108`, `T-114` complete                              | Continue only through a fresh exact gate; do not reopen the canonical-composition work.              |
|        2 | `T-118` `ui/crystal` presentational primitives                    | `T-115`                                                     | May follow `T-115`; keep domain imports at zero and preserve accessibility/performance budgets.      |
|        2 | `T-117` unified member dashboard shell                            | `T-115`, `T-114` complete                                   | May run beside `T-118` only under its own gate; preserve RSC, query and neutral-host constraints.    |
|        3 | `T-116` exhaustive `CaseSummary` projection and renderer registry | `T-103` complete, `T-115`, `T-118`                          | Promote only after both UI foundations are complete.                                                 |
|        4 | `T-210` event timeline renderer registry                          | `T-206` complete, `T-116`                                   | Promote only after the shared case projection exists; preserve unknown-event and PII-safe fallbacks. |
|        5 | `T-310` session-context theme tokens                              | `T-302`, `T-302b` complete                                  | Independent conditional M3 candidate; never derive tenant branding from host.                        |
|        6 | `T-410` reversible optimistic-action boundary                     | `T-401`, `T-002` complete                                   | Independent conditional M4 candidate; status, money and legal mutations remain pessimistic.          |
|        7 | `T-411` shared Smart Next Step library                            | `T-401` complete; `SVC-CORE` and `FLIGHT-03` still required | Blocked until both non-T prerequisites have their own completed authority and evidence.              |

These are the remaining unimplemented T-* nodes, not active authorization. The order is a
dependency-aware selection guide: parallel-capable rows still require separate slices. Each
candidate needs a fresh content-addressed design gate, repository convergence and, when the
risk contract requires it, a separately approved exact runtime receipt before implementation.

## Selection Constraints

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

The next active governed implementation goal is blocked pending a fresh current-authority/design-gate selection; resolver target is `blocked_requires_current_authority`, `activeSlice=null`.
