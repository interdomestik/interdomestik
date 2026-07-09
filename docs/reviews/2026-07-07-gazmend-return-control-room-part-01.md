---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
related:
  - docs/reviews/2026-07-07-waiting-for-gazmend-execution-plan.md
  - docs/reviews/2026-07-07-evidence-intake-processor.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-07-reviewer-portal-vercel-deployment-record.md
  - docs/plans/2026-07-06-mob-dg01b-mk-help-now-non-dark-gate-draft.md
---

# Gazmend Return Control Room - 2026-07-07 - Part 1

Back to index: [2026-07-07-gazmend-return-control-room.md](./2026-07-07-gazmend-return-control-room.md)

# Gazmend Return Control Room - 2026-07-07

> Status: operational intake desk. This file tells the platform operator what to
> do after Gazmend submits reviewer evidence. It does not accept evidence by
> itself and does not authorize runtime.

## Classification

Classified as `documentation/external-tracker-only` because it coordinates
returned evidence handling for the standalone reviewer portal and repo evidence
register. It does not touch Interdomestik runtime, routes, auth, tenancy, schema,
RLS, billing, provider configuration, or Help Now exposure.

## Live Intake Source

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| Reviewer URL       | `https://reviewer-ecohub.vercel.app`                            |
| Protection         | App-level Basic Auth                                            |
| Credential custody | Private out-of-repo credential record only                      |
| Submission storage | Vercel Blob `submissions/{stamp}-{step}-{reviewer}/review.json` |
| Correction storage | Vercel Blob `corrections/{stamp}-{step}-{reviewer}/review.json` |
| Status endpoint    | `GET /api/status`                                               |

For a status entry, read the review JSON from:

```text
submissions/{entry.folder}/review.json
corrections/{entry.folder}/review.json
```

Do this before opening attachments.

## Portal JSON Field Checklist

The returned portal JSON must be checked at this shape:

| Field                              | Required when                               |
| ---------------------------------- | ------------------------------------------- |
| `meta.reviewerName`                | Every submission                            |
| `meta.reviewerRole`                | Every submission                            |
| `meta.reviewDate`                  | Every submission                            |
| `step.id`                          | Every submission                            |
| `reviews[itemId].decision`         | Every item                                  |
| `reviews[itemId].concreteAnswer`   | Every item                                  |
| `reviews[itemId].reason`           | Every item                                  |
| `reviews[itemId].requestedChange`  | Any `change` or `block` decision            |
| `reviews[itemId].riskCategory`     | Any `block` decision                        |
| `reviews[itemId].severity`         | Any `block` decision                        |
| `reviews[itemId].sourceCitation`   | Any step that requires source evidence      |
| `reviews[itemId].evidenceDate`     | Any step that requires source/date evidence |
| `reviews[itemId].correctionStatus` | Any step that requires correction status    |

## First Response When Gazmend Submits

1. Confirm the submitted step id:
   - expected first step: `ENT-A04`;
   - acceptable later steps: `ENT-A14`, `ENT-A05`, `ENT-A06`,
     `ENT-A02-A03`, `ENT-B04`, `ENT-B05`, `MOB02A-MEMO2-MAPPING`,
     `MOB02A-READMODEL-PROOF`.
2. Confirm reviewer identity:
   - name is present;
   - role/profession is present;
   - review date is present.
3. Confirm each item has:
   - decision;
   - concrete answer;
   - reason;
   - required source/date fields when the step requires them.
4. Check attachments metadata before reading any file.
5. If an attachment appears sensitive, do not store its contents in repo. Record
   only `evidence-center:{date}:gazmend:{artifact-type}`.
6. If sensitive material was uploaded, do not accept the row until public Blob
   custody is resolved outside repo. Request correction if the upload must be
   replaced by an evidence-center reference.
7. Classify each item through
   `docs/reviews/2026-07-07-evidence-intake-processor.md`.

## Acceptance Rules By Step

| Step                     | Accept only if                                                            | If incomplete                           | If blocked                              |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| `ENT-A04`                | MK Help Now facts have sources/dates and no unsafe copy                   | Return targeted correction per item     | Freeze `MOB-01b` gate prep              |
| `ENT-A14`                | placeholder/dark-state copy reads as intentional and honest               | Return copy-specific correction         | Keep public exposure blocked            |
| `ENT-A05`                | re-darken/correct/cache/exercise proof exists and names B6 operator/owner | Request owner/SHA/hash/exercise details | Freeze `MOB-01b` gate prep              |
| `ENT-A06`                | alert coverage has B7 owner, route, synthetic proof, and ack path         | Request instrumentation/proof details   | Mark `needs_instrumentation` or blocked |
| `ENT-A02-A03`            | fee/handler/SLA assumptions are business-approved                         | Return memo correction                  | Keep `MOB-05a`/`MOB-02` blocked         |
| `ENT-B04`                | status-sentence catalog has owner/date and accepted en/sq/mk rows         | Return catalog correction               | Keep `MOB-DG03` blocked                 |
| `ENT-B05`                | G09/SLA reconciliation defines channels, dates, fallbacks, and owners     | Return SLA correction                   | Keep `MOB-DG03` blocked                 |
| `MOB02A-MEMO2-MAPPING`   | exactly one Memo 2 display model is selected and bounded                  | Return mapping correction               | Keep `MOB-DG03` blocked                 |
| `MOB02A-READMODEL-PROOF` | read-only/no-mutation proof has platform/QA disposition                   | Return proof correction                 | Keep `MOB-DG03` blocked                 |

For `ENT-A05` or `ENT-A06`, a portal `approve` is not enough by itself. It
becomes `returned_for_correction` unless the answer names the operator/owner and
includes safe SHA, run, hash, provider, synthetic, or acknowledgement evidence,
or an explicit `needs_instrumentation` disposition.

## Mixed Item Decisions

If item decisions are mixed inside one submitted step, the step-level decision is
the most restrictive item decision:

```text
blocked > needs_instrumentation > returned_for_correction > accepted
```

Record accepted, correction, and blocked item ids separately in the operator
note and in the register `Notes` column.
