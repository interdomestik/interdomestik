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

# OBR-DG37: T-002b Readiness Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after `OBR-DG36` and selects one bounded implementation-readiness
slice before `T-002b` runtime work can resume.

Risk tier for this PR: Tier 0, because this branch changes only
`docs/plans/**` current-authority and tracker documentation.

Risk tier for the later `T-002b-a` readiness worker: Tier 0 by default if it
stays docs/design only; it must reclassify before any source, test, schema, RLS,
migration, proxy, routing, auth/session, tenancy runtime, billing, or product UI
change.

## Revalidated Authority Evidence

| Source                      | Evidence                                                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch basis                | `origin/main` was revalidated as `d53860bb54c14299f21117b7355e4172e0547faa`, the `OBR-DG36` merge/main SHA, before branch `codex/obr-dg37-t002b-readiness` was created.                                                                              |
| `OBR-DG35`                  | PR `#1201` merged through `d50de4ce7e8929a709c918790eba44e3172d65f7` and briefly promoted `T-002b`.                                                                                                                                                  |
| `OBR-DG36`                  | PR `#1202` merged through `d53860bb54c14299f21117b7355e4172e0547faa` after proving the `T-002b` pre-runtime authority gap.                                                                                                                           |
| Post-`OBR-DG36` main health | At `d53860bb`, main health was green for CI `28139490697` including DB-backed `e2e-gate` job `83333544092`, Sonar Main Gate `28139490672`, Secret Scan/gitleaks `28139490677`, and CodeQL `28139490479`. CD/Vercel remains deployment-only evidence. |
| Resolver before this gate   | `next-slice.mjs .` returned `blocked_requires_current_authority`, `activeSlice=null`, and reason `umbrella_without_concrete_promoted_slice`.                                                                                                         |
| Proof-source inventory      | `OBR-DG36` found no `submitted_to_airline` status target and no durable transition read-context envelope for assignment/POA, airline submission consent, valuation-delta proof, service consent, medical consent, or invalidity human-review proof.  |

## Candidate Comparison

| Candidate                                     | Decision             | Rationale                                                                                                                                                                                        |
| --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T-002b-a` readiness/design packet            | Promote exactly this | It is the smallest governed action that can define the missing target semantics, durable evidence envelope, and lock/read order before runtime invariants are implemented.                       |
| Direct `T-002b` runtime implementation        | Reject for now       | The repository still lacks the `submitted_to_airline` target and the durable evidence sources needed by the acceptance criteria. Implementing runtime guards now would require unsafe inference. |
| Direct destructive `T-503`                    | Reject for now       | It remains destructive M5 work and still requires separate release-cycle evidence and fresh approval.                                                                                            |
| M6/product expansion, VONESA/SVC/CQRS/UI work | Reject               | Core M0-M5 is not totally complete, and these workstreams remain unpromoted by current authority.                                                                                                |

## Decision

Promote exactly one governed implementation-readiness slice: `T-002b-a`.

The next active governed implementation goal is exactly one canonical tracker
slice: `T-002b-a`.

Direct `T-002b` runtime work remains blocked until `T-002b-a` completes and a
later current-authority gate promotes a concrete implementation envelope.

## Bounded T-002b-a Envelope

The later `T-002b-a` worker may produce only the readiness/design package needed
before runtime transition invariants can resume:

1. Decide whether airline submission requires a new canonical status,
   lifecycle state, or explicit non-lossy mapping to an existing state.
2. Identify the smallest durable tenant-scoped evidence envelope for signed
   assignment or POA, accepted fee, airline submission consent, valuation-delta
   proof, service consent, medical consent, and invalidity human-review proof.
3. Define the transition read-context load, lock, and validation order before
   status update, stage history, and domain-event side effects.
4. Name every writer/test surface that future `T-002b` runtime implementation
   must prove, including old-path regression expectations from the completed
   `T-002` sole-writer migration.
5. State rollback, data-repair, observability, audit, privacy, and human-review
   evidence expectations for the eventual runtime slice.
6. Stop before runtime source edits, tests that imply runtime behavior, schema,
   RLS, migrations, billing, product UI, proxy, routing, auth/session, tenancy
   runtime, or broad SVC/FLIGHT/VONESA rollout.

## Future Evidence Expectations

| Evidence area             | Required proof for `T-002b-a`                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target semantics          | A checked-in design record states the accepted `submitted_to_airline` semantics and why rejected alternatives are unsafe or out of scope.                                 |
| Durable evidence envelope | The record names authoritative persisted representations or explicitly states the new minimal stores that a future runtime slice must add.                                |
| Transaction order         | The record defines read/lock/validate/write ordering before status, history, and event side effects.                                                                      |
| Scope containment         | The diff contains no runtime source, tests, schema/RLS/migration, proxy/routing/auth/session/tenancy runtime, billing, product UI, dependency, README, or AGENTS changes. |
| Follow-on promotion       | Direct `T-002b` implementation is not started until a later gate promotes it with the completed `T-002b-a` evidence.                                                      |

## Explicit Non-Goals

- No runtime transition code in this gate.
- No tests, dependencies, lockfiles, README, AGENTS, schema/RLS/migrations,
  proxy, routing, auth/session, tenancy runtime, billing, product UI, or worker
  startup in this gate.
- No direct `T-002b` implementation until `T-002b-a` closes and a later gate
  promotes runtime work.
- No direct destructive `T-503`.
- No M6/product expansion, VONESA/SVC/CQRS/UI/UX implementation, Operational
  Brain runtime/live AI, Dependabot work, or broad architecture rewrite.

## Expected Tier 0 Proof

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs .`

## Exit State

After this gate merges, current authority should resolve exactly one active
implementation-readiness slice: `T-002b-a`. Full `T-002b` remains parked until
`T-002b-a` closes and fresh current authority promotes a concrete runtime
implementation envelope.
