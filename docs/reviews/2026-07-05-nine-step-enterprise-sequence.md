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

| Step | Work                          | Current status | Evidence / next action                                                                                         | Advancement rule                                           |
| ---- | ----------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1    | Verify ENT-A01 / RBAC-01      | In progress    | Local RBAC-01 proof is green; deploy/merge is still needed so staging can run two same-day `e2e-staging` jobs. | Close only after both staging jobs are green and recorded. |
| 2    | Appoint KS reviewer           | Not started    | Name one licensed KS lawyer, or KS ops reviewer plus counsel countersign, in the KS sign-off sheet.            | Required before L2 review can start.                       |
| 3    | UI/UX design preparation only | Not started    | Prepare Figma/design review inputs from the mobile dossier; no shipped UI changes.                             | Allowed in parallel, but cannot promote runtime.           |
| 4    | Sign business memos           | Not started    | Complete Memo 1 and Memo 2 in `docs/product/2026-07-03-business-decision-memos.md`; add dated decision notes.  | Required before MOB-05a and MOB-02 gates.                  |
| 5    | Complete B6/B7                | Not started    | B6 hotfix runbook plus staging exercise; B7 `/help-now` alert catalog plus synthetic alert proof.              | Required before non-dark Help Now exposure.                |
| 6    | Draft MOB-01b gate            | Not started    | Draft only after Step 1 path is clear enough to cite entry evidence; keep it docs-only.                        | Drafting is allowed; promotion is not.                     |
| 7    | Implement MOB-01b             | Blocked        | Requires ENT-A01 closed, L2 KS signed, B6 done, B7 done, and a later `MOB-DG01B` authority record.             | No flag flip or runtime config until CA+DG.                |
| 8    | Prepare MOB-05a               | Blocked        | Start gate prep after Memo 1 and fee-wording review kickoff.                                                   | Runtime waits for CA+DG.                                   |
| 9    | Prepare MOB-02                | Blocked        | Start design prep after Memo 2 and ops-SLA reconciliation inputs.                                              | Runtime waits for CA+DG.                                   |

## Active Step 1 State

`RBAC-01` is the active governed implementation slice. It may close ENT-A01 only
by proving the contractual role markers on current-main staging:

- agent and staff canonical markers pass, including `/en/agent` and `/en/staff`;
- member and admin controls remain green;
- P0.3 role-add remains green;
- `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate` remain green;
- two consecutive same-day current-main staging `e2e-staging` jobs pass.

Until that is true, `MOB-01b` remains blocked.

## Next Human Actions

1. Review/merge or otherwise deploy the RBAC-01 branch to staging.
2. Run `e2e-staging` twice on the deployed current-main staging SHA.
3. Appoint the KS reviewer by name and record qualification/countersign path.
4. Choose owners for B6 hotfix runbook and B7 alert catalog.
5. Decide who signs Memo 1 and Memo 2 if not Arben.
