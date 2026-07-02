---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-02
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# OBR-DG40: T-503 Controlled Continuation Authority

## Classification

This gate is Tier 0 governance/evidence work. It records release-cycle
continuation authority for T-503 without runtime, source, test, schema, RLS,
proxy, routing, auth, tenancy, billing, dependency, README, AGENTS, or broad
architecture changes.

## Inputs

- `OBR-DG39` selected `T-503` as the final remaining M0-M5 status-bearing row.
- `docs/plans/2026-06-25-t503-preflight-blocker.md` blocked direct destructive
  implementation until qualifying release-cycle or explicitly approved equivalent
  evidence exists.
- `docs/release-gates/2026-07-02_t503_continuity_controlled_exceptions.md`
  records `CONTINUE_WITH_CONTROLLED_EXCEPTIONS`.
- `docs/pilot/PILOT_EVIDENCE_INDEX_t503-continuity-2026-07-02.md` records Day 1
  controlled-continuation evidence with `amber`, zero incidents, and `continue`.
- `docs/pilot-evidence/index.csv` records the `t503-continuity-2026-07-02`
  pilot evidence row.
- Local custody package
  `docs/pilot/T503_working_evidence_package_2026-07-02.zip` has SHA-256
  `30bdb6022edb13a1ddbfd46dd6a69f0e12cdce3930e4b6fd579623ee24b99ef5`.
- Production/preview/pre-production `DATABASE_URL_RLS` posture was corrected to
  use the `interdomestik_runtime_rls` runtime role through the Supabase pooler
  username form. The live psql proof returned `current_user =
interdomestik_runtime_rls` and `select id from public."user" limit 1` returned
  no rows for the runtime role.
- Supervisor/release-owner approval was supplied by Gazmendi on 2026-07-02:
  `CONTINUE_WITH_CONTROLLED_EXCEPTIONS`, not final production closure.
- Local `pnpm pilot:check` passed after the RLS posture fix, including
  `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`.

## Decision

T-503 may continue only as controlled release-cycle validation and evidence
custody under `CONTINUE_WITH_CONTROLLED_EXCEPTIONS`.

This gate does not authorize destructive `claims.status` removal, final paid
state, final recovery authorization, final finance closeout, individual
claimant representation, or final case closure. Direct destructive `T-503`
implementation remains blocked until a later current-authority gate records
qualifying final production release-cycle or explicitly approved equivalent
evidence, including disposition of the remaining finance/legal/closure controls.

Known controlled exceptions remain:

- G04 bank mapping before any final `PAID` state.
- G05 600 MKD reconciliation before finance closure.
- G09 claimant-specific POA/consent/service-fee authority before individual
  legal or insurer representation where required.
- G10 final settlement, payment/recovery/no-recovery outcome, final
  reconciliation, and case closure before final `CLOSED`.

G06 Terms/Privacy approval and G07 access-matrix approval are ratification-ready
inputs for controlled continuation, but must be kept explicit before using this
evidence as final production release-cycle proof.

## Current Authority Outcome

No replacement runtime slice is promoted by this gate. Resolver state is
expected to remain `blocked_requires_current_authority` with `activeSlice=null`
until a fresh current-authority/design-gate record selects exactly one concrete
canonical implementation slice.
