---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-06
related:
  - docs/product/2026-07-05-business-memo-signing-packet.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/product/2026-07-05-memo1-expert-cost-on-loss-decision-record.md
  - docs/product/2026-07-05-memo2-handler-model-decision-record.md
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

| Item                           | State    |
| ------------------------------ | -------- |
| Memo 1 decision record         | unsigned |
| Memo 1 accountable signer      | `TBD`    |
| Memo 1 finance input           | `TBD`    |
| Memo 1 counsel/L5 review owner | `TBD`    |
| Memo 2 decision record         | unsigned |
| Memo 2 accountable signer      | `TBD`    |
| Memo 2 ops input               | `TBD`    |
| Memo 2 SLA/stability threshold | `TBD`    |
| Runtime authority              | none     |

## Memo 1 Return Acceptance

Memo 1 can be accepted only if every required field below is filled. Leave
unknown fields blank rather than guessing.

| Required field                   | Acceptable value                                     | Result | Evidence reference |
| -------------------------------- | ---------------------------------------------------- | ------ | ------------------ |
| Accountable signer name and role | CEO/managing director or delegated accountable owner | `TBD`  | `TBD`              |
| Exactly one option selected      | A / B / C, not multiple                              | `TBD`  | `TBD`              |
| Expert/court-cost range          | numeric range, currency, source/assumption           | `TBD`  | `TBD`              |
| Cap decision                     | amount if applicable, or explicit no-cap rationale   | `TBD`  | `TBD`              |
| Finance input                    | named finance reviewer or accountable substitute     | `TBD`  | `TBD`              |
| Counsel/L5 input                 | named reviewer or explicit blocker                   | `TBD`  | `TBD`              |
| Fee promise consequence          | unqualified / qualified / capped wording noted       | `TBD`  | `TBD`              |
| Date and signature               | dated signer approval                                | `TBD`  | `TBD`              |

## Memo 1 Gate Consequence

| Selected option | `MOB-05a` consequence                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| A               | Fee Math may keep the unqualified zero-loss promise only if cap/range and L5 review support it. |
| B               | Fee Math must model third-party costs and explicit worst-case member liability.                 |
| C               | Fee Math must model covered-vs-at-risk cost boundary and cap governance.                        |

Do not request `MOB-05a` authority from an unsigned Memo 1, a multi-selected
Memo 1, or a Memo 1 with missing finance/counsel consequences.

## Memo 2 Return Acceptance

Memo 2 can be accepted only if every required field below is filled.

| Required field                   | Acceptable value                            | Result | Evidence reference |
| -------------------------------- | ------------------------------------------- | ------ | ------------------ |
| Accountable signer name and role | ops lead/CEO or delegated accountable owner | `TBD`  | `TBD`              |
| Exactly one option selected      | A / B / C, not multiple                     | `TBD`  | `TBD`              |
| Ops feasibility input            | stable assignment/SLA reality stated        | `TBD`  | `TBD`              |
| If option C, stability threshold | numeric threshold and measurement period    | `TBD`  | `TBD`              |
| If option C, SLA threshold       | numeric SLA target and measurement period   | `TBD`  | `TBD`              |
| Handover rule                    | required for any named-handler exposure     | `TBD`  | `TBD`              |
| Staff identity/privacy note      | reviewed or explicitly blocked              | `TBD`  | `TBD`              |
| Date and signature               | dated signer approval                       | `TBD`  | `TBD`              |

## Memo 2 Gate Consequence

| Selected option | `MOB-02` consequence                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------- |
| A               | Case Companion may expose named-handler UX only with stability, SLA, handover, and privacy proof. |
| B               | Case Companion must use case-team language; names appear only as signature-level facts.           |
| C               | Case Companion must design both variants and gate named-handler exposure per branch thresholds.   |

Do not request `MOB-02` authority from an unsigned Memo 2, a multi-selected
Memo 2, or a Memo 2 that implies named-handler reliability without ops/SLA
evidence.

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
