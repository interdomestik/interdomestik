---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-09
---

# D04 Gitleaks Blocking Evidence

> Status: Active supporting input. This document records the code and verification evidence for `D04` blocking `gitleaks` coverage inside `P-1` Infrastructure Debt Closure.

## Scope

`D04` required one narrow outcome:

- make `gitleaks` a deterministic blocking requirement on the active pull-request and mainline security surfaces, without keeping duplicate or contradictory workflow ownership

## Code Evidence

- the dedicated secret-scan workflow is now the sole canonical `gitleaks` owner across PRs, pushes, scheduled weekly security scans, and manual dispatches in [.github/workflows/secret-scan.yml](../../.github/workflows/secret-scan.yml)
- the general security workflow now stays focused on `pnpm-audit` and no longer carries a second partially-disabled `gitleaks` path in [.github/workflows/security.yml](../../.github/workflows/security.yml)
- workflow contract coverage now locks the single-owner model, the PR/mainline trigger surface, and the absence of duplicate `gitleaks` steps in [scripts/ci/workflow-contracts.test.mjs](../../scripts/ci/workflow-contracts.test.mjs)

## Red-Green Evidence

The initial red contract run on 2026-03-09 was:

- `pnpm test:ci:contracts`

That red run failed for the expected reason:

- `scripts/ci/workflow-contracts.test.mjs` asserted that `Secret Scan` must be the sole blocking `gitleaks` workflow, but `.github/workflows/security.yml` still contained a second `gitleaks` install/run/upload sequence gated off only for pull requests

After moving the weekly schedule onto `Secret Scan` and removing the duplicate `gitleaks` path from `Security`, the following green checks passed:

- `pnpm test:ci:contracts`
- `pnpm security:guard`
- `pnpm plan:status`
- `pnpm plan:audit`

## Notes

- this slice intentionally preserves the existing required `gitleaks` check name while removing duplicate workflow ownership underneath it
- the weekly schedule moved with the canonical secret-scan workflow so mainline scheduled coverage remains intact after the duplication cleanup
- the `Security` workflow still provides the `pnpm-audit` gate; `D04` only narrows the secret-scan ownership boundary

## Conclusion

`D04` is complete for code and local verification evidence.

The remaining live `P-1` queue is now `D05` through `D08`.
