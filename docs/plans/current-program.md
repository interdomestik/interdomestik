---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-07
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This is the only document allowed to define the current phase, committed priorities, and sequencing for repository execution.

## Current Phase

`v0.1.0` production rebaseline is active.

The release-convergence slice `V01` through `V05` is complete. The current program now holds those gains in place while opening one measured AI runway slice that does not reopen routing, auth, tenancy, or request-path risk.

The March 3-5 advisory-governance tranche remains valuable background context, but it is no longer the active sequencing mechanism for repository execution.

## Program Goals

1. Keep the completed `V01` through `V05` convergence work inspectable and stable.
2. Start the AI runway with one reversible, typed boundary slice that stays off the request path.
3. Keep routing, auth, tenancy, and customer-facing decision flows unchanged unless they are explicitly re-promoted.
4. Preserve the broader GPT-5.4 runway as input without letting it widen the active `v0.1.0` scope.

## Status Command

```bash
pnpm plan:status
```

## Proof Command

```bash
pnpm plan:proof
```

## Completed Convergence Priorities

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

## Next Committed Priority

1. `AI01` Create the typed `domain-ai` boundary and schema contracts.
   Exit criteria: `packages/domain-ai` exists with a client boundary, model-profile map, and typed extraction/summary schemas whose tests prove valid output is accepted and malformed output is rejected.

## Do Not Reopen The Convergence Boundary

- broad domain extraction campaigns
- routing, auth, or tenancy architecture refactors
- repo-wide RLS rollout
- request-path AI inference or autonomous customer-facing decisions
- enterprise hardening items that do not reduce the `v0.1.0` failure surface

## Inputs, Not Active Plans

These documents can recommend or constrain work, but they do not define the live program:

- `docs/plans/2026-03-07-gpt-5-4-phase-1-implementation-plan.md`
- `docs/plans/2026-03-06-v0-1-0-production-background-plan.md`
- `docs/MATURITY_ASSESSMENT_2026.md`
- `docs/EXECUTIVE_MATURITY_ASSESSMENT.md`
- `docs/plans/2026-02-22-v1-bulletproof-tracker.md`
- `docs/plans/2026-03-03-program-charter-canonical.md`
- `docs/plans/2026-03-03-advisory-foundation-addendum.md`
- `docs/plans/2026-03-05-pg3-advisory-evidence-refresh.md`

## Promotion Note

- `AI01` is copied into the live program and tracker from `docs/plans/2026-03-07-gpt-5-4-phase-1-implementation-plan.md`.
- `AI02` through `AI06` remain supporting input until they are separately copied into `current-program.md` and `current-tracker.md`.

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
