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

Repository authority promotes exactly one Tier 2 product/UI/accessibility slice:
`IDA-T115-P0A-CANONICAL-FRONT-DOOR`. It makes the existing Help Now and
resolved-member `HomePageRuntime` composition the sole repository-controlled locale
landing before later T-115 session-pending and dashboard work. Runtime remains
unauthorized pending a separate exact-main receipt.

Immutable `IDA-DG45` is 16,491 UTF-8 bytes / SHA-256
`faed90a14251220b2092a830a8f44696d54877534ca9573e5aa699e2d5f3bc2e`, bound to
clean base `f4f6b5f8d93bfa30fffbd0c9c94eae32b42926be` and exact-approved by Arben in
task `019fa824-2676-7c22-9dcb-d21af1c354e6` on 2026-08-17. Admission
`138e2e5054fe3cbcc8e020fb9adbfd8f21a80c773297163e2ccffd62d1eb8771` is ready
with one outcome, three writers, three proof surfaces, one shared consumer and zero
special environments. UI/UX receipt
`c18f5ad3c8e266b9bb3a924d8360739efab93dc161574a19af54bf12536b6495` passes
with three operators and zero blocked sources. Opus 5 returned `REVISE` in 571.350
seconds; all exact findings were addressed without a further review loop and no final
model PASS is claimed.

Exact-approved `IDA-DG45-A1`, 4,379 bytes / SHA-256
`601ec770a7ab9fb9b0f6178767fadb0e6667bd8cf45a724864a33e2047b3cd70`,
corrects only the canonical identifier spelling from invalid proposal alias `P0a` to
resolver-safe `P0A`. The immutable parent gate and every substantive contract remain
unchanged.

The compact roadmap below preserves the live M0-M5 implementation blueprint. Full task
contracts, acceptance criteria and milestone detail remain canonical in the
[architecture-finalization program](./architecture-finalization-program-2026-05-29.md) and
its [tracker](./architecture-finalization-tracker-2026-05-29.md).

## M0-M5 Implementation Blueprint

| Phase | Purpose                                                                                                  | Current implementation frontier                                                       |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| M0    | Fail-closed transition, tenant-leak, role, brand and host-lane guardrails without schema change.         | Core T-* rows are complete; no remaining M0 T-* candidate.                            |
| M1    | Neutral `ida.*` foundation, additive lifecycle/event/legal-entity data and unified UI shell foundations. | Core rows are complete; remaining UI nodes are `T-115`, `T-117`, `T-118` and `T-116`. |
| M2    | Authoritative case/recovery lifecycle, jurisdiction handoff and event-backed projections.                | Core rows are complete; `T-210` remains after its M1 UI projection dependencies.      |
| M3    | One session-owned tenant context, `access_tenant_id` isolation and read-only attribution.                | Core rows are complete; `T-310` remains as the session-context theme boundary.        |
| M4    | Structural membership/product/AI/entity rules and safe member interaction surfaces.                      | Core rows are complete; `T-410` and `T-411` remain conditional UI candidates.         |
| M5    | Neutral-host live cutover, legacy retirement and legal-entity migration.                                 | All canonical M5 T-* rows are complete; no remaining M5 T-* candidate.                |

## Ordered Candidate Priorities

| Priority | Candidate                                                         | Dependencies                                                | Promotion constraint                                                                                 |
| -------: | ----------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
|        1 | `T-115` front-door public shell and skeleton baseline             | `T-108`, `T-114` complete                                   | First remaining M1 UI foundation; requires a fresh exact design gate.                                |
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

The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-P0A-CANONICAL-FRONT-DOOR` (Tier 2 product/UI/accessibility; `runtime_authorized:false`; immutable `IDA-DG45` plus exact-approved identifier correction `IDA-DG45-A1` pending docs-only merge).
