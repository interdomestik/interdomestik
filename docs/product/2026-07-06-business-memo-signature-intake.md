---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-08
related:
  - docs/product/2026-07-05-business-memo-signing-packet.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/product/2026-07-05-memo1-expert-cost-on-loss-decision-record.md
  - docs/product/2026-07-05-memo2-handler-model-decision-record.md
  - docs/product/2026-07-08-memo2-handler-sla-evidence-addendum.md
  - docs/plans/2026-07-06-mob-05a-mob-02-prep-worksheet.md
  - docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md
---

# Business Memo Signature Intake

> Status: signature/proof intake only. This file signs nothing, selects no
> commercial option, changes no pricing, changes no copy, promotes no slice, and
> grants no runtime authority. It exists so signed Memo 1 and Memo 2 returns can
> be accepted or rejected consistently before `MOB-05a` or `MOB-02` gates.

## Purpose

The business memos block two later product slices:

- Memo 1 blocks `MOB-05a` Fee Math Sheet.
- Memo 2 blocks `MOB-02` Case Companion / Next Step assumptions.

This intake turns the next human action into a concrete acceptance process:

```text
name accountable signers -> collect required consultation fields -> sign -> accept or reject returned memo proof
```

Signer-facing return instructions are in
`docs/product/2026-07-06-business-memo-return-packet-albanian.md`.

## Current State

| Item                           | State                                                                 |
| ------------------------------ | --------------------------------------------------------------------- |
| Memo 1 decision record         | accepted for `MOB-05a` preparation via signed court-path addendum     |
| Memo 1 accountable signer      | Gazmend Abazi, Business owner / CEO, Ops and UI/UX - Interdomestik MK |
| Memo 1 finance input           | accepted for preparation; court-path cost split and ranges recorded   |
| Memo 1 counsel/L5 review owner | accepted for preparation; qualified wording only                      |
| Memo 2 decision record         | accepted for `MOB-02` preparation / CA review via signed correction   |
| Memo 2 accountable signer      | signed role coverage recorded in repo-safe addendum                   |
| Memo 2 ops input               | accepted for prep; staged service model and stop conditions recorded  |
| Memo 2 SLA/stability threshold | prep-only business-hours and SLA values recorded; runtime still gated |
| Runtime authority              | none                                                                  |

## Memo 1 Return Acceptance

Memo 1 can be accepted only if every required field below is filled. Leave
unknown fields blank rather than guessing.

| Required field                   | Acceptable value                                     | Result | Evidence reference                                                                                      |
| -------------------------------- | ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Accountable signer name and role | CEO/managing director or delegated accountable owner | `pass` | `ENT-A02-A03` / `MEMO1-FINANCE`; signed addendum approval block                                         |
| Exactly one option selected      | A / B / C, not multiple                              | `pass` | Qualified / hybrid court-path model in `docs/product/2026-07-08-memo1-finance-cap-evidence-addendum.md` |
| Expert/court-cost range          | numeric range, currency, source/assumption           | `pass` | Addendum section 4: expert `EUR 150-300`, court/admin `EUR 30-100`, translation/notary `EUR 10-100`     |
| Cap decision                     | amount if applicable, or explicit no-cap rationale   | `pass` | Addendum section 5: written court-path cost split; no general public zero-external-cost promise         |
| Finance input                    | named finance reviewer or accountable substitute     | `pass` | Addendum sections 5 and 12; prior signed Memo 1 signature table                                         |
| Counsel/L5 input                 | named reviewer or explicit blocker                   | `pass` | Addendum sections 6-9; unqualified zero-external-cost wording blocked                                   |
| Fee promise consequence          | unqualified / qualified / capped wording noted       | `pass` | Qualified no-success-fee / court-path cost wording                                                      |
| Date and signature               | dated signer approval                                | `pass` | Portal correction `corrections/2026-07-08T12-08-32-309Z-ent-a02-a03-gazmend/review.json`                |

## Memo 1 Gate Consequence

| Selected option | `MOB-05a` consequence                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| A               | Fee Math may keep the unqualified zero-loss promise only if cap/range and L5 review support it. |
| B               | Fee Math must model third-party costs and explicit worst-case member liability.                 |
| C               | Fee Math must model covered-vs-at-risk cost boundary and cap governance.                        |

Do not request `MOB-05a` runtime authority from an unsigned Memo 1, a
multi-selected Memo 1, or a Memo 1 with missing finance/counsel consequences.
As of 2026-07-08, Memo 1 is accepted for preparation only; runtime still
requires a later current-authority/design gate promoting exactly one concrete
slice.

## Memo 2 Return Acceptance

Memo 2 is accepted for preparation and current-authority review by the latest
`ENT-A02-A03` correction. This does not create runtime handler authority.

| Required field                   | Acceptable value                            | Result                      | Evidence reference                                                                  |
| -------------------------------- | ------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| Accountable signer name and role | ops lead/CEO or delegated accountable owner | `pass_for_prep`             | 2026-07-08 addendum; accepted correction `20260707-ent-a02-a03-memo2-correction-02` |
| Exactly one option selected      | A / B / C, not multiple                     | `requires_MOB-DG03_mapping` | The returned Memo 2 records handler/SLA model facts, not runtime promotion          |
| Ops feasibility input            | stable assignment/SLA reality stated        | `pass_for_prep`             | Declared owners, phases, business hours, and stop conditions in addendum            |
| If option C, stability threshold | numeric threshold and measurement period    | `not_authorized`            | Future gate must define any branch named-handler threshold                          |
| If option C, SLA threshold       | numeric SLA target and measurement period   | `pass_for_prep_only`        | Business hours 08:00-20:00; ack/review/escalation values in addendum                |
| Handover rule                    | required for any named-handler exposure     | `blocked_for_runtime`       | Claim handling and escalation require consent/agreement/approved scope              |
| Staff identity/privacy note      | reviewed or explicitly blocked              | `pass_for_prep`             | Role coverage signed; public names/photos remain future-gate work                   |
| Date and signature               | dated signer approval                       | `pass_for_prep`             | Signed artifact dated 2026-07-07; SHA-256 recorded in addendum                      |

## Memo 2 Gate Consequence

| Selected option | `MOB-02` consequence                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------- |
| A               | Case Companion may expose named-handler UX only with stability, SLA, handover, and privacy proof. |
| B               | Case Companion must use case-team language; names appear only as signature-level facts.           |
| C               | Case Companion must design both variants and gate named-handler exposure per branch thresholds.   |

Do not request `MOB-02` authority from the old "Memo 2 missing / unsigned"
blocker. The corrected blocker is that Memo 2 exists and is accepted for
preparation, but `MOB-02` / `MOB-02a` remains unpromoted until `MOB-DG03`
exists and the remaining entry evidence is complete. The accepted Memo 2
correction must not be used to infer named-handler reliability, notifications,
claim writers, Agreement Ceremony behavior, or runtime SLA display by itself.

## Safe Evidence Rules

Allowed in this repo record:

- signer name, role, date, and decision option;
- finance/counsel/ops reviewer names and roles;
- bounded cost ranges, caps, assumptions, and SLA thresholds;
- public or internal document path references.

Forbidden in this repo record:

- private bank/account data, payroll data, staff personal contact details;
- member, tenant, claim, payment, document, or uploaded-file identifiers;
- raw legal advice text that counsel marks privileged;
- customer case narratives or refund conversations.

## Completion Rule

Step 4 is complete only when both returned decision records are accepted by this
intake, dated, signed, and committed.

If a returned memo is incomplete, contradictory, unsigned, or unsafe to store in
the repo, the correct result is `blocked`. Do not let `MOB-05a` or `MOB-02`
advance from partial memo proof.
