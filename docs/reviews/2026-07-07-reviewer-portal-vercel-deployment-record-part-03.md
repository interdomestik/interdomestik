---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
related:
  - docs/reviews/2026-07-07-reviewer-portal-hardening-audit.md
  - docs/reviews/2026-07-07-reviewer-portal-mock-test.md
  - docs/reviews/2026-07-07-five-agent-reviewer-portal-findings.md
  - output/review/2026-07-06-mobile-uiux-review-interface/
---

# Reviewer Portal Vercel Deployment Record - 2026-07-07 - Part 3

> Status: Non-authoritative support document.

Back to index: [2026-07-07-reviewer-portal-vercel-deployment-record.md](./2026-07-07-reviewer-portal-vercel-deployment-record.md)

## Simplified Correction Flow Patch

Run time: 2026-07-07 evening CEST.

Reason: The post-submission correction flow was too easy to operate wrongly:
reviewers could attach Memo 1 / Memo 2 to the draft but remain in initial-review
mode, so the final click did not create a `corrections/` revision. This caused
reviewer frustration and made the evidence lane slower than necessary.

Change:

- when a completed, non-locked step is opened, the portal automatically enters
  `Korrigjim pas dorëzimit`;
- the portal auto-selects the completed step/item as the correction target;
- the previous evidence reference is filled from the latest submission for that
  step;
- correction reason and impact receive conservative defaults;
- in correction mode, `Ruaj dhe vazhdo` becomes `Ruaj këtë korrigjim tani` and
  attempts to submit the revision directly;
- the separate final revision button remains available as a fallback.

Deployment:

- deployed production URL:
  `https://interdomestik-reviewer-portal-c2hin0ux5-ecohub.vercel.app`;
- manually assigned alias:
  `https://reviewer-ecohub.vercel.app`.

Verification:

| Check                             | Result                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| Local browser smoke test          | completed step opens in correction mode with `ENT-A02-A03` selected |
| Local browser smoke test          | item submit button changes to `Ruaj këtë korrigjim tani`            |
| `GET /app.js` with Basic Auth     | contains `enterCorrectionMode` and direct correction submit text    |
| `GET /render.js` with Basic Auth  | contains `Ruaj këtë korrigjim tani`                                 |
| `GET /api/status` with Basic Auth | `200`; current corrections still `0` before reviewer re-submit      |
| Runtime/app platform touched      | No; standalone reviewer portal output only                          |

## Memo Route Guard Patch

Run time: 2026-07-07 evening CEST.

Reason: A Memo 2 PDF was submitted under `ENT-A06` instead of `ENT-A02-A03`.
That creates evidence custody, but not the correct memo-signature intake row.

Change:

- file names that look like Memo 1/Memo 2, handler, SLA, fee, finance, cost,
  tariff, or kosto are blocked unless the active step is `ENT-A02-A03`;
- file names that look like hotfix/re-darken proof are blocked unless the active
  step is `ENT-A05`;
- file names that look like alert/synthetic/ack proof are blocked unless the
  active step is `ENT-A06`;
- submit now has an `isSubmitting` guard and disables the submit button while
  saving to reduce duplicate submissions.

Deployment:

- deployed production URL:
  `https://interdomestik-reviewer-portal-7gkfpr0g8-ecohub.vercel.app`;
- manually assigned alias:
  `https://reviewer-ecohub.vercel.app`.

Verification:

| Check                             | Result                                      |
| --------------------------------- | ------------------------------------------- |
| `GET /uploads.js` with Basic Auth | contains Memo route guard for `ENT-A02-A03` |
| `GET /app.js` with Basic Auth     | contains submit duplicate guard             |
| `GET /api/status` with Basic Auth | `200`                                       |
| Runtime/app platform touched      | No; standalone reviewer portal output only  |

## Correction Item Save Patch

Run time: 2026-07-07 evening CEST.

Reason: In correction mode, `Ruaj dhe vazhdo` attached the document to the
selected correction item and then advanced the active UI to the next item. The
final correction submit only sends one item, so the later submit could miss the
item that actually carried the attachment.

Change:

- correction mode now resolves the submission target from `Hapi që korrigjohet`
  and `Item-i që korrigjohet`;
- `Ruaj dhe vazhdo` in correction mode attaches the document and stays on the
  selected correction item instead of moving to the next item;
- the reviewer gets a direct message to click `Ruaj korrigjimin si revision të
ri` after the document is linked;
- submit button text is restored after failed submissions.

Deployment:

- deployed production URL:
  `https://interdomestik-reviewer-portal-dwe5fymbj-ecohub.vercel.app`;
- manually assigned alias:
  `https://reviewer-ecohub.vercel.app`.

Verification:

| Check                             | Result                                                                   |
| --------------------------------- | ------------------------------------------------------------------------ |
| `GET /app.js` with Basic Auth     | contains `submissionStep`, `submissionItem`, and correction-stay message |
| `GET /api/status` with Basic Auth | `200`                                                                    |
| Runtime/app platform touched      | No; standalone reviewer portal output only                               |
