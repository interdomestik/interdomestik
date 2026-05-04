# Deployment Workflow

Interdomestik uses a main-gated CD workflow. The legacy `production` branch workflow is
retired as of 2026-05-04 and must not be used for releases.

## Branches

| Branch | Environment               | Build Trigger                  | Purpose                                                      |
| :----- | :------------------------ | :----------------------------- | :----------------------------------------------------------- |
| `main` | Staging and production CD | Push to `main`, plus `v*` tags | Canonical release source after PR review and required gates. |

## Production Release Policy

Production deploys are driven by [.github/workflows/cd.yml](../.github/workflows/cd.yml).
The workflow builds and verifies staging first, then builds, deploys, and verifies production
from the same `main` commit SHA.

Do not create release PRs from `main` to `production`. Do not push release changes to a
`production` branch. The remote `production` branch was a legacy release-control mechanism and
is no longer part of the deployment contract.

## Release Checklist

1. Verify the candidate PR passes the required gates before merge:
   - `pnpm pr:verify`
   - `pnpm security:guard`
   - `pnpm e2e:gate`
2. Merge the reviewed PR into `main`.
3. Monitor the `CD` workflow for the `main` SHA.
4. Confirm staging verification passes before production promotion.
5. Confirm production verification artifacts are uploaded by the workflow.

## Required Controls

Configure release controls on `main`, not on a legacy `production` branch:

- Require pull request review before merging.
- Require required status checks before merging.
- Require the mandatory verification gates listed above.
- Restrict direct pushes according to repository policy.
- Keep GitHub environment approvals and secrets attached to the `staging` and `production`
  environments used by the CD workflow.
