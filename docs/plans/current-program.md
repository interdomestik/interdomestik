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
at 17,796 bytes / SHA-256
`07c0d238f5062a6652c976cf89f1f7d7dc80d11afd052ddfd87026c62260d473`.

A2's independently passing V2 admissions are Artifact Foundation at 10,667 bytes / SHA-256
`c3c95198d4992fe2718ac75c4282f8f7d97cf5c6999cc9bc316bc6599ae66a29`, Deployment
Confinement at 10,716 bytes / SHA-256
`949388acaf32f63e933e8ff39a6559208ed7f7fd4d00fe5749ed12afffa1882c`, and Measurement
Integration at 11,266 bytes / SHA-256
`0f69cfb15579cf1cd6a0acb717ff79f7b58532bd31ae9ff4328626d28eafe18f`, all bound to
`main@d384f8182b1441315d724a58b788a5383e3b53db`.

A2 keeps only `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` (Tier 3) at
`awaiting_runtime_authority`. `runtime_authorized:false`; this repair convergence is inert.
Fresh exact R1-A on healthy A2 main is required before any semantic writer. Deployment
Confinement and Measurement Integration remain blocked behind their predecessor closeouts;
no GitHub-environment/provider mutation, OIDC, dispatch, deployment or measurement is
authorized.

DG52 is a new successor, not a T-115 retry. Only a merged successor `PASS` can witness
`OD17_READY`; `T-118`, `T-117`, and `T-116` remain blocked under their existing
dependencies and none is promoted automatically.

The compact roadmap below preserves the live M0-M5 implementation blueprint. Full task
contracts, acceptance criteria and milestone detail remain canonical in the
[architecture-finalization program](./architecture-finalization-program-2026-05-29.md) and
its [tracker](./architecture-finalization-tracker-2026-05-29.md).

## M0-M5 Implementation Blueprint

| Phase | Purpose                                                                                                  | Current implementation frontier                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| M0    | Fail-closed transition, tenant-leak, role, brand and host-lane guardrails without schema change.         | Core T-* rows are complete; no remaining M0 T-* candidate.                                                                 |
| M1    | Neutral `ida.*` foundation, additive lifecycle/event/legal-entity data and unified UI shell foundations. | T-115 P0A/P0B are complete; A2/V2 Child A awaits R1-A, B/C remain sequentially blocked, and dependents await `OD17_READY`. |
| M2    | Authoritative case/recovery lifecycle, jurisdiction handoff and event-backed projections.                | Core rows are complete; `T-210` remains after its M1 UI projection dependencies.                                           |
| M3    | One session-owned tenant context, `access_tenant_id` isolation and read-only attribution.                | Core rows are complete; `T-310` remains as the session-context theme boundary.                                             |
| M4    | Structural membership/product/AI/entity rules and safe member interaction surfaces.                      | Core rows are complete; `T-410` and `T-411` remain conditional UI candidates.                                              |
| M5    | Neutral-host live cutover, legacy retirement and legal-entity migration.                                 | All canonical M5 T-* rows are complete; no remaining M5 T-* candidate.                                                     |

## Ordered Candidate Priorities

| Priority | Candidate                                                         | Dependencies                                                | Promotion constraint                                                                                                              |
| -------: | ----------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
|        1 | `T-115` OD#17 public-shell performance proof                      | T-115 P0A/P0B complete                                      | Historical terminal INCONCLUSIVE; no retry. A2/V2 Child A awaits R1-A, and only a merged successor PASS can witness `OD17_READY`. |
|        2 | `T-118` `ui/crystal` presentational primitives                    | T-115 including OD#17 complete                              | Requires its own fresh design gate; keep domain imports at zero and preserve accessibility/performance budgets.                   |
|        3 | `T-117` unified member dashboard shell                            | T-115 including OD#17, T-114 complete                       | May run beside T-118 only under its own gate; preserve RSC, query and neutral-host constraints.                                   |
|        4 | `T-116` exhaustive `CaseSummary` projection and renderer registry | `T-103` complete, T-115 including OD#17, T-118              | Promote only after both UI foundations are complete.                                                                              |
|        5 | `T-210` event timeline renderer registry                          | `T-206` complete, `T-116`                                   | Promote only after the shared case projection exists; preserve unknown-event and PII-safe fallbacks.                              |
|        6 | `T-310` session-context theme tokens                              | `T-302`, `T-302b` complete                                  | Independent conditional M3 candidate; never derive tenant branding from host.                                                     |
|        7 | `T-410` reversible optimistic-action boundary                     | `T-401`, `T-002` complete                                   | Independent conditional M4 candidate; status, money and legal mutations remain pessimistic.                                       |
|        8 | `T-411` shared Smart Next Step library                            | `T-401` complete; `SVC-CORE` and `FLIGHT-03` still required | Blocked until both non-T prerequisites have their own completed authority and evidence.                                           |

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
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` (Tier 3; `runtime_authorized:false`).
