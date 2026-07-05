---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/reviews/2026-07-05-week1-execution-packet.md
  - docs/reviews/2026-07-05-week1-human-action-packet.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
  - docs/plans/2026-07-05-b2-staging-rbac-residual-check.md
  - docs/plans/2026-07-05-rbac-01-current-authority.md
---

# Nine-Step Enterprise Sequence

> Status: **operating control sheet only.** This file makes the work sequence
> human-readable. It is not current authority, a launch approval, or a runtime
> gate. Runtime work still requires `docs/plans/current-program.md` and
> `docs/plans/current-tracker.md`.

## Current Rule

Work proceeds sequentially for exposure/runtime decisions, but docs/ops evidence
may run in parallel when the register says `Gate = none`.

Do not start MOB runtime work while any required entry item is open. Do not treat
local proof as staging proof.

## Sequence

| Step | Work                          | Current status   | Evidence / next action                                                                                                                                     | Advancement rule                                                                       |
| ---- | ----------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | Verify ENT-A01 / RBAC-01      | Closed, caveated | PR `#1299` fixed the narrow release-gate stabilization path; PR `#1300` recorded two consecutive green staging jobs after one post-deploy P0.1 staff miss. | Reopen/freeze if any future current-main staging P0.1 agent/staff marker miss appears. |
| 2    | Appoint country reviewer      | In progress      | MK signature package sent to `Interdomestik@gmail.com`; wait for named professional signatures and preserve returned PDFs.                                 | Required before L2 review can complete for the selected country.                       |
| 3    | UI/UX design preparation only | Not started      | Prepare Figma/design review inputs from the mobile dossier; no shipped UI changes.                                                                         | Allowed in parallel, but cannot promote runtime.                                       |
| 4    | Sign business memos           | Not started      | Complete Memo 1 and Memo 2 in `docs/product/2026-07-03-business-decision-memos.md`; add dated decision notes.                                              | Required before MOB-05a and MOB-02 gates.                                              |
| 5    | Complete B6/B7                | Not started      | B6 hotfix runbook plus staging exercise; B7 `/help-now` alert catalog plus synthetic alert proof.                                                          | Required before non-dark Help Now exposure.                                            |
| 6    | Draft MOB-01b gate            | Not started      | Draft only after Step 1 path is clear enough to cite entry evidence; keep it docs-only.                                                                    | Drafting is allowed; promotion is not.                                                 |
| 7    | Implement MOB-01b             | Blocked          | Requires ENT-A01 closed, L2 KS signed, B6 done, B7 done, and a later `MOB-DG01B` authority record.                                                         | No flag flip or runtime config until CA+DG.                                            |
| 8    | Prepare MOB-05a               | Blocked          | Start gate prep after Memo 1 and fee-wording review kickoff.                                                                                               | Runtime waits for CA+DG.                                                               |
| 9    | Prepare MOB-02                | Blocked          | Start design prep after Memo 2 and ops-SLA reconciliation inputs.                                                                                          | Runtime waits for CA+DG.                                                               |

## Step 1 State

`RBAC-01` is closed as operationally unblocked with caveat by:

- PR `#1299`, merge `73aa5589cc87efde67f9910ef7413c3484786b3e`;
- PR `#1300`, merge `d8ed345767e5aa9102bf48bbe4a4e956bf361771`;
- `docs/plans/2026-07-05-b2-staging-rbac-residual-check.md`;
- `docs/plans/2026-07-05-rbac-01-closeout.md`.

The close is not clean enough to say the residual "never reproduced." Any
future current-main staging P0.1 agent/staff marker miss freezes `MOB-01b`
again.

`MOB-01b` remains blocked until country L2, B6, B7, and a later
current-authority/design-gate are complete.

## Next Human Actions

1. Collect the signed MK professional review PDFs and record the reviewer name,
   qualification, date, and scope.
2. Choose owners for B6 hotfix runbook and B7 alert catalog.
3. Decide who signs Memo 1 and Memo 2 if not Arben.
4. Draft the MOB-01b gate only after the entry evidence can be cited.
