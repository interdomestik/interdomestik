---
plan_role: input
status: active
source_of_truth: false
owner: platform + product-design + qa
last_reviewed: 2026-07-10
related:
  - docs/plans/2026-07-10-rec-dg01-review-evidence-console-current-authority.md
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
---

# REC-DG02 Current Authority: Protected Reviewer Console Deployment

> Status: approved deployment operation.
> This gate does not promote an Interdomestik runtime slice.

## Approval And Classification

Arben approved the completed local console, then explicitly authorized the narrow
scope expansion needed to preserve Basic Auth and perform a production deployment.
The gate change is Tier 0 promotion/design-gate work. The external deployment is a
Tier 3 operational change because it replaces a protected production reviewer alias.

## Exact Deployment Target

| Field                  | Value                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Source root            | `tools/review-evidence-console/`                                                    |
| Approved source commit | `9b43c52872f9c58a9ce85b6261b6a91102f215f4` plus this gate's auth/deploy-only commit |
| Vercel team            | `ecohub`                                                                            |
| Project                | `interdomestik-reviewer-portal`                                                     |
| Project ID             | `prj_Yn7w7tQEAJYaALs2gL2FR9UWgHCc`                                                  |
| Deployment CLI         | Vercel CLI `48.10.2`                                                                |
| Reviewer alias         | `https://reviewer-ecohub.vercel.app`                                                |
| Rollback deployment    | `dpl_9VstoJQSfRk4hMp3KZV3XDvfv1pf`                                                  |
| Rollback URL           | `https://interdomestik-reviewer-portal-br44kd86l-ecohub.vercel.app`                 |

The repo-root Vercel link remains `interdomestik-web` and is read-only for this
operation. Only a console-root ignored `.vercel/project.json` may link the console
to the project above.

## Authorized Change

- add fail-closed edge Basic Auth middleware under the console root;
- reuse only existing project environment keys `REVIEW_PORTAL_AUTH_MODE`,
  `REVIEW_PORTAL_BASIC_USER`, and `REVIEW_PORTAL_BASIC_PASSWORD_HASH`;
- add focused middleware tests and static Vercel configuration if required;
- create one preview deployment in the existing reviewer project;
- inspect the preview build for `Ready` status and edge middleware;
- create one production deployment from the same verified source;
- assign only `reviewer-ecohub.vercel.app` if Vercel does not retain it automatically;
- retain the previous deployment as the immediate alias rollback target.

No credential value may be read, printed, copied, rotated, or committed. Missing or
invalid configuration must return `401`; there is no unauthenticated fallback.

## Deliberate Production Behavior Change

The new console is static and local-first. After alias cutover, the legacy endpoints
`/api/status`, `/api/draft`, `/api/submissions`, and `/api/handoffs` are no longer
served by the new deployment. Existing Blob data and the prior deployment are not
deleted or migrated. Rollback restores the prior API surface by reassigning the
reviewer alias to the rollback deployment.

This deployment does not make local receipts into Interdomestik runtime authority
and does not authorize uploads, Blob access, customer data, auth architecture,
tenant identity, APIs, databases, schema/RLS, billing, or product routes.

## Deployment Sequence And Stops

1. Prove middleware behavior test-first and rerun the complete console verification.
2. Confirm Vercel CLI `48.10.2`, then link only the console root to the exact
   project ID above.
3. Deploy preview without `--prod`; do not change production aliases.
4. Stop if the preview is not `Ready`, middleware is absent, project identity differs,
   credentials are missing, or any unrelated file changes.
5. Deploy the same source with `--prod` and confirm the new deployment is `Ready`.
6. Assign only the reviewer alias when necessary; preserve all other aliases.
7. On failure, reassign `reviewer-ecohub.vercel.app` to the rollback URL.

## Verification And Review

- focused middleware unit tests cover missing mode, missing credentials, malformed
  authorization, wrong user/password, valid credentials, and no secret reflection;
- `pnpm --dir tools/review-evidence-console run verify` passes;
- modularity, repo-size, diff, and security guards pass for the current head;
- Vercel inspection proves exact project, deployment target, Ready status, and edge
  middleware without fetching or exposing protected content;
- prior Gemini 3.1 Pro review approved the console with no blocker or hardening finding;
- the earlier Sonnet route remains blocked by session quota.

## Decision

`REC-DG02` authorizes only the protected reviewer-console deployment operation above.
`REC-01` remains the active non-runtime implementation slice until its separate
closeout; no Interdomestik runtime implementation is promoted.
