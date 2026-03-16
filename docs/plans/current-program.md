---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-16
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

`P3` Commercial Actions And Contract Enforcement is now complete as the post-`P2` tranche. `M01` is complete as the commercial mutation-path audit slice, `M02` is complete as the typed Server Action migration slice for the top commercial mutations, `M03` is complete as the commercial idempotency slice for those canonical mutations, `M04` is complete as the matter-consumption guard slice for canonical staff-led recovery, `M05` is complete as the audit-safe escalation decision slice, and `M06` is complete as the superseded commercial write-path retirement slice. Free Start completion now routes through a typed server action, escalation request metadata now comes from `submitClaimCore`, agreement acceptance plus cancellation remain on canonical typed server actions, duplicate Free Start, escalation, and billing submissions now reuse explicit idempotency keys instead of double-creating work or double-applying commercial state, staff transitions into `negotiation` or `court` now consume annual matter allowance once per claim, block exhausted allowance by default, and accept a staff-only explicit override reason when recovery must begin without available allowance, escalation acceptance plus decline now persist actor, decision time, reason, and resulting next state on the canonical staff action path, and migrated Free Start, claim submission, staff commercial action, and membership cancellation callers now import the `.core.ts` server actions directly with no compatibility-only commercial shim left on the active path. Roster import now routes through the canonical agent write path, and completed `P4G` work now also preserves the aggregate-only dashboard, sponsored-seat activation, and privacy-consent proof boundary on those same canonical surfaces.

`P4` Staff Operations And Acceptance Control remains active as the post-`P3` tranche. `S01` is now complete as the canonical staff claim queue and filter work slice, `S02` is now complete as the canonical manual claim assignment slice, `S03` is now complete as the canonical claim stage history and member-visible tracker slice, `S04` is now complete as the canonical SLA-state visibility slice, `S05` is now complete as the canonical internal-notes isolation slice, `S07` is now complete as the canonical matter-ledger and allowance-visibility slice, intentionally promoted ahead of `S06`, `S06` is now complete as the next promoted `P4` slice after `S07`, `S08` is now complete as the explicit recovery-decision gate slice after `S06`, `S09` is now complete as the accepted-case agreement and collection prerequisite slice after `S08`, and `S10` is now complete as the guidance-only and referral-only commercial-enforcement slice after `S09`. The live tracker now preserves the actionable staff queue surface, public claim-history continuity, explicit incomplete-vs-running SLA visibility, internal-note isolation, annual matter-allowance visibility, secure member-staff messaging, the explicit accepted-or-declined recovery gate, accepted-case agreement-plus-collection-path enforcement, and the launch-scope block that keeps guidance-only and referral-only matters out of staff-led recovery and success-fee handling on the canonical staff claim-detail surfaces before load-based auto-assignment is promoted. `GA01` is now complete as the canonical group roster import slice, `GA02` is now complete as the canonical aggregate-only group dashboard slice, `GA03` is now complete as the canonical sponsored-seat activation and self-upgrade slice, and `GA04` is now complete as the canonical privacy and consent negative-test slice.

`P6` v1.0.0 RC Gate is now complete as the next committed tranche after the completed `P4` and `P4G` queue. `G07` is now complete as the first explicit release-gate slice, `G08` is now complete as the Free Start and aggregate-only privacy-boundary proof slice, `G09` is now complete as the matter-count and SLA-state enforcement slice, and `G10` is now complete as the escalation-agreement and collection-fallback enforcement slice.

`P7` Pilot Readiness And Release Evidence is now complete after completed `P6`. `R01` is now complete as the canonical pilot-entry artifact-set slice, `R02` is now complete as the canonical readiness-command authority slice, `R03` is now complete as the deterministic daily evidence capture slice, `R04` is now complete as the continue-or-rollback proof slice, `R05` is now complete as the pilot-ready tag-discipline slice, `R06` is now complete as the canonical 3-day repo-backed readiness cadence slice, `R07` is now complete as the canonical observability-and-incident-evidence slice, and `R08` is now complete as the canonical ranked operator-flow slice required before live pilot operation is treated as governable across member and agent activity, branch-manager branch oversight, staff claim processing, and admin decision custody.

`P8` Pilot Reset Gate And Seven-Day Rehearsal is now active after completed `P7`. `P8R` reset-gate hardening is now complete through `RG01` through `RG05`, using the new pilot id `pilot-ks-7d-rehearsal-2026-03-16` to prove a fresh `pilot:check`, fresh memory top-hit retrievals, a fresh GO release gate, and a fresh copied pilot evidence index without reusing the failed 14-day pilot. `P8P` seven-day pilot rehearsal is now active with `SP01` complete as the new `PD01` release-and-artifact baseline and `SP02` complete as the green `PD02` rollback-and-resume baseline, so `SP03` closed-loop role flow is now the next committed rehearsal slice.

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
15. Preserve the broader GPT-5.4 runway as input without widening committed `v0.1.0` scope beyond the completed `AI01` through `AI06` tranche, the completed `P-1` tranche, the completed `P1C` tranche, the completed `P1T` tranche, the completed `P2` tranche, the completed `P3` tranche through `M06`, and the newly committed `P4` tranche through `S05`, `S07`, `S06`, `S08`, `S09`, and `S10`.
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
48. Keep `GA01` complete as the canonical group roster import slice so employers and associations can create sponsored member seats by roster or CSV on the active agent write path before broader `P4G` dashboard, activation, or privacy-consent surfaces are committed.
49. Land `S06` as the canonical secure member-staff messaging slice, promoted after `S07`, so the routed member and staff claim-detail surfaces both expose tenant-scoped public claim messaging while staff-only internal notes remain isolated and read-receipt polish stays optional.
50. Keep `S08` complete as the canonical recovery-decision gate slice so staff must explicitly accept or decline recovery matters before `negotiation` or `court` can begin, decline reasons remain categorized, and member claim-detail surfaces continue to receive only the safe decision state.
51. Land `S09` as the canonical accepted-case commercial prerequisite slice so accepted recovery matters cannot move into `negotiation` or `court` without the full agreement snapshot and a usable success-fee collection path on the canonical staff path.
52. Land `S10` as the canonical guidance-only commercial-enforcement slice so guidance-only and referral-only matters cannot move into staff-led recovery or success-fee handling, and staff claim-detail surfaces distinguish that launch-scope restriction from generic accepted-case validation.
53. Keep `GA02` complete as the canonical aggregate-only group dashboard slice so office-tier group operators can see activations, usage, open-case counts, and SLA-safe portfolio metrics without exposing claim facts, notes, or documents.
54. Keep `GA03` complete as the canonical sponsored-seat activation and self-upgrade slice so sponsored members can activate coverage and move from individual to family coverage without reopening portal or tenancy architecture.
55. Keep `GA04` complete as the canonical privacy and consent negative-test slice so group admins cannot see claim facts, notes, or documents without explicit member consent.
56. Keep `G07` complete as the first explicit `P6` release-gate slice so release-candidate builds keep proving the published commercial contract surfaces still expose the coverage matrix, fee calculator, disclaimers, and refund terms before broader staging-only validation is widened.
57. Keep `G08` complete as the explicit `P6` release-gate slice so Free Start still states informational-only status and group dashboards still expose only aggregate data before later staging-only enforcement checks are widened.
58. Keep `G09` complete as the explicit `P6` release-gate slice so members and staff still see correct matter counts and correct SLA states on canonical claim-detail surfaces before later accepted-case enforcement checks are widened.
59. Keep `G10` complete as the explicit `P6` release-gate slice so escalation-agreement acceptance, signature, and collection-fallback enforcement stay validated in release-candidate runs after matter-and-SLA proof is locked in.
60. Land `P7` as the canonical Pilot Readiness And Release Evidence tranche so the completed release-gate and pilot machinery becomes one governable pilot-entry operating system across member and agent activity, branch-manager branch oversight, staff claim processing, and admin decision custody rather than a split set of scripts, reports, and local-only evidence conventions.
61. Land `R01` as the canonical pilot-ready artifact-contract slice so every pilot-entry run creates a release report, a copied pilot evidence index, and a machine-readable evidence pointer row with stable references.
62. Land `R02` as the canonical readiness-command authority slice so `pilot:check`, `release:gate:prod`, and `scripts/pilot-verify.sh` have documented, non-overlapping roles before live pilot entry begins.
63. Keep `R03` complete as the canonical deterministic pilot-evidence slice so daily pilot operation records day/date, owner, status, report path, bundle path, incident count, severity, decision, and branch-manager-reviewed or branch-level context where relevant in one copied per-pilot evidence index instead of relying on memory or ad hoc notes.
64. Keep `R04` complete as the canonical continue-pause-hotfix-stop decision-proof slice so daily and weekly pilot decisions remain repo-backed artifacts that distinguish branch-level recommendation from admin-level decision when applicable and can reference rollback targets and re-validation requirements.
65. Keep `R05` complete as the canonical pilot-ready tag-discipline slice so rollback targets and resume rules point to a real `pilot-ready-YYYYMMDD` tag with fresh re-validation evidence before pilot operations resume.
66. Keep `R06` complete as the canonical readiness-cadence slice so a source-backed 3-day qualifying green cadence replaces any need for historical A22-style inference in live governance.
67. Keep `R07` complete as the canonical pilot observability-and-incident-evidence slice so log sweeps, KPI conditions, incident severity, branch-local versus system-wide classification, and decision artifacts stay linked in one copied evidence index before a live pilot is declared governable.
68. Keep `R08` complete as the canonical ranked pilot-entry operator-flow slice so the pilot-entry command path is inspectable and repeatable across pre-launch, gate proof, launch-day verification, branch-manager review or escalation, and admin-level daily logging before a live pilot is declared governable.
69. Land `P8` as the canonical post-`P7` pilot redesign tranche so the repo preserves completed 14-day pilot-readiness history while superseding the old live-pilot shape with a reset-gated 7-day rehearsal model.
70. Keep `P8R` complete as the canonical reset-gate hardening slice so new pilot runs begin only after fresh memory retrieval top hits, fresh pilot checks, fresh release-gate proof, and clear working-note versus canonical-evidence rules are inspectable.
71. Keep `RG01` complete as the canonical rehearsal-environment check slice so `pnpm pilot:check` passes deterministically in the intended Node 20 pilot environment before a new rehearsal day is allowed to start.
72. Keep `RG02` complete as the canonical operator-log-command alignment slice so pilot docs match installed `vercel logs` CLI behavior and no removed flags survive in ranked operator instructions.
73. Keep `RG03` complete as the canonical observability-to-decision sequencing slice so a fresh observability row can be followed immediately by a fresh decision row when operators respect the documented command order.
74. Keep `RG04` complete as the canonical daily-sheet versus copied-evidence boundary slice so operators can record working notes, memory advisories, and orchestration detail without confusing them for the canonical evidence rows that govern pilot decisions.
75. Keep `RG05` complete as the canonical fresh-preflight slice so a new pilot id produces a GO release report, copied evidence index, pointer row, and reset-gate proof before `PD02+` rehearsal work begins.
76. Land `P8P` as the canonical 7-day rehearsal tranche so pilot execution becomes one bounded week of distinct scenario families rather than a noisy 14-day simulation that mixes reset-gate and scenario-proof concerns.
77. Keep `SP01` complete as the canonical `PD01` release-and-artifact baseline so the new pilot id already has a green day with release proof, copied evidence, observability row, decision row, and daily-sheet notes before rollback and role-flow scenarios widen coverage.
78. Keep `SP02` complete as the canonical `PD02` rollback-and-resume baseline so rollback tag discipline, resume inspection, and decision-proof continuity stay proven for the same pilot id, including the stale local rollback-tag correction after `main` advanced.
79. Land `SP03` through `SP06` as the canonical middle rehearsal slices so closed-loop role flow, SLA or matter pressure, privacy or RBAC stress, and communications or incident handling each get one explicit day instead of being blended into one vague pilot week.
80. Land `SP07` as the canonical executive-review slice so the 7-day rehearsal ends with one fixed recommendation artifact that links KPI condition, incident evidence, branch-manager input, and admin decision custody.

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

`P4` Staff Operations And Acceptance Control remains active as the post-`P3` tranche. `S01` is complete as the canonical staff claim queue and filter work slice, `S02` is complete as the canonical manual claim assignment slice, `S03` is now complete as the claim stage history and member-visible tracker slice, `S04` is now complete as the SLA-state visibility slice, `S05` is now complete as the internal-notes isolation slice, `S07` is now complete as the matter-ledger and allowance-visibility slice, intentionally promoted ahead of `S06`, `S06` is now complete as the next promoted slice after `S07`, `S08` is now complete as the explicit recovery-decision gate slice after `S06`, `S09` is now complete as the accepted-case agreement and collection prerequisite slice after `S08`, and `S10` is now complete as the guidance-only and referral-only commercial-enforcement slice after `S09`, keeping the actionable staff queue shipped with explicit staff-side assignment, public claim-history continuity, incomplete-vs-running SLA clarity, internal-note isolation, annual allowance visibility, canonical secure messaging, a typed accept-or-decline recovery gate, accepted-case commercial prerequisite enforcement, and a staff-only launch-scope block before any later auto-assignment work is committed.

`GA03` Add sponsored-seat activation and self-upgrade path is now complete after completed `GA02`, and `GA04` privacy and consent negative tests are now complete after completed `GA03` so group admins still cannot see claim facts, notes, or documents without explicit member consent.

`P6` v1.0.0 RC Gate is now complete after completed `P4` and `P4G`. `G07` Validate commercial promise surfaces is now complete, `G08` Validate Free Start and group privacy boundaries is now complete, `G09` Validate matter and SLA enforcement is now complete, and `G10` Validate escalation agreement and collection fallback in staging is now complete, proving release-candidate validation now covers the published commercial contract surfaces, Free Start and aggregate-only privacy boundaries, matter-and-SLA enforcement, and accepted-case commercial enforcement.

`P7` Pilot Readiness And Release Evidence is now complete after completed `P6`. `R01` Canonicalize the pilot-ready artifact set, `R02` Unify readiness commands and outputs, `R03` Add deterministic pilot evidence capture, `R04` Add explicit continue-pause-hotfix-stop decision proof, `R05` Make pilot-ready tag discipline repo-verifiable, `R06` Establish a modern readiness cadence, `R07` Tighten observability and incident evidence, and `R08` Publish one ranked operator flow for pilot entry are now complete, so pilot-entry command custody stays canonical across branch-manager oversight, staff processing, and admin decision flow before any broader UX redesign is promoted.

`P8` Pilot Reset Gate And Seven-Day Rehearsal is now active after completed `P7`. `P8R` is complete through `RG01` through `RG05`, proving the reset gate against `pilot-ks-7d-rehearsal-2026-03-16`, and `P8P` is now active with `SP01` complete as the green Day 1 release/artifact baseline and `SP02` complete as the green Day 2 rollback/resume baseline. `SP03` closed-loop role flow is now the next committed priority.

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
- `docs/plans/2026-03-15-pilot-readiness-blueprint-v1.md`
- `docs/plans/2026-03-15-pilot-readiness-roadmap-diff-proposal.md`
- `docs/plans/2026-03-16-p8-pilot-redesign-blueprint-v1.md`
- `docs/plans/2026-03-16-p8-pilot-redesign-roadmap-diff-proposal.md`

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
- `S09` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4` queue item after `S08`.
- `S09` is now complete as of 2026-03-14. Accepted recovery matters on the canonical staff mutation path now require both the full agreement snapshot and a usable success-fee collection path before `negotiation` or `court` can begin, accepted legacy states with missing collection data render as blocked instead of silently ready, and the deterministic gate-path browser proof now confirms the missing-collection prerequisite state on the routed staff claim-detail surface.
- `S10` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4` queue item after `S09`.
- `S10` is now complete as of 2026-03-15. Guidance-only and referral-only matters now reuse the canonical launch-scope category semantics on the staff mutation path, cannot save escalation agreement or success-fee collection data, cannot move into `negotiation` or `court`, and surface a staff-only launch-scope restriction on the canonical claim-detail action panel without exposing staff-only operational text to members.
- `GA01` has now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed item after the completed `P4` tranche so the client-only roster import placeholder can be replaced by the canonical group roster import path.
- `GA01` is now complete as of 2026-03-15. Office-tier `/agent/import` now parses canonical CSV rows on the client, routes valid rows through the typed agent import action, creates individual sponsored memberships on the canonical write path, and returns deterministic import summaries with unit coverage and verification proof.
- `GA02` has now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4G` queue item after completed `GA01`.
- `GA02` is now complete as of 2026-03-15. Office-tier `/agent/import` now exposes an aggregate-only group dashboard with activated-member counts, usage-rate rollups, open-case counts, and SLA-safe portfolio metrics while continuing to hide claim facts, notes, and documents.
- `GA03` has now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4G` queue item after completed `GA02`.
- `GA03` is now complete as of 2026-03-15. Group roster imports now create paused sponsored seats with explicit sponsor metadata, member `/membership` operations now expose sponsored activation and family self-upgrade paths on the canonical surface, and the first sponsored activation action now turns only paused sponsored subscriptions active without widening dashboard privacy boundaries.
- `GA04` has now been copied into the live program and tracker from `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md` and `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P4G` queue item after completed `GA03`.
- `GA04` is now complete as of 2026-03-15. Office-tier group access now has explicit privacy-and-consent boundary copy plus negative coverage that proves aggregate dashboards still hide member names, claim facts, staff-only notes, and claim documents without explicit member consent.
- `P6` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed tranche after completed `P4` and `P4G`.
- `G07` is now complete as of 2026-03-15. The scripted release-gate runner now checks `/pricing`, `/register`, `/services`, and `/member/membership` for the published commercial contract sections, records that proof in the canonical RC report, and fails GO or NO-GO status if the coverage matrix, success-fee calculator, disclaimers, or billing terms disappear.
- `G08` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P6` queue item after completed `G07`.
- `G08` is now complete as of 2026-03-15. The scripted release-gate runner now checks the public Free Start surface for the informational-only and routing-only boundary copy, checks office-tier `/agent/import` for the aggregate-only privacy boundary, and fails GO or NO-GO status if seeded member-identifying text appears on the group dashboard.
- `G09` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P6` queue item after completed `G08`.
- `G09` is now complete as of 2026-03-15. The scripted release-gate runner now checks deterministic member and staff claim-detail routes for seeded annual matter allowance counts plus seeded SLA states in both running and waiting-on-member claim statuses, and fails GO or NO-GO status if those enforcement surfaces drift from the canonical claim policy.
- `G10` has now been copied into the live program and tracker from `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md` as the next committed `P6` queue item after completed `G09`.
- `G10` is now complete as of 2026-03-15. The scripted release-gate runner now checks deterministic accepted-case staff claim-detail routes for unsigned-agreement blocking, deduction readiness, stored-payment-method fallback, and invoice fallback, and fails GO or NO-GO status if agreement or collection enforcement drifts from the canonical accepted-recovery policy.
- `P7` has now been copied into the live program and tracker from `docs/plans/2026-03-15-pilot-readiness-blueprint-v1.md` and `docs/plans/2026-03-15-pilot-readiness-roadmap-diff-proposal.md` as the next committed tranche after completed `P6`.
- `R01` through `R08` have now been copied into the live program and tracker from `docs/plans/2026-03-15-pilot-readiness-blueprint-v1.md` and `docs/plans/2026-03-15-pilot-readiness-roadmap-diff-proposal.md` as the committed pilot-readiness and release-evidence queue.
- `R01` is now complete as of 2026-03-15. The canonical release-gate runner accepts `--pilotId`, writes the release report plus copied per-pilot evidence index and canonical `docs/pilot-evidence/index.csv` pointer row together, preserves stable `docs/...` references for the pilot artifact set, and documents that contract in the pilot runbook.
- `R02` is now complete as of 2026-03-15. `pnpm pilot:check` now resolves to the shell-backed local pre-launch verification pack, `pnpm release:gate:prod` remains the canonical production full-suite release proof command, `pnpm release:gate:prod -- --pilotId <pilot-id>` remains the canonical pilot-entry artifact command, and the pilot runbook plus go/no-go docs now rank those authorities without overlap.
- `P8` has now been copied into the live program and tracker from `docs/plans/2026-03-16-p8-pilot-redesign-blueprint-v1.md` and `docs/plans/2026-03-16-p8-pilot-redesign-roadmap-diff-proposal.md` as the next committed tranche after completed `P7`.
- `P8R` is now complete as of 2026-03-16. `RG01` through `RG05` now prove the reset gate against the new pilot id `pilot-ks-7d-rehearsal-2026-03-16`, including memory top-hit confirmation, fresh `pilot:check`, corrected Vercel log command guidance, deterministic observability-to-decision sequencing, and a fresh GO release report with copied evidence artifacts.
- `P8P` is now active as of 2026-03-16. `SP01` is complete as the green `PD01` release-and-artifact baseline on `pilot-ks-7d-rehearsal-2026-03-16`, `SP02` is complete as the green `PD02` rollback-and-resume baseline on the same pilot id, and `SP03` is now the next committed rehearsal slice.

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
