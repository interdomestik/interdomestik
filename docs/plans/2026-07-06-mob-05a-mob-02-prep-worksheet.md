---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-08
related:
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/product/2026-07-05-business-memo-signing-packet.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/product/2026-07-06-business-memo-signature-intake.md
  - docs/product/2026-07-05-memo1-expert-cost-on-loss-decision-record.md
  - docs/product/2026-07-05-memo2-handler-model-decision-record.md
  - docs/product/2026-07-08-memo2-handler-sla-evidence-addendum.md
  - docs/product/2026-07-03-mobile-excellence-dossier-part-5.md
---

# MOB-05a / MOB-02 Preparation Worksheet

> Status: prep worksheet only. This does not sign Memo 1 or Memo 2, promote
> `MOB-05a`, promote `MOB-02`, authorize runtime work, or approve copy. It
> records what the later gates need once the business decisions are signed.

## Purpose

Reduce the delay between business decision and implementation gate by mapping
the business memos to their downstream product, copy, legal, and verification
requirements.

- Memo 1 feeds `MOB-05a` Fee Math Sheet.
- Memo 2 feeds `MOB-02` Case Companion / Next Step read model.

Both runtime slices remain blocked until a later current-authority/design-gate
promotes exactly one concrete slice.

## Execution Rule

Use the Interdomestik slice-runner skill for any gate, authority, verification,
PR, or implementation work. The skill is advisory workflow machinery; repo
`AGENTS.md`, `docs/plans/current-program.md`,
`docs/plans/current-tracker.md`, resolver state, and merged gate records remain
the actual authority.

## Current State

| Item                                | Evidence path                                                                                                                      | Current disposition                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Memo 1 expert-cost-on-loss decision | `docs/product/2026-07-08-memo1-finance-cap-evidence-addendum.md`; portal `ENT-A02-A03` / `MEMO1-FINANCE`                           | Accepted for `MOB-05a` preparation only; qualified / hybrid court-path model. |
| Memo 2 handler-model decision       | `docs/product/2026-07-05-memo2-handler-model-decision-record.md`; `docs/product/2026-07-08-memo2-handler-sla-evidence-addendum.md` | Accepted for `MOB-02` preparation / CA review only; no runtime authority.     |
| Memo return packet                  | `docs/product/2026-07-06-business-memo-return-packet-albanian.md`                                                                  | Superseded by accepted Memo 1 / Memo 2 correction evidence.                   |
| Memo return acceptance              | `docs/product/2026-07-06-business-memo-signature-intake.md`                                                                        | Memo 1 and Memo 2 accepted for preparation; runtime gates still blocked.      |
| `MOB-05a` prep                      | This worksheet; `docs/plans/2026-07-08-mob-05a-memo1-evidence-intake-current-authority.md`                                         | Memo 1 blocker resolved for preparation; implementation gate still blocked.   |
| `MOB-02` prep                       | This worksheet                                                                                                                     | Prepared only; gate blocked.                                                  |
| Runtime authority                   | `docs/plans/current-program.md`, `docs/plans/current-tracker.md`, resolver                                                         | Missing; resolver remains `activeSlice=null`.                                 |

## 2026-07-08 Memo 1 Evidence Intake Result

The signed Memo 1 finance/court-path addendum is accepted for `MOB-05a`
preparation. It records a qualified / hybrid court-path model:

- Interdomestik may say there is no success fee owed to Interdomestik when
  there is no recovery.
- Interdomestik must not imply that every external court-path cost is always
  zero for the client.
- Fixed court fees, decision fees, super-expertise, and other external costs
  are controlled by the written court-path agreement before the cost is created.
- Any court-awarded reimbursement for costs paid upfront by Interdomestik
  returns to Interdomestik.

This resolves the Memo 1 business-decision blocker for preparation only. It does
not promote `MOB-05a` implementation. A later `MOB-DG02` gate must still define
the exact Fee Math display scope, `thirdPartyCostTreatment`, examples,
instrumentation, offline behavior, copy/a11y/Playwright proof, and stop
conditions.

## 2026-07-08 Memo 2 Evidence Reconciliation Result

The signed Memo 2 handler/SLA PDF correction is accepted for `MOB-02`
preparation and current-authority review. The repo-safe addendum records the
artifact hash, accepted correction reference, visible signed role coverage,
country scope, declared business-hours window, allowed SLA values, and stop
conditions without committing the raw PDF.

This resolves the "Memo 2 missing / unsigned" inconsistency for preparation
only. It does not promote `MOB-02` or `MOB-02a`, create `MOB-DG03`, authorize
runtime work, approve public copy, or authorize named-handler display. A later
`MOB-DG03` must still narrow the read-only Case Companion / Next Step scope and
prove the remaining entry evidence.

## Memo 1 To MOB-05a Consequence Map

| Memo 1 option                                                           | Product promise                                                                                    | Fee Math / copy consequence                                                                                                                                     | Additional evidence before gate                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A - Interdomestik absorbs approved costs on lost cases                  | Strongest "recover nothing, pay nothing" promise                                                   | Fee Math can keep the unqualified zero-loss line; ProposalCard can frame approved expert/court costs as covered on loss.                                        | Finance range/cap, L5 review of `fees.*`, quarterly cost-review owner.                         |
| B - Member remains liable for approved third-party costs                | Qualified no-success-fee promise                                                                   | Fee Math needs `thirdPartyCosts`; ProposalCard must show worst case; AC-2 needs total-cost row.                                                                 | L5 review, explicit worst-case examples, abandonment-risk metric plan.                         |
| C - Interdomestik absorbs up to cap                                     | Hybrid promise                                                                                     | Fee Math needs covered-vs-at-risk distinction; ProposalCard must show cap boundary and member approval state.                                                   | Cap governance, L5 review, cap-edge copy examples.                                             |
| Signed court-path addendum - qualified / hybrid written-agreement model | No success fee to Interdomestik on no recovery; external court-path costs follow written agreement | Fee Math needs reviewed court-path `thirdPartyCostTreatment`; ProposalCard and AC-2 must show fixed-cost/super-expertise responsibility and reimbursement rule. | Later `MOB-DG02` must lock examples, no-PII instrumentation, offline behavior, and proof plan. |

`MOB-05a` must not use the unqualified "recover nothing, pay nothing" line if
Memo 1 chooses B or C.

## Draft MOB-05a Entry Criteria

`MOB-05a` gate prep is ready only after:

1. Memo 1 has exactly one selected option.
2. Finance has filled a defensible expert/court-cost range.
3. Cap amount is filled if option A or C relies on a cap.
4. Counsel / L5 owner has reviewed the selected fee promise.
5. A `fees.*` copy key inventory exists for the selected option.
6. Fee Math delegates arithmetic to the canonical `C02` calculator, with zero
   new component arithmetic.
7. Fee Math examples include the expert-cost edge when the selected option
   requires it.
8. `fee_sheet_viewed` instrumentation and no-PII event fields are specified.
9. Offline/public rendering behavior is defined without member/session leakage.
10. The future gate lists exact unit, copy, accessibility, and Playwright proof.

## Memo 2 To MOB-02 Consequence Map

| Memo 2 option                                       | Member-facing promise         | Case Companion / copy consequence                                                                     | Additional evidence before gate                                              |
| --------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A - Named handler from launch                       | Personal handler relationship | Requires stable assignment, per-handler SLA tracking, handover moment, staff identity/privacy review. | Ops stability evidence, SLA measurement, HR/privacy approval.                |
| B - Case team from launch                           | Team-owned case relationship  | Copy says "your Interdomestik team"; named people appear only for signature-level facts.              | Team SLA wording, ceremony reviewer-name boundary.                           |
| C - Launch case team, earn named handler per branch | Honest staged rollout         | Both copy variants designed; per-branch eligibility controls future named-handler exposure.           | Stability threshold, SLA threshold, measurement period, branch rollout rule. |

`MOB-02` must not imply a stable named handler unless Memo 2 chooses A or a
branch satisfies the signed option C thresholds.

## Draft MOB-02 Entry Criteria

`MOB-02` gate prep is ready only after:

1. Memo 2 accepted evidence is mapped by the future gate into exactly one
   concrete display model.
2. If named-handler behavior can appear, branch stability and SLA thresholds are
   filled.
3. `G09` SLA reconciliation inputs are available or explicitly blocked.
4. Status-sentence catalog exists for post-T-503 transition states and supported
   locales.
5. Notification choreography and cold-render contract are written.
6. Copy inventory names handler/team keys affected by the decision.
7. Handover copy exists if named-handler behavior can appear.
8. Staff identity/privacy note is reviewed before public names/photos ship.
9. Empty, delayed, reassigned, and unavailable-handler states are defined.
10. The future gate lists exact read-model, copy, accessibility, and Playwright
    proof.

## Immediate Human Actions

| Action                                                                         | Owner type               | Blocks                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------- |
| Name the accountable signer for Memo 1                                         | managing director / CEO  | Done for preparation via signed addendum                                                      |
| Fill expert/court-cost range and cap recommendation                            | finance                  | Done for preparation via signed addendum; exact implementation examples remain for `MOB-DG02` |
| Name counsel / L5 reviewer for fee wording                                     | counsel / legal reviewer | Done for preparation via signed addendum; final public copy review remains for `MOB-DG02`     |
| Name the accountable signer for Memo 2                                         | ops lead / CEO           | Done for preparation via accepted Memo 2 correction                                           |
| Map accepted Memo 2 handler/SLA evidence to one display model                  | ops + product            | `MOB-DG03`; no runtime inference before gate                                                  |
| If named-handler behavior can appear, fill branch stability and SLA thresholds | ops                      | `MOB-DG03`                                                                                    |

## Completion Rule

This worksheet is complete as a prep artifact when it is committed and linked
from the nine-step control sheet. It does not make steps 8 or 9 complete.

Step 8 advances only after signed Memo 1 and fee-wording review inputs exist.
Step 9 advances only after accepted Memo 2 evidence and ops-SLA reconciliation
inputs exist. Both signed memo returns must be accepted by
`docs/product/2026-07-06-business-memo-signature-intake.md` before either gate
can cite them as evidence.
