---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
related:
  - docs/reviews/2026-07-07-human-dispatch-email-record.md
  - docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md
---

# Human Reply Processing Playbook - 2026-07-07

> Status: intake procedure only. This playbook explains how to process replies
> to the human dispatch packet. It does not accept evidence, appoint reviewers,
> sign memos, close B6/B7, promote `MOB-01b`, or authorize runtime exposure.

## Classification

Classified as `documentation/external-tracker-only` because this file defines
how returned human evidence is checked, redacted, indexed, and routed. It does
not change product behavior, runtime configuration, routes, auth, tenancy,
schema, RLS, billing, provider configuration, or public Help Now exposure.

## Current Mailbox Check

| Check time            | Query basis                                                                                               | Result                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2026-07-07 05:45 CEST | Gmail message/thread id from `docs/reviews/2026-07-07-human-dispatch-email-record.md` plus subject search | Only the outbound dispatch message was found. No returned evidence reply was available to process. |

## Processing Rule

Do not treat a reply as accepted evidence just because it exists.

Every reply must pass this sequence:

1. Identify which step it belongs to.
2. Screen for sensitive content.
3. Extract only safe fields into repo.
4. Store sensitive material outside repo and reference it safely.
5. Classify the reply using the accepted vocabulary.
6. Update the relevant intake document.
7. Append an intake-log row.
8. Update the nine-step status only if the evidence actually proves the step.

## Step Routing

| Reply content                                                                    | Route to                                                                                                                        | Required classification                                                                                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MK reviewer name, role, qualification, scope, module decisions                   | `docs/product/2026-07-06-mk-reviewer-appointment-intake.md` and `docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md` | `accepted`, `returned_for_correction`, `blocked`, or `requires_counsel` inside the MK packet; intake register uses `accepted`, `returned_for_correction`, or `blocked` |
| B6 operator, staging SHA, deploy/run URL, route/cache/re-darken proof            | `docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md` and B6/B7 ops packet                                     | `accepted`, `returned_for_correction`, or `blocked`                                                                                                                    |
| B7 alert owner, provider/project slug, alert inventory, synthetic fire/ack proof | `docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md` and B6/B7 ops packet                                 | `accepted`, `returned_for_correction`, `blocked`, or `needs_instrumentation`                                                                                           |
| Memo 1 fee/cost decision                                                         | `docs/product/2026-07-06-business-memo-signature-intake.md`                                                                     | `accepted`, `returned_for_correction`, or `blocked`                                                                                                                    |
| Memo 2 handler/case-team decision                                                | `docs/product/2026-07-06-business-memo-signature-intake.md`                                                                     | `accepted`, `returned_for_correction`, or `blocked`                                                                                                                    |
| UI/UX screen/module findings                                                     | UI/UX review output plus evidence register                                                                                      | `accepted`, `returned_for_correction`, or `blocked`; each finding must say blocker vs. later polish                                                                    |

## Sensitive-Data Screen

Before copying anything from a reply into repo, remove or replace:

- personal email addresses and phone numbers;
- private channel names or URLs;
- DSNs, tokens, API keys, cookies, or credentials;
- raw request URLs with identifiers;
- user IDs, member IDs, tenant IDs, claim IDs, document IDs, payment IDs;
- uploaded filenames when they identify a person, claim, document, or incident;
- free-text incident details or private member/case content.

Use this placeholder format instead:

```text
evidence-center:2026-07-07:{owner-or-role}:{artifact-type}
```

## Completeness Checks

| Step      | Minimum complete reply                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENT-A04` | Reviewer name, role, qualification basis, scope acceptance, date, module decisions, source/date for factual rows, counsel path where qualification is insufficient                  |
| `ENT-A05` | Named B6 operator, staging SHA/run URL, content-pack version/hash, route proof, cache/SW behavior, re-darken proof, propagation time, verdict                                       |
| `ENT-A06` | Named alert owner, provider/project slug, safe rule inventory, low-cardinality tag review, synthetic event, fired alert, ack/destination proof, or explicit `needs_instrumentation` |
| Memo 1    | One selected option, cost range/currency, cap if required, finance input, counsel/L5 input or blocker, date/signature reference                                                     |
| Memo 2    | One selected option, stable-assignment reality, threshold if required, SLA threshold, handover rule, staff identity/privacy note, date/signature reference                          |
| UI/UX     | Per screen/module: decision, unclear user point, concrete recommendation, blocker/correction/polish classification, date, reviewer                                                  |

## Intake Log Row

Append one row to
`docs/reviews/2026-07-06-nine-step-evidence-intake-register.md` for every
processed reply:

```md
| 2026-07-07 | `Step N` | `{artifact}` | `{role/name}` | `{accepted-by}` | `accepted / returned_for_correction / blocked / needs_instrumentation` | `{safe repo path/reference}` | `none / evidence-center:...` | `no / row id` | `{short note}` |
```

Do not use `accepted` if any required field is missing, any source/date is
missing for an MK factual row, or any sensitive proof is unavailable outside
repo.

## Status Update Rule

Only after the intake-log row is complete:

- update `docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md`;
- update the affected intake file;
- update `MOB-DG01B` draft only if A04/A05/A06 evidence changes the gate input;
- do not update current-program/current-tracker unless a formal authority or
  closeout path explicitly requires it.

## Runtime Boundary

Even if all replies are accepted, runtime remains blocked until current
authority/design gate promotes exactly one concrete slice.

The expected resolver state before that promotion remains:

```text
blocked_requires_current_authority
activeSlice=null
```
