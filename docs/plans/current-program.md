---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-22
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document defines the current phase, priority, sequencing and ordinary delivery
> contract. Detailed completed proof is historical and linked below rather than repeated here.

## Current Phase

`ORDINARY-DELIVERY-CURRENT-AUTHORITY-REPAIR` is the sole active implementation. The owner
authorized a bounded repair of repository instructions, active planning authority, ordinary plan
validation, legacy-validation selection, review/model guidance and the separately installed local
Interdomestik skill. It selects no pilot product feature and authorizes no deployment.

Predecessor PR [#1807](https://github.com/interdomestik/interdomestik/pull/1807) merged as
`c7c643acdaf0371e29fa01526dd638decf779b77`; tree
`6048c5be747155adaa10eed1366056a6233be941` matches its reviewed candidate. Exact-main CI, CD
(including staging E2E), Secret Scan and the rerun Sonar Main Gate passed. Production and rollback
jobs were skipped. This current repair starts from that exact main and does not repeat its proof.

Pilot product implementation remains paused. Completed product increments through S5 first-case
saved-draft continuity [#1801](https://github.com/interdomestik/interdomestik/pull/1801) are credited;
whole S5 and the SRS requirement families named below remain open.

## Program Goals

1. Keep one concise active program and one concise active tracker for current decisions.
2. Make ordinary delivery consume current safety checks without retired Lean formatting,
   projection, manifest or rehearsal bookkeeping.
3. Preserve historical evidence and explicit legacy validation without making either an ordinary
   product prerequisite.
4. Match model participation and verification depth to demonstrated risk while preserving
   independent scrutiny of high-risk work and protected current-head trust semantics.

## Enduring Safety Boundaries

- `apps/web/src/proxy.ts` remains the sole routing, access-control and tenant-isolation authority
  and is read-only unless the owner explicitly authorizes a justified change.
- Canonical routes `/member`, `/agent`, `/staff` and `/admin` must not be renamed or bypassed.
  Contractual `page-ready` and `*-page-ready` markers remain enforced.
- Supabase Auth remains the identity/session system of record, `better-auth` the orchestrator and
  `@interdomestik/shared-auth` the provider-agnostic boundary. Tenant/RLS and document lifecycle
  protections remain mandatory. Authentication must never be bypassed, including in development.
- Paddle remains the only V3 pilot billing provider. No routing, auth, tenancy, domain, schema,
  billing or deployment expansion is implied by a green check or planning entry.
- `README.md`, `AGENTS.md` and architecture documents change only on an explicit owner request. This
  governance repair carries that authorization only for its bounded owned files.
- Framework and dependency versions come from the workspace manifests, especially
  `apps/web/package.json`; prose must not duplicate a hard-coded framework version.
- Architecture-finalization work is conditional and follows
  [its program](architecture-finalization-program-2026-05-29.md) and
  [tracker](architecture-finalization-tracker-2026-05-29.md) only when explicitly promoted.

## Ordinary Product Delivery

- One bounded protected PR carries scope, acceptance, implementation and required tests. Routine
  promotion, qualification, closeout, status-only and bookkeeping-only PRs are not required.
- Focused feedback supports iteration. Runtime, security, CI/trust or other meaningful behavior
  changes still require `pnpm pr:verify` and `pnpm security:guard`; `pr:verify` includes E2E gate
  evidence for the same source, configuration and environment. Instruction-only work runs the
  current plan/contracts relevant to its changed surface. Protected hosted checks remain separate
  trust evidence and are not replaced by local receipts.
- `pnpm plan:audit` validates the active plan/tracker model and current safety contract. It does not
  parse retired Lean authority or reconstruct historical artifacts. `pnpm plan:audit:legacy` and
  `pnpm test:harness-v2` remain available for explicit legacy work.
- CI runs the retained shared delivery-safety tests on ordinary changes. Full legacy authority and
  Harness validation runs only when a legacy artifact, its actual consumer or its selection policy
  changes, or when explicitly invoked. Incomplete change evidence fails toward running legacy proof.
- `pnpm repo:size:check` growth is advisory except for the retained coarse largest-file and class-aware
  modularity limits. Ordinary source, test and catalog work needs no exact allocation, shared-budget
  update or byte-specific approval. Historical allocations remain evidence for their original work.
- Review the integrated current-head diff, substantive review bodies, inline findings and actionable
  check annotations. Consolidate accepted corrections before one expensive final verification lane.
  Do not transfer proof across changed source, configuration or environment identity.
- Record prepared, tested, merged, deployed and user-validated states separately. A merge never
  implies deployment or user acceptance.

## Model And Review Policy

- Use the least expensive capable owner for the demonstrated risk. GPT-5.6 Sol at appropriate
  reasoning is the normal integration owner; reserve Astra escalation for a concrete unresolved
  gate, security, concurrency, data-loss or cross-domain architecture ambiguity.
- Helper work must be bounded and disjoint. A routine deterministic change needs no fixed panel;
  one relevant subscription helper is sufficient when independent input is useful. Add a distinct
  second perspective for real cross-domain, security or concurrency risk.
- High-risk work retains independent review separate from implementation judgment. The reviewer is
  selected for the risk, not to satisfy a model-brand ritual.
- Reuse accepted helper/reviewer evidence until its inputs change. Verify the actually served model.
  Provider exhaustion may use an approved adequate alternative for low/medium risk without a routine
  waiver ceremony. Never retry solely to repair advisory formatting or use a paid API fallback.
- Helper output is evidence, not authority. Codex remains responsible for source inspection,
  executable tests, dispositions and final integration.

## Product Queue And Dependencies

The detailed SRS and architecture frontier lives in the
[requirement disposition map](requirement-disposition-map.md), which preserves all 510 numbered
clauses and supplementary controls. SRS v0.9 remains the reviewed baseline at SHA-256
`8bc2b69c9babf8f228941378a01a32340f23d3ff061f92c574a9a908472981a2`; repo/program and accepted
ADR authority control until explicitly amended.

When product work resumes, continue the owner-adopted outcome order without rebuilding delivered
behavior: remaining S5 first-case gaps, S6 member continuation/membership, S7 staff handling, S8
agent handoff, S9 assisted activation, S10 branch oversight, S11 tenant administration, S12 platform
operations and S13 outcome/closure, followed by S14 whole-pilot rehearsal. H1 Help Now keeps its
priority lane when its direct country/content/stop-rule dependencies are ready.

Direct dependencies remain local to their consumers. Request-bound upload, staff acknowledgement
and fulfilment precede an evidence round-trip claim; reviewed signed/versioned/integrity/expiry
contracts precede offline pack readiness; S8 precedes dependent S9; recovery, partner, mandate,
consent and billing receipts precede affected S13 promises. T-411 keeps its T-401, SVC-CORE and
FLIGHT-03 dependency chain. No whole-overlay or stale historical row becomes a blanket pilot gate.

Pilot admission still requires the applicable role journeys, EN/SQ/MK/SR coverage, complete-process
accessibility evidence, truthful contract-backed copy, tenant/role/privacy/data-integrity checks,
operational ownership, incident/restore evidence and explicit release authorization. CI success
alone is not business or user acceptance.

## Current Repair Acceptance

- Active instructions are concise, internally consistent and free of hard-coded framework versions.
- Current program/tracker validators enforce meaningful boundaries and one active tracker without
  retired Lean markers or historical artifact reconstruction.
- Legacy artifacts and all Harness tests remain intact; CI selects their full validation only for
  actual legacy changes or explicit invocation while retaining ordinary shared-safety coverage.
- Review/model guidance is risk-proportionate, reuses accepted evidence and preserves independent
  high-risk scrutiny plus exact-current-head semantics.
- The local Interdomestik skill records the same policy separately; the repository PR does not
  distribute or install that local file.
- Focused contracts, `pnpm pr:verify`, `pnpm security:guard`, protected PR checks and review of all
  current-head findings pass before delivery. No automatic merge or deployment follows.

## Historical Evidence

- [Program ledger through PR #1807](history/2026-09-22-current-program-ledger.md)
- [Tracker and proof ledger through PR #1807](history/2026-09-22-current-tracker-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

These records are immutable evidence inputs, not active queues. The retired Lean projection and
slice runners remain explicit-only and cannot select or block ordinary owner-authorized work.
