---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-25
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 implementation-readiness record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it
> is not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# T-002b-a Readiness Design

## Classification

Classified as a Tier 0 readiness/design packet because it only answers the
`OBR-DG37` pre-runtime questions for `T-002b`.

This record does not authorize direct `T-002b` runtime implementation. A later
current-authority gate must promote exactly one runtime slice before any source,
test, schema, RLS, migration, proxy, routing, auth/session, tenancy runtime,
billing, product UI, dependency, README, AGENTS, or broad architecture work
starts.

## Authority Basis

| Source                      | Evidence                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch basis                | `origin/main` was revalidated as `eb6f2a2e82dcac41c3339e002be16a8fc0fa5b08`, the `OBR-DG37` merge/main SHA, before branch `codex/t002b-a-readiness-design` was created.                                                                                                        |
| `OBR-DG37`                  | PR `#1203` merged through `eb6f2a2e82dcac41c3339e002be16a8fc0fa5b08` and promoted exactly `T-002b-a`.                                                                                                                                                                          |
| Post-`OBR-DG37` main health | Main health at `eb6f2a2e` was green for CI `28140397188` including unit job `83336342853` and DB-backed `e2e-gate` job `83336342827`, Sonar Main Gate `28140397224`, Secret Scan/gitleaks `28140397165`, and CodeQL `28140396809`. CD/Vercel remains deployment-only evidence. |
| Resolver before this packet | `next-slice.mjs .` returned `ready`, `activeSlice.id=T-002b-a`, and source `docs/plans/current-tracker.md`.                                                                                                                                                                    |
| Runtime inventory           | `CLAIM_STATUSES` currently contains `draft`, `submitted`, `verification`, `evaluation`, `negotiation`, `court`, `resolved`, and `rejected`; no `submitted_to_airline` target exists.                                                                                           |
| Current evidence inventory  | The transition read context locks existing recovery agreement/no-fee evidence only. It does not expose durable assignment/POA, airline submission consent, valuation-delta proof, service consent, medical consent, or invalidity human-review proof.                          |

## Target Semantics Decision

`submitted_to_airline` must be a first-class, non-lossy recovery transition
target for future `T-002b` runtime proof.

Rejected alternatives:

| Alternative                                                 | Decision | Rationale                                                                                                                                                                                            |
| ----------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alias `submitted_to_airline` to existing `submitted`        | Rejected | Existing `submitted` is member-intake submission. Airline submission is a recovery/vendor action after intake and carries assignment, fee, and consent prerequisites that would be lost by aliasing. |
| Treat airline submission as only a document upload or event | Rejected | T-002b acceptance requires `canTransition` rejection before status/history/event side effects. A document or event alone cannot be the transition target being guarded.                              |
| Add broad VONESA/FLIGHT workflow now                        | Rejected | `OBR-DG37` authorizes readiness only. Product expansion remains parked while core M0-M5 is incomplete.                                                                                               |

Future runtime must represent airline submission as an explicit
`submitted_to_airline` transition target in the guarded transition vocabulary.
The storage shape must be selected by the later promoted implementation slice:
it may be an additive recovery lifecycle state if `claims.status` remains the
compatibility spine, or a narrowly expanded status target if the future gate
explicitly authorizes that protected enum/schema change. Either option must keep
`submitted_to_airline` distinct from member-submitted intake.

## Durable Evidence Envelope

Future runtime should reuse current durable evidence only where it already has
the right semantics and lockability:

| Requirement                    | Current durable source                                                                                                                   | Future gap                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted fee agreement         | `claim_escalation_agreements` for accepted/signed recovery agreements; `claim_recovery_no_fee_evidence` only for no-fee resolution paths | Airline submission must define whether no-fee evidence can ever satisfy the accepted-fee prerequisite. It must not treat AI extraction consent or generic document upload as fee acceptance. |
| Signed assignment or POA       | None identified                                                                                                                          | Needs an additive tenant-scoped proof row tied to `claim_id`, actor/member, signature/acceptance timestamp, terms/version, and optional document reference.                                  |
| Airline submission consent     | None identified                                                                                                                          | Needs an additive tenant-scoped consent/proof row distinct from AI document extraction consent and generic terms/privacy.                                                                    |
| Vehicle-damage valuation delta | None identified                                                                                                                          | Needs an additive tenant-scoped proof row recording reviewed valuation-delta summary/reference before `vehicle -> negotiation`.                                                              |
| Signed service consent         | None identified                                                                                                                          | Needs an additive tenant-scoped consent/proof row for the specific service/recovery action.                                                                                                  |
| Medical consent                | Only AI document extraction consent exists for one processing purpose                                                                    | Needs explicit medical/document processing and Article 9 consent proof where sensitive services require it.                                                                                  |
| Invalidity human-review proof  | Assistance rules require human review for invalidity, but no claim-transition proof row exists                                           | Needs an additive tenant-scoped professional/human-review proof row, with reviewer, timestamp, scope, and non-PII references.                                                                |

The smallest future persistence envelope should be a tenant-scoped,
claim-scoped transition evidence store or equivalent existing-domain tables with
the same properties:

- `tenant_id`, `access_tenant_id`, `claim_id`, `evidence_type`,
  `evidence_status`, `recorded_at`, `recorded_by_id`, and optional
  `source_document_id` or structured reference.
- Unique active proof per claim/evidence type unless the future design has a
  concrete supersession model.
- No raw medical narrative, claim narrative, or document body in transition
  events or guard context.
- RLS/tenant indexes and low-privilege tenant-scoped proof if a schema change is
  later promoted.

## Transition Read Context Order

Future runtime must load and lock all prerequisite evidence before any status,
history, lifecycle, or domain-event side effect.

Required order:

1. Enter one transaction through the central transition command only.
2. Lock current claim state by `tenant_id`, `claim_id`, and lifecycle/current
   state CAS condition.
3. Lock fee evidence using the existing agreement/no-fee lock order where fee
   proof is needed.
4. Lock additive transition evidence rows for assignment/POA, airline consent,
   valuation delta, service consent, medical consent, and invalidity human
   review as required by the target transition.
5. Build a complete guard context from durable evidence only.
6. Run `canTransition` and reject missing evidence before update/history/event
   side effects.
7. Persist the authorized transition using the branded proof path.
8. Write stage history and domain event after the guarded update, with event
   payloads referencing evidence IDs/counts only.
9. Roll back the full transaction on any missing evidence, conflict, or side
   effect failure.

## Future Writer And Test Surface

Future `T-002b` implementation must prove every existing writer path that
reaches the central transition command:

- package generic claim status command and `updateClaimStatusCore`;
- staff, admin, and agent status-update adapters;
- member draft cancellation and initialization-only paths, proving they do not
  bypass the invariant;
- any future airline-submission or service-action writer promoted by the next
  gate.

Minimum proof expected for the future runtime slice:

- negative tests reject `submitted_to_airline` without assignment/POA, accepted
  fee, and airline consent before mutation;
- negative tests reject vehicle-damage `negotiation` without valuation delta and
  service consent before mutation;
- negative tests reject sensitive/invalidity paths without medical consent and
  human-review proof before mutation;
- positive tests prove durable evidence authorizes only the intended transition;
- rollback tests prove status, lifecycle, history, and event remain atomic;
- cross-tenant tests prove evidence from another tenant or access tenant cannot
  satisfy a transition.

## Non-Goals

This readiness record does not change source code, tests, schema, RLS,
migrations, proxy, routing, auth/session, tenancy runtime, billing, product UI,
dependencies, README, AGENTS, or broad architecture docs. It does not start
direct `T-002b`, direct destructive `T-503`, M6/product expansion, broad
SVC/FLIGHT/VONESA rollout, CQRS/read-model work, UI/UX implementation,
Operational Brain runtime/live AI, Dependabot work, or release migration work.

## Exit State

`T-002b-a` is complete when this readiness packet and the repo-canonical
tracker/program closeout merge. Direct `T-002b` runtime implementation remains
blocked until a later current-authority/design gate promotes exactly one
concrete runtime envelope using this evidence.
