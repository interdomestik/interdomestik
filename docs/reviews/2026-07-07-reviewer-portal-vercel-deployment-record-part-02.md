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

# Reviewer Portal Vercel Deployment Record - 2026-07-07 - Part 2

> Status: Non-authoritative support document.

Back to index: [2026-07-07-reviewer-portal-vercel-deployment-record.md](./2026-07-07-reviewer-portal-vercel-deployment-record.md)

## Internal Export Endpoint Patch

Run time: 2026-07-07 evening CEST.

Reason: `/api/status` intentionally returns only metadata. After reviewer
submissions arrived, the platform operator needed a Basic-Auth-protected way to
read complete portal responses for evidence intake without exposing raw answers
in the UI or copying private payloads into repo documents.

Change:

- added `GET /api/export`;
- supports `latestOnly=1` to read the latest submission per step;
- supports optional `stepId=...` filtering;
- returns safe Blob path references, reviewer metadata, decisions, and review
  fields for internal intake;
- keeps existing app-level Basic Auth protection through `middleware.js`.

Deployment:

- deployed production URL:
  `https://interdomestik-reviewer-portal-o4otluil7-ecohub.vercel.app`;
- manually assigned alias:
  `https://reviewer-ecohub.vercel.app`.

Verification:

| Check                                          | Result                                     |
| ---------------------------------------------- | ------------------------------------------ |
| `GET /api/export?latestOnly=1` with Basic Auth | `200`                                      |
| Latest submissions returned                    | `7` steps                                  |
| Correction submissions returned                | `0`                                        |
| Runtime/app platform touched                   | No; standalone reviewer portal output only |

## Completed-Step Navigation And Upload Patch

Run time: 2026-07-07 evening CEST.

Reason: After `ENT-A05` and `ENT-A06` were submitted once, the portal showed
them as completed but the click handler still blocked reopening them. This
prevented the reviewer/operator from adding correction evidence such as PDF
proof after the initial submission.

Change:

- completed, non-locked steps can be opened again;
- correction mode can open any non-locked step;
- file picker now shows selected files immediately before submit;
- DOC/DOCX are accepted in addition to PDF/images/TXT/MD;
- correction instructions now explain that post-submission proof for `ENT-A05`
  or `ENT-A06` should be added through `Korrigjim pas dorëzimit`.

Deployment:

- deployed production URL:
  `https://interdomestik-reviewer-portal-kbjqq3ama-ecohub.vercel.app`;
- manually assigned alias:
  `https://reviewer-ecohub.vercel.app`.

Verification:

| Check                                          | Result                                     |
| ---------------------------------------------- | ------------------------------------------ |
| `GET /app.js` with Basic Auth                  | contains completed-step reopen guard       |
| `GET /api/status` with Basic Auth              | `200`                                      |
| `GET /api/export?latestOnly=1` with Basic Auth | `200`                                      |
| Runtime/app platform touched                   | No; standalone reviewer portal output only |

## Attachment Freeze Patch

Run time: 2026-07-07 evening CEST.

Reason: When a reviewer selected a PDF and clicked `Ruaj`, the browser could
freeze because the PDF was converted to base64 and stored in `localStorage` as
part of the draft state. That made the synchronous browser write too large and
slow.

Change:

- attachment payloads are kept only in memory until final submit;
- draft/localStorage/server autosave now stores attachment metadata only;
- stale base64 attachment payloads are stripped from existing local state on
  page load;
- client upload limit is set to `3 MB` to stay below JSON/base64 request-size
  limits;
- larger PDFs should be compressed or referenced through the evidence center.

Deployment:

- deployed production URL:
  `https://interdomestik-reviewer-portal-ckkntpyrx-ecohub.vercel.app`;
- manually assigned alias:
  `https://reviewer-ecohub.vercel.app`.

Verification:

| Check                             | Result                                                      |
| --------------------------------- | ----------------------------------------------------------- |
| `GET /app.js` with Basic Auth     | contains `pendingAttachments` and metadata-only persistence |
| `GET /uploads.js` with Basic Auth | contains `3 MB` client limit                                |
| `GET /api/status` with Basic Auth | `200`                                                       |
| Runtime/app platform touched      | No; standalone reviewer portal output only                  |
