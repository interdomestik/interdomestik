---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-23
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document defines the current phase, priority, sequencing and ordinary delivery
> contract. Detailed completed proof is historical and linked below rather than repeated here.

## Current Phase

`REQUEST-LINKED-EVIDENCE-ROUND-TRIP` is the sole active implementation. The owner authorized a
bounded member-to-staff evidence round trip: a member uploads evidence against one open information
request and the claim's assigned staff member explicitly acknowledges that association. The request
remains open, and the slice changes neither claim lifecycle nor SLA behavior. It authorizes no
deployment.

The current-authority repair completed through protected PR
[#1808](https://github.com/interdomestik/interdomestik/pull/1808) as
`f22127f2ebcf45b5dc64ea521dbeb298b77654be`; tree
`f48eb434b6274ff266f9f353496410c1670ade4c` matches its reviewed candidate. Its exact-main CI,
Sonar and security checks passed. The corrected immutable-preview diagnostic later passed the
staging role-panel visibility precondition, but the original staging failure was not reproduced and
role grant/revoke scenarios P0.3/P0.4 remain a release-evidence gap. No staging, pilot or production
readiness is claimed. Protected PRs #1811 through #1813 subsequently simplified delivery
orchestration, enforced domain coverage and deduplicated release-candidate checks. The active slice
starts from current protected main `f12afb769fc555c3e33ba7064331e7276de58eb2`.

Product implementation resumed with this bounded S5/S7 dependency. Completed increments through
S5 first-case saved-draft continuity [#1801](https://github.com/interdomestik/interdomestik/pull/1801)
remain credited; whole S5 and the other SRS requirement families named below remain open.

## Program Goals

1. Give a member a request-specific evidence upload path backed by a durable tenant/claim/request/
   document association.
2. Give the claim's assigned staff member an explicit, retry-safe acknowledgement action with
   durable actor, timestamp and audit evidence.
3. Show submitted and acknowledged state to both participants across EN, SQ, MK and SR while using
   the existing document download authorization boundary.
4. Keep request fulfilment, claim lifecycle, SLA state, routing, authentication and tenancy outside
   the slice.

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

Continue the owner-adopted outcome order without rebuilding delivered behavior: remaining S5
first-case gaps, S6 member continuation/membership, S7 staff handling, S8
agent handoff, S9 assisted activation, S10 branch oversight, S11 tenant administration, S12 platform
operations and S13 outcome/closure, followed by S14 whole-pilot rehearsal. H1 Help Now keeps its
priority lane when its direct country/content/stop-rule dependencies are ready.

Direct dependencies remain local to their consumers. This slice proves request-bound upload and
assigned-staff acknowledgement; request fulfilment remains separate and open. Reviewed
signed/versioned/integrity/expiry
contracts precede offline pack readiness; S8 precedes dependent S9; recovery, partner, mandate,
consent and billing receipts precede affected S13 promises. T-411 keeps its T-401, SVC-CORE and
FLIGHT-03 dependency chain. No whole-overlay or stale historical row becomes a blanket pilot gate.

Pilot admission still requires the applicable role journeys, EN/SQ/MK/SR coverage, complete-process
accessibility evidence, truthful contract-backed copy, tenant/role/privacy/data-integrity checks,
operational ownership, incident/restore evidence and explicit release authorization. CI success
alone is not business or user acceptance.

## Current Repair Acceptance

- Each uploaded document is durably associated with exactly one open information request for the
  same tenant, claim and member.
- Only the claim's current assigned staff member can acknowledge the association. The original
  actor and timestamp are durable and retry-safe, with one audit event.
- Member and staff views expose the linked evidence and its submitted or acknowledged state across
  EN, SQ, MK and SR. Document download keeps the existing authorization boundary.
- The request remains open after upload and acknowledgement. Claim lifecycle and SLA state are
  unchanged.
- Focused persistence, tenant/RLS, domain, upload, UI and E2E contracts, independent targeted
  review, `pnpm pr:verify`, `pnpm security:guard` and protected current-head checks pass before
  delivery. No deployment or pilot-readiness claim follows.

## Historical Evidence

- [Program ledger through PR #1807](history/2026-09-22-current-program-ledger.md)
- [Tracker and proof ledger through PR #1807](history/2026-09-22-current-tracker-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

These records are immutable evidence inputs, not active queues. The retired Lean projection and
slice runners remain explicit-only and cannot select or block ordinary owner-authorized work.
