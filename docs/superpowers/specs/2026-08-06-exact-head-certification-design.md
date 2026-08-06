# Exact-Head Certification Design

**Status:** Approved direction for PR2  
**Base:** `f4b39fc4f7fed7e875363807faea11cc2c4cf717`  
**Scope:** GitHub PR verification only

## Problem

The repository already gives draft pull requests a fast lane, but a ready PR
returns to the full lane on every `synchronize` event. A small remediation then
repeats the full browser, unit, security, and finalizer cycle even when only one
surface changed. That made the last UI slice substantially slower than its code
change justified.

## Decision

Keep focused evidence during development and make broad CI certification an
explicit exact-head transition. GitHub's required `e2e` check remains the
fail-closed merge authority; no new receipt service or cache platform is added.

The shared policy uses this state table:

| PR event/state                                      | Ordinary code             | High-risk code            | Required `e2e` result                        |
| --------------------------------------------------- | ------------------------- | ------------------------- | -------------------------------------------- |
| Draft open or synchronize                           | Fast lane                 | Full lane                 | Green when selected lane passes              |
| Opened ready, reopened ready, or `ready_for_review` | Full lane                 | Full lane                 | Green only after full lane                   |
| Ready PR receives a new commit                      | Certification required    | Full lane                 | Ordinary code fails closed until recertified |
| `full-gate` label is newly applied                  | Full lane                 | Full lane                 | Green only after full lane                   |
| Non-product-only change                             | Existing lightweight lane | Existing lightweight lane | Green without browser work                   |

`full-gate` is the existing manual recertification control and becomes a
one-shot command. On its `labeled` event, PR E2E records the event identity and
removes the label with the narrow `pull-requests: write` permission. If label
consumption fails, the required `e2e` context fails. To certify a later head,
apply the label again.

## Exact-head invariant

The full E2E runner checks out `pull_request.head.sha`, emits evidence containing
that SHA, and completes the required `e2e` context on that commit. Any later
commit receives a new required-check identity. For ordinary ready code, its
`synchronize` run returns a deliberate non-pass with the instruction to apply
`full-gate`; evidence from the earlier SHA cannot satisfy the new head.

High-risk paths retain the current conservative behavior and run the full lane
on every change. The one-shot label prevents it from masking risk on a later
event. If GitHub leaves the label present despite the attempted removal, the
existing pinned policy conservatively keeps running full; it never downgrades a
high-risk or incomplete change. Unknown PR state, incomplete changed-file
evidence, workflow, security, authentication, tenant, billing, database,
privacy, and AI changes remain fail-closed.

Manual `workflow_dispatch` is removed from PR E2E because it can publish the
same required `e2e` context without running the complete PR certification
transition. Certification is supported only for branches in this repository.
For a fork, a maintainer must first review the changes and create a same-repo
branch; secrets are never exposed to fork workflows.

## Implementation boundary

PR2 changes only:

- workflow admission around the existing shared policy outputs;
- workflow contract tests;
- the `e2e` wrapper's certification-required verdict;
- fail-closed one-shot consumption of the `full-gate` label;
- the five trusted action pins and required parity digests;
- concise operator documentation for the recertification action.

All five callers are pinned atomically to the already merged PR1 policy commit
`f4b39fc4f7fed7e875363807faea11cc2c4cf717`. PR2 does not self-pin to an
unmerged commit and therefore remains safe under the repository's squash-only,
delete-branch merge model.

PR2 does not change product code, deployment, databases, Docker, Z620/M6,
branch protection, security scanners, Sonar, CodeQL, or finalizer authority. It
does not add dependencies or persist CI evidence outside existing artifacts.

## Verification

TDD must prove at least:

1. draft ordinary synchronization remains fast;
2. the first ready transition runs full;
3. an ordinary ready-head synchronization requires recertification;
4. a newly applied `full-gate` label runs full;
5. the `full-gate` label is consumed once and removal failure is non-pass;
6. high-risk and incomplete evidence still run full;
7. non-product-only changes keep their lightweight exception;
8. the required `e2e` wrapper fails only for certification-required code;
9. all five callers use the immutable merged PR1 policy commit;
10. manual dispatch cannot publish a colliding `e2e` context;
11. fork PRs cannot enter secret-dependent certification;
12. existing exact-head E2E artifacts and required contexts remain intact.

Run dependency-free focused contracts first. The PR receives one exact-head
full CI cycle under the current conservative policy. After merge, exact-main
health is verified once and automatic CD is contained as before.

## Rollback

Revert PR2. The previous policy resumes full validation for every ready PR
event. No stored data, product state, or external runner state requires
migration or cleanup.

## First real-slice measurement

The next ordinary product slice records:

- elapsed time from authorized coding start to merge;
- time to first focused feedback;
- count and duration of full E2E runs;
- count of commits after the first certification;
- Z620 focused evidence used, if any;
- Mac free-space delta and whether Mac Docker was used.

Success means one full exact-head certification for an unchanged final head,
focused reruns only after bounded findings, no Mac heavy lane, and no loss of
required merge authority.
