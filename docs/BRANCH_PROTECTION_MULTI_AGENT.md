# Branch Protection: Multi-Agent Required Checks

Use this for the `main` branch protection rule in GitHub.

## Required status checks

Add these exact checks:

1. `CI / multi-agent-dry-run`
2. `Pilot Gate / Multi-Agent PR Hardening + Merge Gate`

## Where they come from

1. `.github/workflows/ci.yml` job: `multi-agent-dry-run`
2. `.github/workflows/pilot-gate.yml` job name: `Multi-Agent PR Hardening + Merge Gate`

## GitHub setup

1. Go to `Settings` -> `Branches`.
2. Create or edit the protection rule for `main`.
3. Enable `Require a pull request before merging`.
4. Enable `Require status checks to pass before merging`.
5. Enable `Require branches to be up to date before merging` (recommended).
6. Add the two required checks listed above.
7. Save changes.

## Validation

1. Open a PR to `main`.
2. Confirm both checks appear in the PR Checks tab.
3. Confirm merge stays blocked until both checks pass.

If check names ever change after workflow/job renaming, use the exact names shown in a successful PR run and update this document.
