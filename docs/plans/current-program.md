---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-06
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This is the only document allowed to define the current phase, committed priorities, and sequencing for repository execution.

## Current Phase

`v0.1.0` production rebaseline is active.

The current program is focused on release convergence: close unsafe alternate paths, converge member write paths, repair member data, enforce thin guardrails, and apply a narrow Next.js production-hardening slice.

The March 3-5 advisory-governance tranche remains valuable background context, but it is no longer the active sequencing mechanism for repository execution.

## Program Goals

1. Remove unsafe or non-canonical write paths that can create inconsistent users, roles, or member numbers.
2. Converge the highest-risk backend mutations on shared canonical implementations and verifiable guardrails.
3. Apply the smallest frontend/App Router hardening slice that improves production behavior without broad refactors.
4. Keep an enterprise runway plan in view without letting it block `v0.1.0`.

## Status Command

```bash
pnpm plan:status
```

## Proof Command

```bash
pnpm plan:proof
```

## Committed Priorities

1. `V01` Close the unsafe alternate registration path.
   Exit criteria: `/api/simple-register` is deleted or hard-restricted; caller-controlled role creation is removed; the non-canonical public write path is not reachable.
2. `V02` Canonicalize member write-path generation and orchestration.
   Exit criteria: active registration and conversion flows use the shared member-number generator and no local duplicate generator remains in the write path.
3. `V03` Repair and instrument member-number integrity.
   Exit criteria: malformed existing member numbers are audited and remediated; self-heal activity is observable; fallback removal is not attempted without evidence.
4. `V04` Enforce backend guardrails where they buy leverage immediately.
   Exit criteria: local retry copies are removed, the current strict entrypoint violation is fixed, and strict entrypoint boundary checking is added to verification.
5. `V05` Apply a narrow Next.js production-hardening slice.
   Exit criteria: broad dynamic rendering and root hydration are reduced where safe, and high-value navigation/font hygiene issues are resolved or explicitly documented.

## Do Not Expand Until The Convergence Slice Lands

- broad domain extraction campaigns
- routing, auth, or tenancy architecture refactors
- repo-wide RLS rollout
- enterprise hardening items that do not reduce the `v0.1.0` failure surface

## Inputs, Not Active Plans

These documents can recommend or constrain work, but they do not define the live program:

- `docs/plans/2026-03-06-v0-1-0-production-background-plan.md`
- `docs/MATURITY_ASSESSMENT_2026.md`
- `docs/EXECUTIVE_MATURITY_ASSESSMENT.md`
- `docs/plans/2026-02-22-v1-bulletproof-tracker.md`
- `docs/plans/2026-03-03-program-charter-canonical.md`
- `docs/plans/2026-03-03-advisory-foundation-addendum.md`
- `docs/plans/2026-03-05-pg3-advisory-evidence-refresh.md`

## Historical Foundation, Not Current Sequencing

- `PG1`, `PG2`, and `PG3` remain accepted foundation work.
- `PG4` and `PG5` are no longer the active gating mechanism for `v0.1.0`.
- Advisory memory and boundary artifacts remain inspectable input until they are explicitly copied back into the current program and tracker.

Historical evidence-custody findings remain recorded in `docs/plans/2026-03-05-a22-evidence-reconciliation.md`.

## Review Rule

Any new roadmap, assessment, or strategy memo must end in one of two states:

- copied into `current-program.md` and `current-tracker.md`
- left as non-committed input

There is no third state.

## Proof Chain

Committed work is only considered inspectable when the tracker can answer this chain:

1. source refs
2. execution mode and run identity
3. `sonar` / `docker` / `sentry` status
4. learning status and evidence refs
