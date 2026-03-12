---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-12
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This is the only document allowed to define the current phase, committed priorities, and sequencing for repository execution.

## Current Phase

`v0.1.0` production rebaseline is active.

The release-convergence slice `V01` through `V05` is complete. The current program has now also completed six measured AI runway slices, `AI01` through `AI06`, without reopening routing, auth, tenancy, or request-path risk.

`P-1` Infrastructure Debt Closure is now complete as the post-AI tranche. `D01` is complete as the full PR `e2e:gate` CI slice, `D02` is complete as the cross-agent messaging isolation slice, `D03` is complete as the blocking repository coverage floor slice, `D04` is complete as the canonical blocking `gitleaks` coverage slice, `D05` is complete as the staging Supabase plus preview-environment separation slice, `D06` is complete as the canonical incident playbook slice, `D07` is complete as the Sentry burn-rate alert wiring slice, and `D08` is complete as the narrow critical-table RLS proof slice.

`P1C` Commercial Contract Foundations is now complete as the post-infrastructure commercial-contract tranche. `C05` is complete as the canonical claims-first scope-tree and referral-boundary slice, `C01` is complete as the canonical coverage-matrix publication slice, `C04` is complete as the canonical annual billing, cancellation, refund, and cooling-off publication slice, `C02` is complete as the canonical success-fee calculator and example-pricing slice, `C03` is complete as the canonical Free Start and hotline disclaimer slice, and `C06` is complete as the canonical commercial-funnel instrumentation slice. The committed commercial contract defined by the business-model blueprint is now fully published.

`P1T` Free Start And Trust UX is now complete as the live post-`P1C` tranche. `T01` is complete as the canonical hero, trust-strip, and footer-safety-net slice, `T02` is complete as the canonical Free Start claim-pack generator shell slice, `T03` is complete as the canonical confidence-score and recommended-next-step slice, `T04` is complete as the canonical evidence prompts, privacy badge, and SLA microcopy slice, `T05` is complete as the canonical `/services` alignment slice for the coverage matrix and referral boundaries, and `T06` is complete as the canonical i18n plus component-test coverage slice for the new trust surfaces.

`P2` Billing And Terms Hardening is now complete as the post-`P1T` tranche. `B01` is complete as the Stripe residue cleanup and billing-surface contract reconciliation slice, `B02` through `B06` are complete as the in-place Paddle safety and billing auditability queue, and `B07` through `B10` are complete as the commercial terms enforcement queue. No later blueprint tranche is committed yet; `P3` remains supporting input until a separate promotion decision is recorded.

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
13. Keep `D06` complete as the canonical incident-response playbook and keep `D07` complete as the Sentry burn-rate alert wiring slice.
14. Keep `D08` complete as the narrow RLS proof slice on four critical tables without reopening a broad repo-wide RLS campaign.
15. Preserve the broader GPT-5.4 runway as input without widening committed `v0.1.0` scope beyond the completed `AI01` through `AI06` tranche, the completed `P-1` tranche, the completed `P1C` tranche, the completed `P1T` tranche, and the committed `P2` queue.
16. Land `P1T` as the canonical Free Start and Trust UX tranche without reopening routing, auth, tenancy, or request-path AI decisions.
17. Keep `C01` complete as the canonical coverage-matrix publication slice across pricing, checkout, and member surfaces.
18. Keep `C02` as the canonical success-fee calculator and example-pricing slice.
19. Keep `C03` as the canonical Free Start and hotline disclaimer slice.
20. Keep `C04` as the canonical annual billing, cancellation, refund, and cooling-off publication slice.
21. Keep `C05` as the canonical claims-first scope-tree and referral-boundary slice.
22. Keep `C06` as the canonical commercial-funnel instrumentation slice.
23. Keep `T01` as the canonical hero, trust-strip, and footer-safety-net update slice.
24. Keep `T02` as the canonical Free Start claim-pack generator shell slice.
25. Keep `T03` as the canonical confidence-score and recommended-next-step slice.
26. Keep `T04` as the canonical evidence prompts, privacy badge, and SLA microcopy slice.
27. Keep `T05` as the canonical `/services` alignment slice for the coverage matrix and referral boundaries.
28. Keep `T06` complete as the canonical i18n and component-test coverage slice for the new trust surfaces.
29. Keep `P2` complete as the canonical Billing And Terms Hardening tranche without reopening routing, auth, tenancy, or request-path AI decisions.
30. Keep `B01` through `B06` complete as the canonical in-place billing hardening queue for Stripe reference removal, Paddle webhook safety, dunning enforcement, and billing auditability.
31. Keep `B07` complete as the canonical escalation agreement and signed commercial terms persistence slice so accepted staff-led recovery work cannot start without inspectable fee, cap, and payment-authorization state.
32. Keep `B08` complete as the canonical annual membership cancellation, refund, and cooling-off enforcement slice so live product behavior matches the published commercial contract.
33. Keep `B09` complete as the canonical success-fee collection fallback slice so accepted recovery matters have a clear deduction, charge, and invoice order.
34. Keep `B10` complete as the canonical commercial audit trail slice so recovery acceptance, cancellation, and collection actions stay inspectable.

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

`P-1` Infrastructure Debt Closure is now complete as the committed post-AI tranche.

`P1C` Commercial Contract Foundations is now complete as the committed post-infrastructure tranche. `C05`, `C01`, `C04`, `C02`, `C03`, and `C06` are complete.

`P1T` Free Start And Trust UX is now complete as the committed post-`P1C` tranche. `T01`, `T02`, `T03`, `T04`, `T05`, and `T06` are complete.

`P2` Billing And Terms Hardening is now complete as the post-`P1T` tranche. No post-`P2` tranche is committed yet. `P3` remains blueprint input until a separate promotion decision is recorded.

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
- `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md`
- `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md`

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
- `D06` has now been copied into the live program and tracker from `docs/EXECUTIVE_MATURITY_ASSESSMENT.md` and `docs/MATURITY_ASSESSMENT_2026.md` and is complete as the canonical incident-response playbook slice.
- `D07` has now been copied into the live program and tracker from `docs/EXECUTIVE_MATURITY_ASSESSMENT.md` and `docs/MATURITY_ASSESSMENT_2026.md` and is complete as the Sentry burn-rate alert wiring slice.
- `D08` has now been copied into the live program and tracker from `docs/EXECUTIVE_MATURITY_ASSESSMENT.md` and `docs/MATURITY_ASSESSMENT_2026.md` and is complete as the narrow critical-table RLS proof slice.
- `P1C` has now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` and is now the active post-infrastructure tranche.
- `C01` through `C06` have now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the committed commercial-contract publication queue.
- `C01` is complete as the coverage-matrix publication slice.
- `C03` is complete as the Free Start and hotline disclaimer slice.
- `C05` is complete as the claims-first scope-tree and referral-boundary slice.
- `C06` is complete as the commercial-funnel instrumentation slice.
- `P1T` has now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` and is now the active post-`P1C` tranche.
- `T01` through `T06` have now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the committed Free Start and Trust UX queue.
- `T01` is complete as the hero, trust-strip, and footer-safety-net slice.
- `T02` is complete as the Free Start claim-pack generator shell slice.
- `T03` is complete as the confidence-score and recommended-next-step slice.
- `T04` is complete as the evidence prompts, privacy badge, and SLA microcopy slice.
- `T05` is complete as the `/services` alignment slice for the coverage matrix and referral boundaries.
- `T06` is complete as the i18n and component-test coverage slice for the new trust surfaces.
- `P2` has now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` and is now the committed post-`P1T` tranche.
- `B01` through `B06` have now been restored into the live program and tracker as the existing in-place Phase 2 billing hardening queue that the March 9 blueprint diff explicitly preserved.
- `B07` through `B10` have now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the commercial terms enforcement extension of `P2`.
- `P2` is now complete as of 2026-03-12. `B01` is complete as the Stripe residue cleanup and billing-surface contract reconciliation slice, and `B02` through `B10` are complete as the verified billing hardening queue.

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
