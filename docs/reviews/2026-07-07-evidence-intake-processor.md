---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
related:
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-07-human-reply-processing-playbook.md
  - docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md
  - output/review/2026-07-06-mobile-uiux-review-interface/
---

# Evidence Intake Processor

> Status: processing rulebook only. This processor does not accept evidence by
> itself, sign memos, appoint reviewers, promote `MOB-01b`, or authorize runtime.

## Classification

Classified as `documentation/external-tracker-only` because it defines how to
classify human/portal evidence after it is returned. It does not change product
behavior, runtime configuration, routes, auth, tenancy, schema, billing, or
public Help Now exposure.

## Inputs

Process only one of these input types:

| Input             | Example                                                    | Safe repo handling                                     |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Portal submission | `submissions/{stamp}-{step}-{reviewer}/review.json`        | Store path plus summary only                           |
| Portal correction | `corrections/{stamp}-{step}-{reviewer}/review.json`        | Append correction row; do not overwrite old acceptance |
| Email reply       | Gmail thread `19f3aabc85190334`                            | Summarize; do not paste private/sensitive content      |
| Signed document   | PDF/hash or evidence-center ref                            | Store only if public-safe                              |
| Operator proof    | SHA, CI/CD URL, safe provider slug, synthetic event result | Redact secrets and private destinations                |

## Step Mapping

| Returned step            | Primary register row                                            | Can unblock                                             | Cannot do alone              |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------- |
| `ENT-A04`                | Step 2 / MK reviewer appointment plus country-content decisions | MK content evidence for `MOB-DG01B`                     | Public Help Now exposure     |
| `ENT-A14`                | Step 3 / UI-UX trust findings                                   | Placeholder/trust copy cleanup                          | Runtime launch               |
| `ENT-A05`                | Step 5 / B6 ops proof                                           | Content-pack hotfix/re-darken acceptance                | Runtime deploy               |
| `ENT-A06`                | Step 5 / B7 ops proof                                           | Alert owner/proof acceptance or instrumentation blocker | Observability implementation |
| `ENT-A02-A03`            | Step 4 / memos plus Steps 8-9 prep                              | Fee/handler assumptions                                 | Billing/case runtime         |
| `ENT-B04`                | MOB-DG03 prep / status-sentence catalog                         | `MOB-02a` copy-entry evidence                           | Runtime Case Companion       |
| `ENT-B05`                | MOB-DG03 prep / G09 Next Step SLA reconciliation                | `MOB-02a` SLA/date-entry evidence                       | Runtime SLA display          |
| `MOB02A-MEMO2-MAPPING`   | MOB-DG03 prep / Memo 2 display-model mapping                    | `MOB-02a` handler/team display-model evidence           | Named-handler runtime        |
| `MOB02A-READMODEL-PROOF` | MOB-DG03 prep / read-model and no-mutation proof                | `MOB-02a` read-only proof evidence                      | Runtime implementation       |
| `STEP3-UIUX`             | Step 3 / UI-UX disposition                                      | UI package blocker/polish classification                | Runtime UI rewrite           |
| `KS-FUTURE`              | Future KS note only                                             | KS planning input                                       | KS sign-off                  |
| `AL-BLOCKED`             | Future AL note only                                             | AL reviewer identification                              | AL launch                    |

## Decision Translation

| Portal decision                                        | Processor classification                     | Register action                                                         |
| ------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------- |
| `approve` with all required fields                     | `accepted`                                   | Add dated intake row and accepted evidence reference                    |
| `approve` but missing required source/date/owner/proof | `returned_for_correction`                    | Add row naming missing fields                                           |
| `change`                                               | `returned_for_correction`                    | Add row with required correction and owner                              |
| `block`                                                | `blocked`                                    | Add blocker row and cite stop condition/gate impact                     |
| Alert/ops says current system cannot prove signal      | `needs_instrumentation`                      | Add row and nominate future instrumentation candidate, no runtime start |
| Later correction submission                            | `superseded` for prior row plus new decision | Keep both rows; re-open dependent gate if needed                        |

## Required Checks Before Acceptance

For every returned artifact:

1. Confirm reviewer/operator/signer name, role, and date exist.
2. Confirm the step id matches the expected work item.
3. Confirm all step-required fields are present.
4. Confirm sensitive evidence is referenced, not pasted.
5. Confirm the decision is one of:
   - `accepted`
   - `returned_for_correction`
   - `blocked`
   - `needs_instrumentation`
   - `superseded`
6. Confirm dependent gate impact:
   - `MOB-DG01B`
   - `MOB-05a`
   - `MOB-02`
   - future KS/AL only
7. Confirm no runtime authority is implied.

## Register Update Template

Append one row to the intake log in
`docs/reviews/2026-07-06-nine-step-evidence-intake-register.md`:

| Row id                  | Date       | Step     | Artifact returned                 | Returned by  | Accepted by      | Decision                                                                            | Safe repo path/reference | Sensitive evidence reference | Replaces prior row id? | Notes         |
| ----------------------- | ---------- | -------- | --------------------------------- | ------------ | ---------------- | ----------------------------------------------------------------------------------- | ------------------------ | ---------------------------- | ---------------------- | ------------- |
| `YYYYMMDD-step-item-01` | YYYY-MM-DD | `Step N` | `portal/email/pdf/operator-proof` | `name, role` | `Arben/platform` | `accepted / returned_for_correction / blocked / needs_instrumentation / superseded` | `path-or-safe-ref`       | `none / evidence-center:...` | `no / prior row id`    | `gate impact` |

## Immediate Outcomes

After processing a return:

| Outcome                                          | Next action                                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `ENT-A04`, `ENT-A05`, and `ENT-A06` all accepted | Finalize `MOB-DG01B` draft for current-authority review                                                                           |
| `ENT-A14` accepted                               | Treat as public-exposure readiness evidence; it is not a hard `MOB-DG01B` draft prerequisite unless current authority upgrades it |
| Any of `ENT-A04/A05/A06` returned for correction | Send targeted correction request; keep `MOB-01b` blocked                                                                          |
| Any of `ENT-A04/A05/A06` blocked                 | Stop `MOB-01b` launch track and record blocker                                                                                    |
| `ENT-A06` needs instrumentation                  | Prepare a separate minimal instrumentation candidate; do not implement without authority                                          |
| Memo 1 accepted                                  | Update `MOB-05a` fee-math assumptions as signed                                                                                   |
| Memo 2 accepted                                  | Update `MOB-02` handler/SLA assumptions as signed                                                                                 |
| `ENT-B04` accepted                               | Update MOB-DG03 blocker packet/register pointers for status-sentence catalog evidence; do not promote runtime                     |
| `ENT-B05` accepted                               | Update MOB-DG03 blocker packet/register pointers for G09/SLA reconciliation evidence; do not promote runtime                      |
| `MOB02A-MEMO2-MAPPING` accepted                  | Update Memo 2 display-model mapping evidence; do not infer named-handler runtime unless the selected model explicitly permits it  |
| `MOB02A-READMODEL-PROOF` accepted                | Update MOB-DG03 read-model/no-mutation proof evidence; runtime still waits for current-authority/design-gate                      |
| UI/UX blocker found                              | Feed blocker into UI package/gate prep before runtime                                                                             |

## Non-Negotiable Rule

The processor can make evidence easier to use. It cannot convert evidence into
runtime authority. Runtime starts only after current-program/current-tracker and
resolver state promote exactly one concrete slice.
