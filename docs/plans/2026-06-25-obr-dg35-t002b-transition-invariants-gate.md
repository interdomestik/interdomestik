---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-25
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# OBR-DG35 Post-T110 Next Slice Selection Gate

## Decision

Promote exactly one next governed slice: `T-002b`.

Direct work remains blocked until this gate merges and `next-slice.mjs` resolves
exactly `T-002b`.

## Evidence

- `T-110` implementation PR `#1199` merged at
  `9bea383d202330a9c81e26a7c89c21feb8ad9909` from final implementation head
  `6bfb28fce91a34ac47b75cf77f446b706bcfee8f`.
- `T-110` closeout/current-authority PR `#1200` merged at
  `2e0fe1b036b38df99729ef73327183aeffb430c6` from final head
  `14e97cd7e3beaf9b0024333f300445cacee64a7f`.
- Post-closeout main health at `2e0fe1b` is green for CI run
  `28137465854`, including unit job `83327351883` and DB-backed `e2e-gate`
  job `83327351880` with containers, E2E DB prep, RLS integration, and E2E
  Gate Suite success; Sonar Main Gate `28137465926`; Secret Scan/gitleaks
  `28137465884`; and CodeQL `28137465577`. CD/Vercel is deployment-only
  evidence and is not readiness proof.
- Pre-gate resolver proof on clean `origin/main` at `2e0fe1b`:
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`.
- Canonical remaining status-bearing M0-M5 rows are `T-002b` and direct
  destructive `T-503`.

## Candidate Comparison

| Candidate                  | Disposition | Rationale                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T-002b`                   | Selected    | Valid remaining core M0/M2 transition-invariant work. Its direct prerequisite `T-001` is complete, the central transition command spine is already established by `T-002`/`T-002c`/`T-002d`, and it reduces state-machine/legal-consent debt before any destructive status-column work. Scope must stay limited to transition invariants and proof, not broader SVC/FLIGHT/VONESA rollout. |
| Direct destructive `T-503` | Parked      | Direct legacy `claims.status` removal remains destructive and still requires qualifying release-cycle proof, rollback/data-repair evidence, and fresh explicit destructive approval.                                                                                                                                                                                                       |
| M6/product expansion       | Parked      | Out of scope while core M0-M5 remains incomplete unless separately authorized and current-authority selects exactly one governed slice.                                                                                                                                                                                                                                                    |

## Promoted Scope

`T-002b` is limited to extending the central claim transition authority with the
service/flight invariants already named by the canonical tracker:

- reject `->submitted_to_airline` without signed assignment or POA evidence,
  accepted fee agreement, and required consent;
- reject vehicle-damage `->negotiation` without valuation-delta evidence and
  signed service consent;
- require medical consent for sensitive services, with human-review evidence
  for invalidity where the existing domain model supports it;
- prove the invariant on every existing status writer path that reaches the
  central transition command;
- keep the invariant data model minimal and use existing durable evidence
  surfaces where available before adding any new persistence.

## Forbidden Scope

This gate does not authorize direct destructive `T-503`, dropping or renaming
`claims.status`, broad service-catalog work, VONESA/FLIGHT product expansion,
SVC rollout, CQRS/read-model work, UI/UX redesign, proxy edits, canonical route
changes, auth/session or tenancy runtime refactors, schema/RLS/migrations beyond
the smallest justified `T-002b` evidence envelope, billing/product UI, README,
AGENTS, M6/product expansion, Dependabot work, Operational Brain runtime/live AI,
or broad architecture rewrites.

## Required Future Evidence

The future `T-002b` worker must provide:

- active-slice proof resolving exactly `T-002b`;
- focused design evidence that identifies the durable proof source for each
  signed assignment/POA, fee, consent, valuation-delta, medical-consent, and
  human-review requirement before runtime implementation starts;
- focused tests on every central transition writer path that can reach the
  protected transitions;
- negative tests proving missing evidence rejects before update/history/event
  side effects;
- regression proof preserving completed `T-001`, `T-002`, `T-002c`, `T-002d`,
  `T-103`, `T-201`, `T-202`, `T-203`, and `T-203b` transition semantics;
- standard protected-surface proof proportional to central transition-engine
  risk, including plan/tracker validators, `pnpm security:guard`, local or
  current-head CI unit/e2e-gate evidence, and reviewer/security disposition;
- explicit non-goals for direct destructive `T-503`, broad SVC/FLIGHT/VONESA
  product rollout, proxy/routing/auth/session/tenancy refactors,
  schema/RLS/migrations outside the promoted envelope, billing/product UI,
  README, AGENTS, M6, and product expansion.
