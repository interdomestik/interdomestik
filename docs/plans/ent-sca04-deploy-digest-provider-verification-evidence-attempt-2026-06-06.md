---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-SCA04 Deploy Digest Provider Verification Evidence Attempt - 2026-06-06

> Status: Blocked evidence record. This records the first provider-evidence attempt after
> `ENT-SCA03`. It does not change deploy configuration, trigger production deployment, expose
> credentials, or claim deployed-digest equality.

## Identity

- Slice id: `ENT-SCA04`
- Predecessor: `ENT-SCA03 Deploy Digest Verification Boundary`
- Commit inspected: `f0fedf27199007a98c3694a21775ebaca30905b8`
- Inspection time: `2026-06-06T09:45:17Z`
- Latest CD run inspected:
  [27058913038](https://github.com/interdomestik/interdomestik/actions/runs/27058913038)
- Provider status inspected: GitHub deployments API, GitHub commit statuses, GitHub check runs, and
  Vercel commit status
- Executed by: Codex repo operator
- Decision owner: platform
- Production traffic affected: no

## Method

This attempt inspected read-only provider metadata for the latest merged `main` commit that promoted
`ENT-SCA04`. No workflow was rerun, no deployment was triggered, no credential was changed, and no
provider secret or webhook payload was printed into this record.

Commands used:

```bash
gh run list --workflow cd.yml --limit 10 \
  --json databaseId,displayTitle,headBranch,headSha,status,conclusion,event,createdAt,updatedAt,url

gh run view 27058913038 \
  --json databaseId,displayTitle,headSha,status,conclusion,event,createdAt,updatedAt,url,jobs

gh api repos/interdomestik/interdomestik/actions/runs/27058913038/artifacts \
  --jq '{total_count, artifacts:[.artifacts[] | {id,name,expired,created_at,updated_at,size_in_bytes}]}'

gh api 'repos/interdomestik/interdomestik/deployments?sha=f0fedf27199007a98c3694a21775ebaca30905b8&per_page=20'

gh api repos/interdomestik/interdomestik/commits/f0fedf27199007a98c3694a21775ebaca30905b8/status

gh api repos/interdomestik/interdomestik/commits/f0fedf27199007a98c3694a21775ebaca30905b8/check-runs
```

## Provider Evidence Observed

| Source                    | Observation                                                                             | Digest evidence |
| ------------------------- | --------------------------------------------------------------------------------------- | --------------- |
| GitHub CD workflow        | Run `27058913038` for commit `f0fedf27` was `pending`; `jobs` was empty.                | Not available   |
| GitHub workflow artifacts | Run `27058913038` had `total_count: 0` artifacts.                                       | Not available   |
| GitHub run logs           | Logs were unavailable because the run was still in progress.                            | Not available   |
| GitHub deployments API    | Deployment query for commit `f0fedf27` returned `[]`.                                   | Not available   |
| GitHub commit status      | Vercel reported `success` with description `Canceled by Ignored Build Step`.            | Not available   |
| GitHub check runs         | CI/Sonar/CodeQL checks were visible, but none exposed a deployed provider image digest. | Not available   |

The inspected provider metadata did not contain a provider-returned `image_digest`, runtime OCI
digest, deploy webhook response body, or deployment record that could be compared with the
build-attested digest from `ENT-SCA03`.

## Result

- Decision: blocked
- Blocking findings:
  - The latest CD run had not produced jobs, logs, or artifacts at inspection time.
  - GitHub deployments for the inspected commit were empty.
  - The visible Vercel provider status was an ignored-build cancellation, not a deploy record.
  - No provider-returned running image digest was available to compare against the build-attested
    digest.
- Non-blocking findings:
  - `ENT-SCA03` already configured the repo-side deploy boundary to carry and compare immutable
    image digests when the provider returns them.
  - This attempt did not simulate digest equality with a tag, commit SHA, or Vercel ignored-build
    status.
  - No production deploy, credential mutation, webhook mutation, runtime change, route/auth/tenancy
    change, schema change, or product UI change was made.

## Acceptance Criteria Disposition

| Requirement                                           | ENT-SCA04 disposition                                           |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| Inspect latest available non-production deploy proof  | Attempted; no non-production deployment digest proof was found. |
| Record provider-returned running image digest         | Blocked; no provider digest evidence was available.             |
| Compare provider digest to build-attested digest      | Blocked; comparison cannot run without provider digest.         |
| Avoid production deploys and credential changes       | Satisfied.                                                      |
| Avoid simulated digest equality                       | Satisfied.                                                      |
| Avoid runtime, auth, tenancy, routing, UI, and schema | Satisfied; only docs/register evidence changed.                 |

## Residual Risk

Supply-chain attestation is still not complete for enterprise production readiness. The repo can
build, attest, pass a digest through the deploy boundary, and fail closed when the provider response
does not return an expected digest, but current evidence does not prove that a live provider
deployment returned the real running image digest.

## Required Provider Follow-Up

A future provider-backed proof must capture a successful staging or otherwise isolated
non-production deployment where the deploy provider or webhook returns the running image digest. The
record must include the CD run id, commit SHA, expected build-attested digest, provider-returned
digest, comparison result, pass/fail decision, and owner sign-off without exposing secrets, webhook
tokens, raw logs containing credentials, customer data, or production-only deployment controls.

## Next Repo-Owned Enterprise Slice

While provider-side deploy digest evidence is blocked, the next repo-owned enterprise-hardening
slice should move to the remaining unscoped alerting gap:

`ENT-ALERT06 Auth RLS Protected Route Alert Coverage Evidence Contract`

That slice should define the evidence contract for auth, RLS or tenant-boundary, and protected-route
failure-mode alert coverage. It should not mutate Sentry, traffic, production telemetry, auth,
tenancy, routing, runtime code, product UI, schema, proxy, README, AGENTS, or broad architecture
docs.
