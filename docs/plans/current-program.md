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
complete. Historical T-115 OD#17 remains terminal at
[PR #1601](https://github.com/interdomestik/interdomestik/pull/1601), merged as
`cb33cd616abcb79c4298c1024d592d8ae998c1cc`:
`INCONCLUSIVE — measurement_capability_missing/provider_failure`, subreason
`Vercel BUILD_EXCEEDED_MAXIMUM_TIME / no READY`. Its runtime R1 is consumed,
`runtime_authorized:false`, all task provider controls were restored, deployment history
was retained, and no retry or historical relabel is authorized.

Arben exact-approved
[`IDA-DG52-OD17-ATTESTED-PREBUILT-PREVIEW-R1`](./2026-08-19-ida-dg52-od17-attested-prebuilt-preview.md)
at 34,724 bytes / SHA-256
`a1170987331531853e168077263093a2d9a5dec197c1cc57ab30c43f54449ab9` and the passing
[`IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY-ADMISSION-V1`](./2026-08-19-ida-od17-attested-prebuilt-preview-capability-admission-v1.json)
at 7,461 bytes / SHA-256
`d71e241293e37d0d49c8f9fbb05db62f9a7a444c08b936c2bae5301109a132fc`, both bound to
`main@cb33cd616abcb79c4298c1024d592d8ae998c1cc`.

Phase A promotes only `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY` (Tier 3) to
`awaiting_runtime_authority`. `runtime_authorized:false`; this convergence authorizes
only inert authority materialization. No semantic implementation writer, GitHub
environment/provider mutation, dispatch, deployment, measurement, or successor result is
authorized before a separately approved exact R1 on healthy Phase-A main.

DG52 is a new successor, not a T-115 retry. Only a merged successor `PASS` can witness
`OD17_READY`; `T-118`, `T-117`, and `T-116` remain blocked under their existing
dependencies and none is promoted automatically.

The compact roadmap below preserves the live M0-M5 implementation blueprint. Full task
contracts, acceptance criteria and milestone detail remain canonical in the
[architecture-finalization program](./architecture-finalization-program-2026-05-29.md) and
its [tracker](./architecture-finalization-tracker-2026-05-29.md).

## M0-M5 Implementation Blueprint

| Phase | Purpose                                                                                                  | Current implementation frontier                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| M0    | Fail-closed transition, tenant-leak, role, brand and host-lane guardrails without schema change.         | Core T-* rows are complete; no remaining M0 T-* candidate.                                                            |
| M1    | Neutral `ida.*` foundation, additive lifecycle/event/legal-entity data and unified UI shell foundations. | T-115 P0A/P0B are complete; the successor OD17 capability awaits R1 and dependents remain blocked until `OD17_READY`. |
| M2    | Authoritative case/recovery lifecycle, jurisdiction handoff and event-backed projections.                | Core rows are complete; `T-210` remains after its M1 UI projection dependencies.                                      |
| M3    | One session-owned tenant context, `access_tenant_id` isolation and read-only attribution.                | Core rows are complete; `T-310` remains as the session-context theme boundary.                                        |
| M4    | Structural membership/product/AI/entity rules and safe member interaction surfaces.                      | Core rows are complete; `T-410` and `T-411` remain conditional UI candidates.                                         |
| M5    | Neutral-host live cutover, legacy retirement and legal-entity migration.                                 | All canonical M5 T-* rows are complete; no remaining M5 T-* candidate.                                                |

## Ordered Candidate Priorities

| Priority | Candidate                                                         | Dependencies                                                | Promotion constraint                                                                                                                   |
| -------: | ----------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
|        1 | `T-115` OD#17 public-shell performance proof                      | T-115 P0A/P0B complete                                      | Historical terminal INCONCLUSIVE; no retry. DG52 capability is awaiting R1, and only a merged successor PASS can witness `OD17_READY`. |
|        2 | `T-118` `ui/crystal` presentational primitives                    | T-115 including OD#17 complete                              | Requires its own fresh design gate; keep domain imports at zero and preserve accessibility/performance budgets.                        |
|        3 | `T-117` unified member dashboard shell                            | T-115 including OD#17, T-114 complete                       | May run beside T-118 only under its own gate; preserve RSC, query and neutral-host constraints.                                        |
|        4 | `T-116` exhaustive `CaseSummary` projection and renderer registry | `T-103` complete, T-115 including OD#17, T-118              | Promote only after both UI foundations are complete.                                                                                   |
|        5 | `T-210` event timeline renderer registry                          | `T-206` complete, `T-116`                                   | Promote only after the shared case projection exists; preserve unknown-event and PII-safe fallbacks.                                   |
|        6 | `T-310` session-context theme tokens                              | `T-302`, `T-302b` complete                                  | Independent conditional M3 candidate; never derive tenant branding from host.                                                          |
|        7 | `T-410` reversible optimistic-action boundary                     | `T-401`, `T-002` complete                                   | Independent conditional M4 candidate; status, money and legal mutations remain pessimistic.                                            |
|        8 | `T-411` shared Smart Next Step library                            | `T-401` complete; `SVC-CORE` and `FLIGHT-03` still required | Blocked until both non-T prerequisites have their own completed authority and evidence.                                                |

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
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY` (Tier 3; `runtime_authorized:false`).
