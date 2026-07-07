---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
related:
  - docs/reviews/2026-07-07-reviewer-portal-hardening-audit.md
  - docs/reviews/2026-07-07-reviewer-portal-vercel-deployment-record.md
  - docs/reviews/2026-07-07-evidence-intake-processor.md
  - output/review/2026-07-06-mobile-uiux-review-interface/
---

# Reviewer Portal Mock Test - 2026-07-07

> Status: local mock proof only. This test used fake data and does not accept
> evidence, close `ENT-A04`, appoint Gazmend, or authorize runtime.

## Classification

Classified as `documentation/external-tracker-only` because it validates the
standalone reviewer portal's local save/submit/status path with fake data.

## Environment

| Field       | Value                                                    |
| ----------- | -------------------------------------------------------- |
| Portal path | `output/review/2026-07-06-mobile-uiux-review-interface/` (local-only, out-of-repo — standalone reviewer portal app) |
| Command     | `PORT=4180 node server.js`                               |
| Test time   | 2026-07-07 07:16 CEST                                    |
| Data        | Fake `Mock Reviewer` / `ENT-A04` / `MK-EMERGENCY`        |

## Result

| Endpoint                | Expected                                     | Result                                                 |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `POST /api/draft`       | Save draft                                   | `200 {"ok":true,...}`                                  |
| `POST /api/submissions` | Create fake submission                       | `201 {"ok":true,"file":"submissions/.../review.json"}` |
| `GET /api/status`       | Mark `ENT-A04` complete from fake submission | `200`, `completedSteps:["ENT-A04"]`                    |

## Cleanup

The fake submission folder was deleted after the test so it cannot be mistaken
for real reviewer evidence.

The local draft file was reset to an empty draft after the test so the reviewer
does not see mock values when opening the portal.

## Verdict

The local portal save/submit/status path works for a controlled fake submission.

This does not prove Vercel Blob behavior, access control, private storage, or
real reviewer evidence handling. Those remain governed by
`docs/reviews/2026-07-07-reviewer-portal-hardening-audit.md`.

## Hardening Re-Test

After the five-agent review hardening patch, local verification also proved:

| Check                                                                        | Result                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Syntax check for portal policy, API, server, render, uploads, and middleware | Passed                                               |
| Submission without upload                                                    | `201` accepted                                       |
| Submission with upload while `REVIEW_PORTAL_ALLOW_UPLOADS` unset             | `400` rejected                                       |
| Basic Auth local server with no credentials                                  | `401`                                                |
| Basic Auth local server with wrong credentials                               | `401`                                                |
| Basic Auth local server with correct credentials                             | `200`                                                |
| Submission with upload while `REVIEW_PORTAL_ALLOW_UPLOADS=true`              | `201` accepted                                       |
| Cleanup after fake submissions                                               | Completed; `/api/status` returned no completed steps |

Local server Basic Auth uses `REVIEW_PORTAL_BASIC_PASSWORD` for local-only
testing. Vercel production uses `REVIEW_PORTAL_BASIC_PASSWORD_HASH` through
`middleware.js`.

This confirms the portal can support the internal-use decision: uploads remain
off by default, and can be enabled deliberately on a protected reviewer
deployment.

## Vercel Live Re-Test

The production alias was also smoke-tested after deployment:

| Check                          | Result                                             |
| ------------------------------ | -------------------------------------------------- |
| Reviewer URL                   | `https://reviewer-ecohub.vercel.app`               |
| Backup alias                   | `https://interdomestik-reviewer-portal.vercel.app` |
| No Basic Auth                  | `401`                                              |
| Wrong Basic Auth               | `401`                                              |
| Correct Basic Auth             | `200`                                              |
| Draft write/reset through Blob | `200` / `200`                                      |
| Fake submission with upload    | `201`                                              |
| Fake Blob cleanup              | Deleted `review.json` and uploaded `.txt`          |
| Status after cleanup           | Empty                                              |

Deployment details are recorded in
`docs/reviews/2026-07-07-reviewer-portal-vercel-deployment-record.md`.

No correction submission was live-smoked in this record. Correction UI/server
validation exists, but append-only correction storage should not be described as
smoke-tested unless a correction `POST` is recorded.
