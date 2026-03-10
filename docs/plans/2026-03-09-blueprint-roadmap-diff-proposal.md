---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-09
parent_program: docs/plans/current-program.md
parent_tracker: docs/plans/current-tracker.md
---

# Blueprint Roadmap Diff Proposal

> Status: Active supporting input. This document proposes the minimum roadmap and promotion changes required to align execution with `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md`. It does not commit work by itself.

## Recommendation

Rebase the execution roadmap in place. Do not append the blueprint as extra scope on top of the current `v1_execution_roadmap.md.resolved`.

Reason:

- the roadmap still shows `P1 AI Layer (AI02-AI06)` as future work, but `current-program.md` records `AI02` through `AI06` as complete
- the blueprint adds commercial contract surfaces that do not fit cleanly into the current `P1T`, `P2`, `P3`, and `P4` definitions
- the historical March 3 charter should remain unchanged because it is superseded and no longer defines live sequencing

## No Change To The Historical Charter

No direct edits are recommended for `docs/plans/2026-03-03-program-charter-canonical.md`.

Reason:

- it is marked `status: superseded`
- it already supports the blueprint direction through trust, compliance, desktop ops, and business-proxy KPIs
- changing it would create noise without improving current execution control

The blueprint should affect:

- `v1_execution_roadmap.md.resolved`
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`

It should not affect the historical charter except as future reference.

## Required Rebase Of The Execution Roadmap

### Replace The Current Phase Overview

Replace the current forward-looking phase table with this shape after `D08` closes:

| Phase | Name                                        | Relative Timing                        | Owner            | Purpose                                                                                |
| ----- | ------------------------------------------- | -------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `P-1` | Infrastructure Debt Closure                 | current                                | `platform + qa`  | finish `D08` RLS on four critical tables                                               |
| `P1C` | Commercial Contract Foundations             | W1-W2 after `D08`                      | `web + platform` | publish the actual commercial promise: coverage, fees, disclaimers, cancellation terms |
| `P1T` | Free Start And Trust UX                     | W1-W2 after `D08`, parallel with `P1C` | `web + design`   | ship the Free Start funnel and trust surfaces around the contract                      |
| `P2`  | Billing And Terms Hardening                 | W3-W4 after `D08`                      | `platform`       | enforce annual membership, escalation agreement, and success-fee collection rules      |
| `P3`  | Commercial Actions And Contract Enforcement | W5-W6 after `D08`                      | `platform + web` | move core commercial actions to typed server actions with idempotency and auditability |
| `P4`  | Staff Operations And Acceptance Control     | W7-W8 after `D08`                      | `platform + web` | make matter limits, SLA states, and case acceptance enforceable in staff operations    |
| `P4G` | Group Access Pilot Readiness                | W9 after `D08`                         | `platform + web` | enable roster import and aggregate-only group reporting                                |
| `P5`  | Design System Elevation                     | conditional after `P4G`                | `web + design`   | keep only if commercial and ops surfaces are complete                                  |
| `P6`  | v1.0.0 RC Gate                              | final 2 weeks                          | `platform + qa`  | release evidence and go/no-go validation                                               |

### Remove Or Reclassify Existing Roadmap Phases

Apply these phase-level changes to `v1_execution_roadmap.md.resolved`:

1. Remove `P1 AI Layer (AI02-AI06)` from the forward schedule.
   Reason: `current-program.md` already records `AI02` through `AI06` as complete canonical work.

2. Keep `P1T`, but widen it from marketing UX to `Free Start And Trust UX`.
   Reason: the blueprint requires disclaimered self-serve entry, claim-pack generation, confidence scoring, and published commercial boundaries.

3. Rename `P2 Billing Hardening` to `Billing And Terms Hardening`.
   Reason: the blueprint adds escalation agreement, cancellation/refund terms, and success-fee collection behavior.

4. Rename `P3 Mutation Standardization` to `Commercial Actions And Contract Enforcement`.
   Reason: the highest-value mutations are no longer generic; they are the commercial contract actions.

5. Rename `P4 Staff Operations` to `Staff Operations And Acceptance Control`.
   Reason: the blueprint requires acceptance gates, decline reasons, matter accounting, and explicit SLA state transitions.

6. Add `P4G Group Access Pilot Readiness`.
   Reason: B2B2C is now part of the blueprint, but it is a narrow group-access layer, not a full enterprise product.

7. Make `P5 Design System Elevation` conditional.
   Reason: commercial enforcement surfaces matter more than cosmetic polish for v1.

## Exact Work Items To Add By Phase

### `P1C` Commercial Contract Foundations

| ID    | Work                                                                   | Exit Criteria                                                                                                       |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `C01` | Publish the coverage matrix on pricing, checkout, and member surfaces. | Vehicle, property, injury, and guidance-only categories are visible with included, escalation, and referral states. |
| `C02` | Ship the success-fee calculator with worked examples.                  | Public surfaces show fee math for standard, family, minimum fee, and legal-action cap examples.                     |
| `C03` | Add Free Start disclaimer and hotline clarification.                   | Free Start is explicitly informational only, and hotline copy says routing and support, not legal review.           |
| `C04` | Publish annual billing, cancellation, refund, and cooling-off terms.   | Checkout, pricing, and member settings show billing cadence, cancellation effect, and refund or cooling-off rules.  |
| `C05` | Publish the claims-first scope tree and referral boundaries.           | Out-of-scope and guidance-only case types are explicit in copy and no longer implied as full handling.              |
| `C06` | Add commercial funnel instrumentation.                                 | Analytics emit `free_start_completed`, `membership_started`, `escalation_requested`, and `escalation_declined`.     |

### `P1T` Free Start And Trust UX

| ID    | Work                                                               | Exit Criteria                                                                                            |
| ----- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `T01` | Update hero, trust strip, and footer safety net.                   | Claim-first landing surfaces show proof chips, phone or WhatsApp CTA, and multilingual trust cues.       |
| `T02` | Ship the Free Start claim-pack generator shell.                    | Users can choose vehicle, property, or injury and complete a self-serve intake path.                     |
| `T03` | Add confidence score and recommended next step.                    | Completed Free Start intake returns High, Medium, or Low confidence and a clear next-step CTA.           |
| `T04` | Add claim-type evidence prompts, privacy badge, and SLA microcopy. | Wizard and Free Start flows show category-specific evidence guidance, privacy notice, and triage timing. |
| `T05` | Add `/services` content aligned to the coverage matrix.            | Services page explains included help, escalation path, and referral boundaries without over-promising.   |
| `T06` | Add i18n coverage and component tests for the new trust surfaces.  | `sq` and `en` translations exist and all new components have unit coverage.                              |

### `P2` Billing And Terms Hardening

| ID    | Work                                                                      | Exit Criteria                                                                                                   |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `B01` | Keep existing Stripe cleanup and Paddle webhook hardening work.           | Existing `B01` through `B06` stay required.                                                                     |
| `B07` | Persist escalation agreements and signed commercial terms.                | Accepted recovery matters store fee percentage, minimum fee, legal-action cap, and payment authorization state. |
| `B08` | Enforce annual membership cancellation and refund rules in product flows. | Cancellation changes only future renewal state; refund and cooling-off logic matches published terms.           |
| `B09` | Add success-fee collection fallback order.                                | Recovery matters support deduction where allowed, then stored payment method, then invoicing fallback.          |
| `B10` | Add commercial audit trail for accepted and cancelled recovery matters.   | Recovery acceptance, decline, cancellation, and collection attempts are auditable.                              |

### `P3` Commercial Actions And Contract Enforcement

| ID    | Work                                                               | Exit Criteria                                                                                                                        |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `M01` | Audit the commercial mutation paths required by the blueprint.     | Free Start submission, escalation request, agreement acceptance, matter consumption, cancellation, and roster import are classified. |
| `M02` | Migrate the top commercial mutations to typed Server Actions.      | Free Start, escalation request, escalation acceptance, and cancellation use `_core.ts` validation paths.                             |
| `M03` | Add idempotency keys to commercial mutations.                      | Duplicate Free Start, escalation, and billing submissions do not double-create work.                                                 |
| `M04` | Add matter-consumption guards to the contract actions.             | Staff work cannot start when matter allowance is exhausted without an explicit upgrade or override path.                             |
| `M05` | Add audit-safe escalation acceptance and decline actions.          | Each accept or decline action stores actor, time, reason, and next state.                                                            |
| `M06` | Remove or isolate superseded API routes once callers are migrated. | No orphaned commercial write paths remain for migrated flows.                                                                        |

### `P4` Staff Operations And Acceptance Control

| ID    | Work                                                                  | Exit Criteria                                                                                              |
| ----- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `S01` | Keep the staff claim queue and filter work.                           | Existing staff queue work remains required.                                                                |
| `S02` | Start with manual claim assignment only.                              | Claims can be assigned manually; load-based auto-assignment stays deferred.                                |
| `S03` | Keep claim stage history and member-visible tracker.                  | Existing stage-history work remains required.                                                              |
| `S04` | Expand SLA tracking to distinguish `incomplete` and `running` states. | Staff and member surfaces reflect whether the SLA has started or is waiting for missing information.       |
| `S05` | Keep internal notes isolation.                                        | Notes remain staff-only with negative E2E coverage.                                                        |
| `S06` | Keep secure member-staff messaging, but read receipts are optional.   | Messaging works without requiring polish-only read-receipt scope.                                          |
| `S07` | Add matter ledger and allowance visibility.                           | Staff and members can see annual matter usage and remaining allowance.                                     |
| `S08` | Add case acceptance and decline gate with reason taxonomy.            | Staff must accept or decline recovery before negotiation work starts, and decline reasons are categorized. |
| `S09` | Enforce agreement and payment-method prerequisites on accepted cases. | No accepted recovery case can move forward without agreement state and collection path.                    |
| `S10` | Add staff enforcement for non-monetary guidance-only cases.           | Guidance-only and referral-only matters cannot be moved into success-fee handling.                         |

### `P4G` Group Access Pilot Readiness

| ID     | Work                                                     | Exit Criteria                                                                             |
| ------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GA01` | Add group roster import.                                 | Employers and associations can create sponsored member seats by roster or CSV.            |
| `GA02` | Add aggregate-only group dashboard.                      | Group admins see activations, usage, and aggregate SLA metrics only.                      |
| `GA03` | Add sponsored-seat activation and self-upgrade path.     | Sponsored members can activate and self-upgrade from individual to family coverage.       |
| `GA04` | Add privacy and consent negative tests for group access. | Group admins cannot see claim facts, notes, or documents without explicit member consent. |

### `P6` RC Gate Additions

| ID    | Work                                                              | Exit Criteria                                                                                           |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `G07` | Validate commercial promise surfaces.                             | Coverage matrix, fee calculator, disclaimers, and refund terms are present in release-candidate builds. |
| `G08` | Validate Free Start and group privacy boundaries.                 | Free Start states informational-only status and group dashboards expose only aggregate data.            |
| `G09` | Validate matter and SLA enforcement.                              | Members and staff see correct matter counts and correct SLA states in staging.                          |
| `G10` | Validate escalation agreement and collection fallback in staging. | Recovery acceptance, signature, and payment fallback flows pass end-to-end in staging.                  |

## Exact Items To Promote Into `current-program.md` And `current-tracker.md`

### Promotion Rule

Do not promote blueprint work while `D08` is still active.

First close:

- `D08` RLS on four critical tables

Then promote the blueprint in this order.

### First Promotion After `D08`

Promote this tranche only:

- `P1C` Commercial Contract Foundations
- `C01`
- `C02`
- `C03`
- `C04`
- `C05`
- `C06`

Reason:

- it aligns the published promise before deeper product enforcement starts
- it gives the team measurable commercial surfaces without reopening architecture
- it keeps the first blueprint promotion narrow enough for the current governance model

### Second Promotion

Promote:

- `P1T` Free Start And Trust UX
- `T01`
- `T02`
- `T03`
- `T04`
- `T05`
- `T06`

### Third Promotion

Promote:

- `P2` Billing And Terms Hardening
- existing `B01` through `B06`
- `B07`
- `B08`
- `B09`
- `B10`

### Fourth Promotion

Promote:

- `P3` Commercial Actions And Contract Enforcement
- `M01`
- `M02`
- `M03`
- `M04`
- `M05`
- `M06`

### Fifth Promotion

Promote:

- `P4` Staff Operations And Acceptance Control
- `S01` through `S10`

### Sixth Promotion

Promote:

- `P4G` Group Access Pilot Readiness
- `GA01`
- `GA02`
- `GA03`
- `GA04`

### Final Promotion

Promote:

- `P6` v1.0.0 RC Gate
- existing `G01` through `G06`
- `G07`
- `G08`
- `G09`
- `G10`

## Proposed `current-program.md` Delta

When `D08` closes, the next committed priority section should not jump back to the old AI or generic UX roadmap.

It should state:

- `P1C` Commercial Contract Foundations is the next committed tranche
- the goal is to publish the actual commercial contract defined in the blueprint
- the committed queue is `C01` through `C06`

## Proposed `current-tracker.md` Delta

Add pending rows for the first promoted tranche only after `D08` closes:

| ID    | Status    | Owner            | Work                                                                       | Exit Criteria                                                                                                 |
| ----- | --------- | ---------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `C01` | `pending` | `web + platform` | Publish the coverage matrix across pricing, checkout, and member surfaces. | Included, escalation, and referral boundaries are visible for each launch claim type.                         |
| `C02` | `pending` | `web + platform` | Ship the public success-fee calculator and worked examples.                | Standard, family, minimum-fee, and legal-action examples are visible before escalation.                       |
| `C03` | `pending` | `web + design`   | Add Free Start and hotline disclaimers.                                    | Free Start states informational-only status and hotline states routing-only status.                           |
| `C04` | `pending` | `web + platform` | Publish annual billing, cancellation, refund, and cooling-off terms.       | Checkout, pricing, and settings reflect the same commercial rules.                                            |
| `C05` | `pending` | `web + platform` | Publish the claims-first scope tree and referral boundaries.               | Guidance-only and out-of-scope categories are explicit in the UI and docs.                                    |
| `C06` | `pending` | `web + platform` | Add commercial funnel instrumentation.                                     | Free Start, membership start, escalation request, and escalation decline emit deterministic analytics events. |

## What This Proposal Intentionally Does Not Change

- no change to `apps/web/src/proxy.ts`
- no route renames
- no auth or tenancy refactor
- no repo-wide RLS expansion beyond the already-active `D08`
- no request-path AI decisions
- no separate enterprise product before the group-access pilot

## Decision

If the blueprint is adopted, the execution roadmap should be rebased to this structure.

The first actionable governance move is not to edit the historical charter. It is to:

1. close `D08`
2. promote `P1C` with `C01` through `C06`
3. keep later phases as input until each preceding tranche closes
