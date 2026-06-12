# OBR-DG01 Operating-Business Readiness Reauthorization Gate

Status: complete
Slice: `OBR-DG01`
Owner: platform + commercial + qa
Phase: Phase C
Date: 2026-06-12
Authority: approved design gate after `T-104h` closeout.

## Scope Boundary

This is a design-gate and blocker-record slice only. It does not authorize runtime code,
schema, migration, RLS, route, proxy, auth, tenancy, billing, AI, UI, README, AGENTS, or
broad architecture-document changes.

`apps/web/src/proxy.ts` remains read-only, canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed, clarity markers remain contractual, and Paddle remains the
V3 pilot billing provider.

## Source Inputs

| Evidence                                                     | Finding                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md`                              | The Operating-Business Readiness rule allows only legal/entity correctness, billing/revenue correctness, claim/recovery safety, tenant/privacy safety, auditability, public trust/pricing clarity, or commercial KPI evidence to promote a slice. |
| `docs/plans/current-tracker.md`                              | `OBR-COMMIT` is active, while `T-113`, `T-204`, `T-208/T-208b`, and `T-209` are not currently promotable because their prerequisites are blocked.                                                                                                 |
| `docs/plans/architecture-finalization-tracker-2026-05-29.md` | `T-113` depends on `T-108`; `T-204`, `T-208/T-208b`, and `T-209` depend on M2 structural work, including `T-201`.                                                                                                                                 |
| `T-104h` closeout proof                                      | GDPR erasure render proof is complete, so the remaining OBR question is not more event-PII work; it is whether to reauthorize a blocked architecture dependency or record operating blockers.                                                     |

## Decision

Do not reauthorize a runtime architecture slice from OBR-DG01.

Keep `OBR-COMMIT` as the active governed work item and require dated owner records or
explicit blockers for the operating commitments before any paid-acquisition or
first-accepted-recovery push is treated as ready. The design gate records the current blocker
state and closes the undefined "explicit design-gate re-authorization decision" gap left by
the `T-104h` closeout.

## Operating Commitment Blocker Record

| Commitment                                                      | Owner                   | 2026-06-12 status                                                                                      |
| --------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Counsel engagement on KS/DE/CH success-fee boundaries           | commercial + legal      | Blocked until counsel owner, engagement date, and written question set are recorded outside repo docs. |
| MK seller obligations                                           | commercial + legal      | Blocked until local seller-obligation answer or named blocker is recorded.                             |
| Art. 27 EU representative question, if applicable               | commercial + legal      | Blocked until applicability decision is recorded with owner and date.                                  |
| Acquisition budget and owner                                    | commercial              | Blocked until budget cap, spend owner, and stop condition are recorded.                                |
| Paid spend live target date                                     | commercial              | Blocked until acquisition owner records a launch date or no-go date.                                   |
| Capacity drill before spend                                     | operations + platform   | Blocked until drill owner, scenario, and result are recorded.                                          |
| Fee-collection runbook dry-run before first accepted recovery   | commercial + operations | Blocked until dry-run evidence or named blocker is recorded.                                           |
| Staging restore drill executed or blocker recorded              | platform                | Blocked until restore-drill evidence or explicit blocker is recorded.                                  |
| Adverse counsel answer or Sev1 trust/tenant incident pause rule | commercial + platform   | Active policy: adverse counsel answer or Sev1 trust/tenant incident pauses paid acquisition same day.  |

## Candidate Ranking

| Rank | Candidate                                            | Decision    | Rationale                                                                                                                                                   |
| ---- | ---------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `OBR-COMMIT` operating blocker record                | Keep active | It is the only current action that directly improves operating readiness without bypassing architecture prerequisites.                                      |
| 2    | Reauthorize `T-108` ida-host work to unblock `T-113` | Reject now  | `T-108` is explicitly not promotable without reauthorization, and this gate has no new host/session evidence strong enough to reopen routing-adjacent work. |
| 3    | Promote `T-113` residence-country field              | Blocked     | `T-113` depends on non-promoted `T-108`, so implementing it now would violate the architecture tracker dependency chain.                                    |
| 4    | Promote `T-204` success-fee billing bridge           | Blocked     | `T-204` depends on M2 case/recovery split work and would touch billing/event semantics before the structural prerequisite exists.                           |
| 5    | Promote `T-208/T-208b` recovery-law routing          | Blocked     | `T-208` depends on `T-201`; promoting it now would skip M2 package-boundary work.                                                                           |
| 6    | Promote `T-209` cross-jurisdiction handoff           | Blocked     | `T-209` depends on `T-201` and later access-tenant/case-grant work, so it is not safe as the next slice.                                                    |

## Acceptance Criteria

- `OBR-DG01` records the OBR decision and the dated blocker state.
- `current-program.md` and `current-tracker.md` point to `OBR-DG01` instead of an undefined
  reauthorization action.
- No product runtime, schema, migration, RLS, route, proxy, auth, tenancy, billing, UI, AI,
  README, AGENTS, or broad architecture-document file changes are made.
- Tier 0 docs/tracker verification passes:
  `git diff --check`, `pnpm docs:verify`, `pnpm plan:status`, `pnpm plan:audit`, and
  `pnpm track:audit`.

## Rollback

Revert this document and the two canonical program/tracker references. Because the gate makes
no runtime or schema changes, rollback is documentation-only.
