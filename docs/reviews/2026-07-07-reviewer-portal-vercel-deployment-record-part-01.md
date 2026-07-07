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

# Reviewer Portal Vercel Deployment Record - 2026-07-07 - Part 1

Back to index: [2026-07-07-reviewer-portal-vercel-deployment-record.md](./2026-07-07-reviewer-portal-vercel-deployment-record.md)

# Reviewer Portal Vercel Deployment Record - 2026-07-07

> Status: internal reviewer portal deployment record. This does not authorize
> Interdomestik launch, runtime exposure, `MOB-01b`, billing, routing, auth,
> tenancy, or public Help Now.

## Deployment

| Field                        | Value                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Project                      | `interdomestik-reviewer-portal`                                                        |
| Scope                        | `ecohub` / `Eco`                                                                       |
| Production URL for reviewers | `https://reviewer-ecohub.vercel.app`                                                   |
| Backup production alias      | `https://interdomestik-reviewer-portal.vercel.app`                                     |
| Latest deployment            | `interdomestik-reviewer-portal-ma6w2jsvh-ecohub.vercel.app`                            |
| Inspector                    | `https://vercel.com/ecohub/interdomestik-reviewer-portal/Dr1ycMQ4CYvYFvViSdRS4XH3nQH8` |
| Blob store                   | `interdomestik-reviewer-portal-linked` / `store_ShkihX47TikF4rWE`                      |
| Blob region                  | `fra1`                                                                                 |
| Blob access mode             | `public`                                                                               |

## Access Model

The production reviewer URL is protected by app-level Basic Auth through
`middleware.js`.

Credential handling:

- username is configured in Vercel as `REVIEW_PORTAL_BASIC_USER`;
- only the SHA-256 password hash is configured in Vercel as
  `REVIEW_PORTAL_BASIC_PASSWORD_HASH`;
- the generated password is not stored in this repo;
- the local credential handoff file is
  `/Users/arbenlila/.codex/interdomestik-reviewer-portal-credentials-2026-07-07.txt`.

Vercel Authentication was disabled for this project after confirming app-level
Basic Auth protects the reviewer aliases. This allows Gazmend to use the short
reviewer URL without joining the Vercel team.

## Environment

Production and preview have:

```text
REVIEW_PORTAL_AUTH_MODE=basic
REVIEW_PORTAL_BASIC_USER=<configured>
REVIEW_PORTAL_BASIC_PASSWORD_HASH=<configured>
REVIEW_PORTAL_ALLOW_UPLOADS=true
REVIEW_PORTAL_MAX_ATTACHMENT_BYTES=5242880
REVIEW_PORTAL_MAX_ATTACHMENTS_PER_ITEM=3
REVIEW_PORTAL_MAX_ATTACHMENTS=10
REVIEW_PORTAL_MAX_TOTAL_ATTACHMENT_BYTES=10485760
REVIEW_PORTAL_ALLOWED_MIME_TYPES=application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown
BLOB_STORE_ID=store_ShkihX47TikF4rWE
BLOB_READ_WRITE_TOKEN=<Vercel-managed>
```

## Live Smoke Test

Run time: 2026-07-07 08:09 CEST.

| Check                                                                     | Result                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /api/status` without auth on `reviewer-ecohub.vercel.app`            | `401`                                                  |
| `GET /api/status` with wrong Basic Auth on `reviewer-ecohub.vercel.app`   | `401`                                                  |
| `GET /api/status` with correct Basic Auth on `reviewer-ecohub.vercel.app` | `200`                                                  |
| `POST /api/draft` fake write                                              | `200`                                                  |
| `POST /api/draft` reset                                                   | `200`                                                  |
| `POST /api/submissions` fake submission with text upload                  | `201`                                                  |
| `GET /api/status` after fake submission                                   | contained `SMOKE-ENT-A04`                              |
| Blob cleanup                                                              | deleted fake `review.json` plus fake uploaded `.txt`   |
| `GET /api/status` after cleanup                                           | empty `completedSteps`, `entries`, `correctionEntries` |

## KS-FUTURE Unlock Patch

Run time: 2026-07-07 evening CEST.

Reason: Arben could authenticate and open the portal, but `KS-FUTURE` did not
open because the module still carried `lockedReason`. That prevented even the
intended preliminary platform input for Kosovo.

Change:

- removed `lockedReason` from `KS-FUTURE`;
- kept `AL-BLOCKED` locked;
- strengthened copy that `KS-FUTURE` is only preliminary input by Arben;
- preserved the boundary that it is not KS sign-off, not country L2 authority,
  not launch evidence, not coverage, and does not replace Shkumbin as real KS
  reviewer/CEO.

Deployment:

- deployed production URL:
  `https://interdomestik-reviewer-portal-bmq1yc728-ecohub.vercel.app`;
- manually assigned alias:
  `https://reviewer-ecohub.vercel.app`.

Verification:

| Check                                                             | Result                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /` with Basic Auth on `reviewer-ecohub.vercel.app`           | `200`                                                                 |
| `GET /api/status` with Basic Auth on `reviewer-ecohub.vercel.app` | `200`                                                                 |
| `GET /modules.js` with Basic Auth on `reviewer-ecohub.vercel.app` | `KS-FUTURE` no longer has `lockedReason`; `AL-BLOCKED` remains locked |
| Existing evidence status                                          | `12` submissions, `0` corrections                                     |
