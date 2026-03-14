---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-14
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

`P2` Billing And Terms Hardening is now complete as the post-`P1T` tranche. `B01` is complete as the Stripe residue cleanup and billing-surface contract reconciliation slice, `B02` through `B06` are complete as the in-place Paddle safety and billing auditability queue, and `B07` through `B10` are complete as the commercial terms enforcement queue.

`P3` Commercial Actions And Contract Enforcement is now complete as the post-`P2` tranche. `M01` is complete as the commercial mutation-path audit slice, `M02` is complete as the typed Server Action migration slice for the top commercial mutations, `M03` is complete as the commercial idempotency slice for those canonical mutations, `M04` is complete as the matter-consumption guard slice for canonical staff-led recovery, `M05` is complete as the audit-safe escalation decision slice, and `M06` is complete as the superseded commercial write-path retirement slice. Free Start completion now routes through a typed server action, escalation request metadata now comes from `submitClaimCore`, agreement acceptance plus cancellation remain on canonical typed server actions, duplicate Free Start, escalation, and billing submissions now reuse explicit idempotency keys instead of double-creating work or double-applying commercial state, staff transitions into `negotiation` or `court` now consume annual matter allowance once per claim, block exhausted allowance by default, and accept a staff-only explicit override reason when recovery must begin without available allowance, escalation acceptance plus decline now persist actor, decision time, reason, and resulting next state on the canonical staff action path, and migrated Free Start, claim submission, staff commercial action, and membership cancellation callers now import the `.core.ts` server actions directly with no compatibility-only commercial shim left on the active path. Roster import remains a client-only placeholder.

`P4` Staff Operations And Acceptance Control remains active as the post-`P3` tranche. `S01` is now complete as the canonical staff claim queue and filter work slice, `S02` is now complete as the canonical manual claim assignment slice, `S03` is now complete as the canonical claim stage history and member-visible tracker slice, `S04` is now complete as the canonical SLA-state visibility slice, `S05` is now complete as the canonical internal-notes isolation slice, `S07` is now complete as the canonical matter-ledger and allowance-visibility slice, intentionally promoted ahead of `S06`, `S06` is now complete as the next promoted `P4` slice after `S07`, and `S08` is now complete as the explicit recovery-decision gate slice after `S06`. The live tracker now preserves the actionable staff queue surface, public claim-history continuity, explicit incomplete-vs-running SLA visibility, internal-note isolation, annual matter-allowance visibility, secure member-staff messaging, and the explicit accepted-or-declined recovery gate on the canonical claim-detail surfaces before agreement prerequisites, guidance-only enforcement, or load-based auto-assignment are promoted.

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
15. Preserve the broader GPT-5.4 runway as input without widening committed `v0.1.0` scope beyond the completed `AI01` through `AI06` tranche, the completed `P-1` tranche, the completed `P1C` tranche, the completed `P1T` tranche, the completed `P2` tranche, the completed `P3` tranche through `M06`, and the newly committed `P4` tranche through `S05`, `S07`, `S06`, and `S08`.
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
35. Keep `P3` complete as the canonical Commercial Actions And Contract Enforcement tranche without reopening routing, auth, tenancy, or request-path AI decisions.
36. Keep `M01` complete as the canonical commercial mutation-path audit slice so Free Start submission, escalation request, agreement acceptance, matter consumption, cancellation, and roster import stay classified before typed Server Action migration, idempotency rollout, or route retirement work begins.
37. Keep `M02` complete as the canonical typed Server Action migration slice so Free Start, escalation request, escalation acceptance, and cancellation converge on `_core.ts` validation paths before broader idempotency or route-retirement work begins.
38. Keep `M03` complete as the canonical commercial idempotency slice so duplicate Free Start, escalation, and billing submissions on the typed commercial action paths do not double-create work or double-apply commercial state before matter guards or route retirement begin.
39. Keep `M04` complete as the canonical matter-consumption guard slice so staff-led recovery on the canonical typed action path consumes and enforces allowance, blocks exhausted allowance by default, and records an explicit staff override reason before recovery can begin without available allowance.
40. Keep `M05` complete as the canonical escalation decision audit slice so each acceptance or decline on the canonical staff action path records actor, decision time, reason, and resulting next state before route retirement work begins.
41. Keep `M06` complete as the canonical superseded commercial write-path retirement slice so migrated Free Start, claim submission, staff commercial action, and membership cancellation callers stay converged on the `.core.ts`-backed server actions and no compatibility-only commercial write shim reappears on the active path as `P4` begins.
42. Land `P4` as the canonical Staff Operations And Acceptance Control tranche without reopening routing, auth, tenancy, or request-path AI decisions.
43. Keep `S01` complete as the canonical staff claim queue and filter work slice so the existing actionable staff queue surface remains preserved before SLA-state expansion, matter-ledger visibility, acceptance-control enforcement, or guidance-only handling rules widen the live staff operations scope.
44. Keep `S02` complete as the canonical manual claim assignment slice so staff can assign claims manually within the existing tenant and branch guardrails while load-based auto-assignment remains deferred before SLA-state expansion, matter-ledger visibility, acceptance-control enforcement, or guidance-only handling rules widen the live staff operations scope.
45. Land `S03` as the canonical claim stage history and member-visible tracker slice so submitted claims and staff-published status changes keep a durable public lifecycle history on the canonical member claim detail surface before later SLA-state, matter-ledger, acceptance-control, payment-prerequisite, or guidance-only slices widen the live `P4` scope.
46. Land `S04` as the canonical SLA-state visibility slice so staff and member claim surfaces distinguish waiting-for-member-information from actively running SLA time before matter-ledger, acceptance-control, payment-prerequisite, or guidance-only slices widen the live `P4` scope.
47. Land `S07` as the canonical matter-ledger and allowance-visibility slice so staff and member claim detail surfaces show annual matter usage and remaining allowance from the shared `M04` allowance semantics before `S06` messaging refinements, acceptance-control, payment-prerequisite, or guidance-only slices widen the live `P4` scope.
48. Land `S06` as the canonical secure member-staff messaging slice, promoted after `S07`, so the routed member and staff claim-detail surfaces both expose tenant-scoped public claim messaging while staff-only internal notes remain isolated and read-receipt polish stays optional.
49. Land `S08` as the canonical recovery-decision gate slice so staff must explicitly accept or decline recovery matters before `negotiation` or `court` can begin, decline reasons are categorized, and member claim-detail surfaces receive only the safe decision state.

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

`P2` Billing And Terms Hardening is now complete as the post-`P1T` tranche.

`P3` Commercial Actions And Contract Enforcement is now complete as the post-`P2` tranche. `M01`, `M02`, `M03`, `M04`, `M05`, and `M06` are complete as the commercial mutation-path audit, typed Server Action migration, commercial idempotency, matter-consumption guard, audit-safe escalation decision, and superseded write-path retirement slices.

`P4` Staff Operations And Acceptance Control remains active as the post-`P3` tranche. `S01` is complete as the canonical staff claim queue and filter work slice, `S02` is complete as the canonical manual claim assignment slice, `S03` is now complete as the claim stage history and member-visible tracker slice, `S04` is now complete as the SLA-state visibility slice, `S05` is now complete as the internal-notes isolation slice, `S07` is now complete as the matter-ledger and allowance-visibility slice, intentionally promoted ahead of `S06`, `S06` is now complete as the next promoted slice after `S07`, and `S08` is now complete as the explicit recovery-decision gate slice after `S06`, keeping the actionable staff queue shipped with explicit staff-side assignment, public claim-history continuity, incomplete-vs-running SLA clarity, internal-note isolation, annual allowance visibility, canonical secure messaging, and a typed accept-or-decline recovery gate before later agreement-prerequisite and guidance-only enforcement slices are committed.

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
- `P3` has now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` and is now the committed post-`P2` tranche.
- `M01` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the first committed `P3` queue item.
- `M01` is now complete as of 2026-03-12. The audit confirms that agreement acceptance and cancellation already have canonical typed server actions, while Free Start submission and escalation request are still telemetry-led, matter consumption lacks a dedicated allowance mutation, and roster import remains a client-only placeholder.
- `M02` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P3` queue item after `M01`.
- `M02` is now complete as of 2026-03-12. Free Start completion now routes through a typed server action, claim submission now returns server-validated escalation-request metadata, and agreement acceptance plus cancellation remain on canonical `_core.ts` action paths.
- `M03` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P3` queue item after `M02`.
- `M03` is now complete as of 2026-03-13. Explicit idempotency keys now guard Free Start, claim escalation, agreement acceptance, and cancellation mutations on the canonical typed action paths, and deterministic reseed cleanup now accounts for persisted commercial idempotency records.
- `M04` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P3` queue item after `M03`.
- `M04` is now complete as of 2026-03-13. Canonical staff-led recovery transitions now consume annual matter allowance once per claim, block exhausted allowance by default, and record a staff-only explicit override reason when recovery begins without available allowance.
- `M05` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P3` queue item after `M04`.
- `M05` is now complete as of 2026-03-13. Escalation acceptance now persists decision actor, decision time, reason, and resulting next state in the durable agreement record, while decline decisions on the canonical staff action path now require a reason and record the same decision metadata in audit history.
- `M06` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P3` queue item after `M05`.
- `M06` is now complete as of 2026-03-14. Migrated Free Start, claim submission, staff commercial action, and membership cancellation callers now import the canonical `.core.ts` server actions directly, compatibility-only commercial wrapper modules were removed, and `apps/web/src/actions/claims.ts` no longer re-exports `submitClaim`.
- `P4` has now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` and is now the committed post-`P3` tranche.
- `S01` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the first committed `P4` queue item.
- `S01` is now complete as of 2026-03-14. The staff claims queue now keeps actionable-only scope while adding branch-aware assignment, status, and search filters with unit and browser proof on the canonical `/staff/claims` surface.
- `S02` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4` queue item after `S01`.
- `S02` is now complete as of 2026-03-14. Staff can now assign claims manually from the canonical `/staff/claims/[id]` detail surface within existing tenant and branch guardrails, while load-based auto-assignment remains deferred.
- `S03` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4` queue item after `S02`.
- `S03` is now complete as of 2026-03-14. Claim submission now persists the initial public `submitted` stage-history event, member claim detail keeps a public tracker even when legacy public history rows are absent, and staff-published claim status changes revalidate the canonical member tracker routes.
- `S04` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4` queue item after `S03`.
- `S04` is now complete as of 2026-03-14. Staff and member claim detail surfaces now distinguish SLA states that are waiting on missing member information from SLA states that are actively running on the canonical claim-detail paths.
- `S05` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as a security-coupled isolation slice ahead of the remaining `P4` queue.
- `S05` implementation landed on 2026-03-14. Non-staff claim-message reads now hard-filter internal notes, member claim-tracking timeline reads stay tenant-scoped and public-only, and a dedicated gate-path negative E2E spec now inserts a staff-only history note and proves that the canonical member claim detail never renders it. That deterministic browser proof now passes in both `gate-ks-sq` and `gate-mk-mk`.
- `S07` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4` queue item after `S05`, intentionally promoted ahead of `S06`.
- `S07` is now complete as of 2026-03-14. Canonical staff and member claim detail surfaces now show annual matter usage and remaining allowance from the shared `M04` allowance semantics, and the deterministic gate-path browser proof now passes in both `gate-ks-sq` and `gate-mk-mk`.
- `S06` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4` queue item after the intentional `S07`-before-`S06` exception.
- `S06` is now complete as of 2026-03-14. The routed member claim detail and routed staff claim detail now both expose the canonical messaging panel on tenant-scoped claim reads, staff can send public messages and internal notes from those live surfaces, members never receive internal-note controls, and read-receipt polish remains optional.
- `S08` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4` queue item after `S06`.
- `S08` is now complete as of 2026-03-14. Staff must explicitly accept or decline recovery matters before `negotiation` or `court` can begin, decline decisions now require a typed taxonomy on the canonical staff action path, the member claim detail shows only the safe decision summary, and the deterministic gate-path browser proof now confirms that staff keep the internal explanation while members see only the member-safe accepted state.

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
