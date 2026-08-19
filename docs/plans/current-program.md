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

T-115 P0A canonical front-door composition and P0B pending-session continuity
remain complete in [PR #1577](https://github.com/interdomestik/interdomestik/pull/1577)
and [PR #1581](https://github.com/interdomestik/interdomestik/pull/1581). The
separate OD#17 public-shell performance residual is not complete.

The protected-main collector prerequisite completed in
[PR #1589](https://github.com/interdomestik/interdomestik/pull/1589). Recovery
[PR #1597](https://github.com/interdomestik/interdomestik/pull/1597) reached exact
head `6e334da050d16929733a84b89fb06359a6952892`: E2E, Sonar, CodeQL,
security, static, unit, AI-eval, Pilot and feedback intake passed. Its sole Vercel
Preview became READY, but the protected-main canary found zero GitHub Deployment
candidates because Vercel's `deployment_status Events` integration was OFF. No
performance metric ran or PASS exists; the attempt closed unmerged as
`provider_failure / measurement_capability_missing`.

Arben exact-approved the separate combined strategic exception and runtime receipt
`IDA-T115-OD17-BRIDGE-R1` on 2026-08-19 at 5,224 UTF-8 bytes / SHA-256
`3525c84ba4cb0bcdaedf4cf86195d72b9ea275b9796c8f1679dc2eff32543c34`, bound to
main `6cf5227fcdf7247b801d9aa4673eabb08bceab98`, the terminal artifact and the
historical implementation tree `ce742a8a995bde75fb7550547410f013d86708a0`.
It authorizes only one B-only recovery: restore the Deployment projection, consume one
automatic Preview and one protected-main canary, then rerun audit/finalizer once only
after valid evidence. Product/CI code, thresholds, provider target and Production are
unchanged. `T-118`, `T-117` and `T-116` remain blocked.

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
|        1 | `T-115` OD#17 public-shell performance proof                      | T-115 P0A/P0B complete                                      | `IDA-T115-OD17-BRIDGE-R1` exact-authorizes one final B-only projection/measurement attempt.                     |
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
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` (Tier 3 shared performance-verification recovery; `runtime_authorized:true`; exact-approved `IDA-T115-OD17-BRIDGE-R1`).
