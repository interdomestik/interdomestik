---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
related:
  - output/review/2026-07-06-mobile-uiux-review-interface/
  - docs/reviews/2026-07-07-evidence-intake-processor.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-07-reviewer-portal-vercel-deployment-record.md
---

# Reviewer Portal Hardening Audit

> Status: hardening audit plus deployment readiness record. This audit does not
> accept reviewer evidence or authorize runtime.

## Classification

Classified as `documentation/external-tracker-only` because it audits the
standalone reviewer portal artifact under `output/review/`. It does not touch
Interdomestik runtime code, auth, tenancy, routes, schema, billing, or public
Help Now exposure.

## Current Portal Surface

| Area                 | Current evidence                                | Assessment                                                                                                                                                                 |
| -------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Albanian UI          | `index.html`, `modules.js`, `styles.css`        | Good enough for Gazmend-oriented review                                                                                                                                    |
| Sequential modules   | `WORKFLOW` in `modules.js`; locked future steps | Present                                                                                                                                                                    |
| Reviewer identity    | name, role, date                                | Present; no email required                                                                                                                                                 |
| Autosave             | local storage plus `/api/draft`                 | Present                                                                                                                                                                    |
| Server persistence   | local `server.js`; Vercel API handlers          | Present                                                                                                                                                                    |
| Upload support       | `uploads.js`, file field, submission storage    | Present with 5 MiB default per-file client/server policy; deployed env allows 5 MiB per attachment, 3 per item, 10 total, 10 MiB total, MIME/extension checked server-side |
| Corrections          | correction mode plus `corrections/` path        | Present                                                                                                                                                                    |
| Status colors        | item/module state classes                       | Present                                                                                                                                                                    |
| Evidence safety copy | visible runtime/no-launch warnings              | Present                                                                                                                                                                    |

## High-Value Hardening Before Real Remote Use

| Priority | Issue                                                                                        | Why it matters                                                        | Recommended action                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Local Vercel env files under the portal output tree may contain token material               | Secret material can be copied into evidence or accidentally committed | Keep `.vercel` and `.env*.local` out of repo/evidence packets, rotate any exposed token, and document only custody/rotation result, never the value |
| P1       | Blob attachments use public access in Vercel handlers                                        | Reviewer uploads could contain sensitive business/legal docs          | Before real sensitive docs, use private storage or require evidence-center refs instead of uploads                                                  |
| Resolved | App-level Basic Auth is active on reviewer aliases                                           | Vercel team auth is disabled, but middleware enforces Basic Auth      | Keep credentials outside repo, rotate after review, and do not share the alias without credentials                                                  |
| Resolved | Server-side attachment count/type/size policy exists                                         | Vercel handler calls portal policy validation                         | Keep public Blob custody limitation documented; do not allow sensitive uploads                                                                      |
| P2       | `app.js`, `modules.js`, `render.js`, `server.js` exceed the repo's preferred modularity size | Reviewability is lower                                                | Split in a later cleanup if this portal becomes long-lived                                                                                          |
| P2       | Submission acceptance remains manual                                                         | Correct by design, but needs processor discipline                     | Use `2026-07-07-evidence-intake-processor.md` for every return                                                                                      |
| P2       | No end-to-end mock evidence record checked into repo                                         | Harder to prove path before Gazmend starts                            | Run a local mock test with fake data and record result                                                                                              |
| P3       | No deployment runbook                                                                        | Vercel setup can be inconsistent                                      | Add deployment notes only when deployment is requested                                                                                              |

## Mock Test Status

Local mock proof is recorded in
`docs/reviews/2026-07-07-reviewer-portal-mock-test.md`.

The local save/submit/status path passed with fake data. The fake submission was
deleted after the test and the local draft was reset to an empty draft.

## Five-Agent Review Status

The parallel five-agent review is recorded in
`docs/reviews/2026-07-07-five-agent-reviewer-portal-findings.md`.

Integrated hardening after that review:

- uploads are server-rejected by default unless `REVIEW_PORTAL_ALLOW_UPLOADS=true`;
- Vercel `middleware.js` can enforce Basic Auth when
  `REVIEW_PORTAL_AUTH_MODE=basic`;
- upload UI copy now warns against sensitive documents;
- item status now has text labels, not only colors.

## What Is Safe To Use Now

The portal is safe for a controlled mock test and for low-sensitivity structured
review if the reviewer avoids uploading private documents. For real documents,
the safer instruction is:

```text
Upload only non-sensitive support files. For legal, financial, private-channel,
or identity-sensitive evidence, write an evidence-center reference instead of
uploading the document.
```

## Ready/Not Ready Verdict

| Use case                                                              | Verdict                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Local mock test                                                       | Ready                                                                                          |
| Controlled Gazmend review without sensitive uploads                   | Ready on the Basic Auth production alias                                                       |
| Basic Auth protected public Vercel alias with low-sensitivity uploads | Ready for internal low-sensitivity uploads; public Blob remains an explicit custody limitation |
| Unauthenticated public Vercel URL with uploads                        | Not ready without auth/storage hardening                                                       |
| Runtime launch authority                                              | Not applicable                                                                                 |

## Acceptance Before Sharing With Gazmend

Before sending the live URL:

1. Confirm whether uploads are allowed or whether sensitive docs must stay in an
   external evidence center. Current decision: uploads are enabled for
   low-sensitivity internal support files only.
2. Confirm access model: app-level Basic Auth on the production alias.
3. Run one fake submission for `ENT-A04`. Done on 2026-07-07.
4. Confirm `/api/status` marks the step completed. Done during live smoke.
5. Clean up fake live smoke evidence. Done during live smoke.
6. Confirm the submission can be processed through
   `docs/reviews/2026-07-07-evidence-intake-processor.md`.

## Stop Conditions

Do not use the portal for real reviewer evidence if:

- it is deployed publicly without access control;
- reviewers may upload sensitive docs into public blob storage without an
  explicit internal-risk decision;
- a submission cannot be retrieved after save;
- autosave fails repeatedly and the reviewer may lose work;
- the portal text implies launch approval.
