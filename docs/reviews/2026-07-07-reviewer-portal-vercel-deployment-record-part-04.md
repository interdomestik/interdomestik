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

# Reviewer Portal Vercel Deployment Record - 2026-07-07 - Part 4

> Status: Non-authoritative support document.

Back to index: [2026-07-07-reviewer-portal-vercel-deployment-record.md](./2026-07-07-reviewer-portal-vercel-deployment-record.md)

## State Save And Restore Test Patch

Run time: 2026-07-07 evening CEST.

Reason: During Memo correction upload, the reviewer could not see clearly that
the document was saved/linked, and after refresh the UI could restore the
correction selector without restoring the visible active item. This made the
portal feel frozen or unresponsive.

Change:

- attachment hints now show document name and size after `Ruaj`;
- `localStorage` stores attachment metadata only, never base64 payloads;
- server draft restore merges local attachment metadata instead of losing it;
- correction-mode refresh now restores the active step and active item from the
  correction selectors;
- if a page is refreshed after choosing a file, the UI explains that the
  browser restored only the filename and the reviewer must select the PDF again
  before final submission.

Local browser test:

| Check                                      | Result                                                       |
| ------------------------------------------ | ------------------------------------------------------------ |
| `ENT-A02-A03` correction item after `Ruaj` | stayed on `MEMO1-FINANCE`                                    |
| Attachment hint after `Ruaj`               | showed filename and size                                     |
| `localStorage` after attach                | no PDF/base64 payload                                        |
| Refresh restore                            | restored correction mode, `ENT-A02-A03`, and `MEMO1-FINANCE` |
| Refresh hint                               | showed filename plus reselect-file instruction               |
| Console errors                             | none                                                         |

Deployment:

- deployed production URL:
  `https://interdomestik-reviewer-portal-ma6w2jsvh-ecohub.vercel.app`;
- manually assigned alias:
  `https://reviewer-ecohub.vercel.app`.

Verification:

| Check                             | Result                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| `GET /app.js` with Basic Auth     | contains state merge, active correction restore, and reselect guard |
| `GET /uploads.js` with Basic Auth | contains visible attachment name/size hint                          |
| `GET /api/status` with Basic Auth | `200`                                                               |
| Runtime/app platform touched      | No; standalone reviewer portal output only                          |

## Reviewer Safety Instruction

Uploads are enabled for internal convenience only. Do not upload secrets,
credentials, tokens, private-channel URLs, raw member IDs, raw claim IDs, raw
document IDs, payment identifiers, bank/card details, unredacted identity data,
or private legal/financial documents. For those, write an evidence-center
reference instead.

Because Blob access mode is public, even low-sensitivity uploads must be treated
as externally retrievable custody objects. Sensitive evidence must be referenced
by evidence-center id only, not uploaded, pasted into review JSON, or copied into
repo artifacts.

## Authority Boundary

Returned portal evidence must still be processed through
`docs/reviews/2026-07-07-evidence-intake-processor.md`.

A completed reviewer submission can inform `MOB-DG01B`, but it cannot self-close
`ENT-A04`, self-promote `MOB-01b`, or authorize launch.
