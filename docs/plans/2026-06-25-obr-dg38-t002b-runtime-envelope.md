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

# OBR-DG38: T-002b Runtime Envelope Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after `T-002b-a` and promotes one bounded future runtime slice.

Risk tier for this PR: Tier 0, because this branch changes only
`docs/plans/**` current-authority and tracker documentation.

Risk tier for the later `T-002b` implementation worker: Tier 3 by default,
because the promoted runtime envelope touches central transition authority,
state/lifecycle semantics, durable evidence, tenant-scoped proof, history/event
side effects, and possible additive schema/RLS work.

## Revalidated Authority Evidence

| Source                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch basis                | `origin/main` was revalidated as `a348e0dad719f9ea572e85616be6b88098ac6318`, the `T-002b-a` merge/main SHA, before branch `codex/obr-dg38-t002b-runtime-envelope` was created.                                                                                                                                                                                                                                                                                                                |
| `T-002b-a`                  | PR `#1204` merged through `a348e0dad719f9ea572e85616be6b88098ac6318`, completing the readiness packet in `docs/plans/2026-06-25-t002b-a-readiness-design.md`.                                                                                                                                                                                                                                                                                                                                 |
| Post-`T-002b-a` main health | At `a348e0da`, main health was green for CI `28141301565` including unit job `83339067553` and DB-backed `e2e-gate` job `83339067550` with containers, E2E DB prep, RLS Integration Test, and E2E Gate Suite success; Sonar Main Gate `28141301568`; Secret Scan/gitleaks `28141301577`; and CodeQL `28141301219`. CD/Vercel remains deployment-only evidence.                                                                                                                                |
| Resolver before this gate   | `next-slice.mjs .` returned `blocked_requires_current_authority`, `activeSlice=null`, and reason `umbrella_without_concrete_promoted_slice`.                                                                                                                                                                                                                                                                                                                                                  |
| Readiness packet            | `T-002b-a` decided `submitted_to_airline` must be a first-class, non-lossy recovery transition target; accepted fee proof can reuse current recovery agreement evidence where applicable; assignment/POA, airline submission consent, valuation-delta proof, service consent, medical consent, and invalidity human-review proof need additive durable tenant-scoped evidence; and future runtime must load/lock/validate all prerequisite evidence before status/history/event side effects. |

## Candidate Comparison

| Candidate                                     | Decision             | Rationale                                                                                                                                                                                                                                  |
| --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Direct `T-002b` runtime envelope              | Promote exactly this | It is the only non-destructive remaining core M0-M5 row, its `T-001` prerequisite and central transition-command spine are complete, and `T-002b-a` supplies the target/evidence/read-order authority needed before implementation starts. |
| Direct destructive `T-503`                    | Reject for now       | It remains destructive legacy-status removal work and still requires release-cycle evidence, rollback/data-repair proof, and fresh explicit destructive approval.                                                                          |
| M6/product expansion, VONESA/SVC/CQRS/UI work | Reject               | Core M0-M5 is not totally complete, and these workstreams remain unpromoted by current authority. The `T-002b` slice may reference service/flight invariants only to guard central transitions, not to launch broad product workflows.     |
| Dependabot or general security backlog        | Reject               | These are out of scope unless they become required branch-protection blockers or receive a separate current-authority gate.                                                                                                                |

## Decision

Promote exactly one governed implementation slice: `T-002b`.

The next active governed implementation goal is exactly one canonical tracker
slice: `T-002b`.

Direct implementation must wait until this gate merges and the current-authority
resolver promotes exactly `T-002b`.

## Bounded T-002b Runtime Envelope

The future `T-002b` worker is limited to implementing central claim-transition
service/flight invariants from the completed readiness evidence:

1. Represent `submitted_to_airline` as a first-class, non-lossy recovery
   transition target, distinct from member-intake `submitted`.
2. Reject `submitted_to_airline` without signed assignment or POA evidence,
   accepted fee evidence, and airline submission consent before status,
   lifecycle, history, or domain-event side effects.
3. Reject vehicle-damage `negotiation` without valuation-delta proof and signed
   service consent before side effects.
4. Reject sensitive or invalidity-related transitions without medical consent
   and required human-review proof where supported by the existing domain model.
5. Load and lock prerequisite claim state, fee evidence, and additive
   tenant-scoped transition evidence in one transaction before `canTransition`.
6. Persist authorized transitions, history, and domain events atomically, with
   event payloads referencing evidence IDs/counts only and no raw medical,
   document, or claim narrative.
7. Prove every existing writer path that reaches the central transition command,
   including package generic status command, `updateClaimStatusCore`, staff,
   admin, and agent adapters, and member initialization/cancellation paths that
   must not bypass the invariant.

The worker may add only the smallest durable tenant-scoped evidence envelope
required to prove the promoted invariants. Any additive schema/RLS/migration work
must stay inside that envelope and include low-privilege tenant/RLS proof.

## Required Future Evidence

| Evidence area           | Required proof for `T-002b`                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active authority        | Resolver on clean merged main resolves exactly `T-002b`; no direct `T-503` or product-expansion scope is active.                                                                                                            |
| Target semantics        | `submitted_to_airline` remains distinct from member-intake `submitted` in transition guards and persistence/read compatibility.                                                                                             |
| Durable evidence        | Assignment/POA, airline consent, valuation delta, service consent, medical consent, and invalidity human-review proof are tenant-scoped, claim-scoped, lockable, and auditable.                                             |
| Atomicity               | Missing or cross-tenant evidence rejects before status, lifecycle, history, and event side effects; rollback leaves all surfaces unchanged.                                                                                 |
| Writer coverage         | Existing status writers cannot bypass the invariant; member initialization/cancellation paths stay valid and constrained.                                                                                                   |
| Tenant/privacy/security | Evidence from another tenant/access tenant cannot authorize a transition; events and logs carry references/counts, not raw sensitive content.                                                                               |
| Gates/review            | Tier 3 implementation proof includes focused tests, DB/RLS proof if schema changes, `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`, CI unit/e2e-gate, Sonar, gitleaks, CodeQL, and reviewer/security disposition. |

## Explicit Non-Goals

- No runtime transition code in this gate.
- No tests, dependencies, lockfiles, README, AGENTS, schema/RLS/migrations,
  proxy, routing, auth/session, tenancy runtime, billing, product UI, or worker
  startup in this gate.
- No direct destructive `T-503`, no dropping or renaming legacy `claims.status`,
  and no destructive release migration.
- No broad VONESA/FLIGHT/SVC rollout, M6/product expansion, CQRS/read-model work,
  UI/UX implementation, Operational Brain runtime/live AI, Dependabot work, or
  broad architecture rewrite.

## Expected Tier 0 Proof

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs .`

## Exit State

After this gate merges, current authority should resolve exactly one active
implementation slice: `T-002b`. Direct destructive `T-503` remains parked until
release/destructive-migration proof and fresh explicit approval exist.
