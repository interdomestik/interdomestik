---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-09
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This is the only document allowed to define the current phase, committed priorities, and sequencing for repository execution.

## Current Phase

`v0.1.0` production rebaseline is active.

The release-convergence slice `V01` through `V05` is complete. The current program has now also completed six measured AI runway slices, `AI01` through `AI06`, without reopening routing, auth, tenancy, or request-path risk.

`P-1` Infrastructure Debt Closure is now the live post-AI tranche. `D01` is complete as the full PR `e2e:gate` CI slice, `D02` is complete as the cross-agent messaging isolation slice, `D03` is complete as the blocking repository coverage floor slice, `D04` is complete as the canonical blocking `gitleaks` coverage slice, `D05` is complete as the staging Supabase plus preview-environment separation slice, and `D06` through `D08` are the remaining committed items in the tranche.

The March 3-5 advisory-governance tranche remains valuable background context, but it is no longer the active sequencing mechanism for repository execution.

## Program Goals

1. Keep the completed `V01` through `V05` convergence work inspectable and stable.
2. Keep the completed AI runway boundary slice reversible and off the request path.
3. Keep `AI02` complete as the canonical provenance persistence layer for durable AI runs.
4. Keep `AI03` complete as the canonical queued policy extraction and background execution slice.
5. Keep `AI04` complete as the canonical run-status and human-review surface on top of the existing provenance and workflow layers, with no routing, auth, or tenancy refactors.
6. Keep `AI05` complete as the narrow claim-and-legal workflow slice on top of the existing provenance, background execution, and review surfaces, without reopening routing, auth, or tenancy boundaries.
7. Keep `AI06` complete as the canonical fixture-eval, telemetry, and PR CI signaling slice on top of the existing typed AI boundary and workflow surfaces.
8. Keep `D01` complete as the canonical PR full-`e2e:gate` CI lane for product changes.
9. Keep `D02` complete as the deterministic cross-agent messaging isolation coverage slice without bypassing canonical routes or tenant boundaries.
10. Keep `D03` complete as the canonical blocking 60% repository coverage floor in CI.
11. Keep `D04` complete as the canonical blocking `gitleaks` scan across the live PR, push, and scheduled security surfaces.
12. Keep `D05` complete as the canonical staging Supabase plus preview-environment separation slice without changing production auth, routing, or tenancy architecture.
13. Land `D06` incident playbook and `D07` Sentry burn-rate alert wiring as operator-readiness slices.
14. Land `D08` as a narrow RLS rollout on four critical tables without reopening a broad repo-wide RLS campaign.
15. Preserve the broader GPT-5.4 runway as input without widening committed `v0.1.0` scope beyond the completed `AI01` through `AI06` tranche and the active `P-1` tranche.

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

`P-1` Infrastructure Debt Closure is now the committed post-AI tranche.

`D01` is complete as the full PR `e2e:gate` CI slice.

`D02` is complete as the deterministic cross-agent messaging isolation coverage slice.

`D03` is complete as the blocking 60% repository coverage floor in the canonical CI and `pr:verify` surfaces.

`D04` is complete as the canonical blocking `gitleaks` scan in the dedicated `Secret Scan` workflow across pull requests and mainline security triggers.

`D05` is complete as the canonical staging Supabase plus preview-environment separation slice, with build-time deployment validation and split staging versus production CD inputs.

The remaining committed queue inside `P-1` is:

- `D06` incident playbook
- `D07` Sentry burn-rate alerts
- `D08` RLS on four critical tables

## Do Not Reopen The Convergence Boundary

- broad domain extraction campaigns
- routing, auth, or tenancy architecture refactors
- repo-wide RLS rollout
- synchronous request-path AI inference or autonomous customer-facing decisions
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

- `AI01` was copied into the live program and tracker from `docs/plans/2026-03-07-gpt-5-4-phase-1-implementation-plan.md` and is now complete.
- `AI02` was copied into the live program and tracker from `docs/plans/2026-03-07-gpt-5-4-phase-1-implementation-plan.md` and is now complete as the provenance slice.
- `AI03` was copied into the live program and tracker from `docs/plans/2026-03-07-gpt-5-4-phase-1-implementation-plan.md` and is now complete as the workflow slice.
- `AI04` has now been copied into the live program and tracker from `docs/plans/2026-03-07-gpt-5-4-phase-1-implementation-plan.md` and is complete as the status-and-review slice.
- `AI05` has now been copied into the live program and tracker from `docs/plans/2026-03-07-gpt-5-4-phase-1-implementation-plan.md` and is complete as the claim-and-legal workflow slice.
- `AI06` has now been copied into the live program and tracker from `docs/plans/2026-03-07-gpt-5-4-phase-1-implementation-plan.md` and is complete as the evals, telemetry, and CI wiring slice.
- `P-1` Infrastructure Debt Closure has now been copied into the live program and tracker from `docs/EXECUTIVE_MATURITY_ASSESSMENT.md` and `docs/MATURITY_ASSESSMENT_2026.md`.
- `D01` has now been copied into the live program and tracker from `docs/EXECUTIVE_MATURITY_ASSESSMENT.md` and `docs/MATURITY_ASSESSMENT_2026.md` and is complete as the full PR `e2e:gate` CI slice.
- `D02` has now been copied into the live program and tracker from `docs/EXECUTIVE_MATURITY_ASSESSMENT.md` and `docs/MATURITY_ASSESSMENT_2026.md` and is complete as the deterministic cross-agent messaging isolation slice.
- `D03` has now been copied into the live program and tracker from `docs/EXECUTIVE_MATURITY_ASSESSMENT.md` and `docs/MATURITY_ASSESSMENT_2026.md` and is complete as the blocking 60% repository coverage floor slice.
- `D04` has now been copied into the live program and tracker from `docs/EXECUTIVE_MATURITY_ASSESSMENT.md` and `docs/MATURITY_ASSESSMENT_2026.md` and is complete as the canonical blocking `gitleaks` coverage slice.
- `D05` has now been copied into the live program and tracker from `docs/EXECUTIVE_MATURITY_ASSESSMENT.md` and `docs/MATURITY_ASSESSMENT_2026.md` and is complete as the staging Supabase plus preview-environment separation slice.

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
