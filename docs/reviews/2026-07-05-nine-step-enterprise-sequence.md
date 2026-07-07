---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md
  - docs/reviews/2026-07-05-week1-execution-packet.md
  - docs/reviews/2026-07-05-week1-human-action-packet.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
  - docs/plans/2026-07-05-b2-staging-rbac-residual-check.md
  - docs/plans/2026-07-05-rbac-01-current-authority.md
  - docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md
  - docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md
  - docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md
  - docs/plans/2026-07-06-mob-dg01b-mk-help-now-non-dark-gate-draft.md
  - docs/plans/2026-07-06-b6-b7-help-now-exercise-worksheet.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/plans/2026-07-06-mob-05a-mob-02-prep-worksheet.md
  - docs/product/2026-07-06-mk-reviewer-appointment-intake.md
  - docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/product/2026-07-06-business-memo-signature-intake.md
  - docs/product/2026-07-05-mobile-uiux-review-input-package.md
  - docs/product/2026-07-05-mobile-uiux-static-storyboard-board.md
  - docs/product/2026-07-05-mobile-uiux-storyboard-package.md
  - output/pdf/2026-07-05-mobile-uiux-static-storyboard-board/interdomestik-mobile-uiux-static-storyboard-board.pdf
  - docs/product/2026-07-05-business-memo-signing-packet.md
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

Use the Interdomestik slice-runner skill for implementation, gate, authority,
verification, or PR work. The skill is advisory workflow machinery; repo
`AGENTS.md`, `docs/plans/current-program.md`,
`docs/plans/current-tracker.md`, resolver state, and merged gate records remain
the actual authority. No runtime implementation starts unless the resolver or
current authority promotes exactly one concrete slice.

## Sequence

| Step | Work                          | Current status                                               | Evidence / next action                                                                                                                                                                                                                                                                                    | Advancement rule                                                                       |
| ---- | ----------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | Verify ENT-A01 / RBAC-01      | Closed, caveated                                             | PR `#1299` fixed the narrow release-gate stabilization path; PR `#1300` recorded two consecutive green staging jobs after one post-deploy P0.1 staff miss.                                                                                                                                                | Reopen/freeze if any future current-main staging P0.1 agent/staff marker miss appears. |
| 2    | Appoint country reviewer      | In progress; intake/return packet ready                      | MK signature package plus `docs/product/2026-07-06-mk-reviewer-appointment-intake.md` and `docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md`; Gazmend is the working MK ops/UIUX reviewer candidate, with counsel countersign required for legal/factual rows if he is not licensed counsel. | Required before L2 review can complete for the selected country.                       |
| 3    | UI/UX design preparation only | PDF board ready                                              | Review input, storyboard, static-board contract, and generated 43-frame PDF board exist; human findings are still pending.                                                                                                                                                                                | Allowed in parallel, but cannot promote runtime.                                       |
| 4    | Sign business memos           | Ready to sign; return packet/intake ready                    | Signing packet, decision records, `docs/product/2026-07-06-business-memo-return-packet-albanian.md`, and `docs/product/2026-07-06-business-memo-signature-intake.md`; records still unsigned.                                                                                                             | Required before MOB-05a and MOB-02 gates.                                              |
| 5    | Complete B6/B7                | Worksheet/intakes/Albanian return packet ready; both blocked | B6 runbook, B6 owner intake, B7 alert contract, B6/B7 worksheet, Albanian ops return packet, ENT-A06 preflight, and B7 owner intake exist; staging hotfix exercise, named alert owner, and provider-side B7 proof are still required.                                                                     | Required before non-dark Help Now exposure.                                            |
| 6    | Draft MOB-01b gate            | Draft prepared                                               | Draft packet exists at `docs/plans/2026-07-06-mob-dg01b-mk-help-now-non-dark-gate-draft.md`; it cites Rev 91 and keeps implementation blocked.                                                                                                                                                            | Drafting is allowed; promotion is not.                                                 |
| 7    | Implement MOB-01b             | Blocked                                                      | Requires ENT-A01 closed, L2 MK signed, B6 done, B7 done, and a later `MOB-DG01B` authority record.                                                                                                                                                                                                        | No flag flip or runtime config until CA+DG.                                            |
| 8    | Prepare MOB-05a               | Prep worksheet ready; blocked                                | Prep worksheet maps Memo 1 choices to Fee Math Sheet gate inputs; signed Memo 1 and L5 fee-wording review are still missing.                                                                                                                                                                              | Runtime waits for CA+DG.                                                               |
| 9    | Prepare MOB-02                | Prep worksheet ready; blocked                                | Prep worksheet maps Memo 2 choices to Case Companion gate inputs; signed Memo 2 and ops-SLA reconciliation are still missing.                                                                                                                                                                             | Runtime waits for CA+DG.                                                               |

## Step 1 State

`RBAC-01` is closed as operationally unblocked with caveat by:

- PR `#1299`, merge `73aa5589cc87efde67f9910ef7413c3484786b3e`;
- PR `#1300`, merge `d8ed345767e5aa9102bf48bbe4a4e956bf361771`;
- `docs/plans/2026-07-05-b2-staging-rbac-residual-check.md`;
- `docs/plans/2026-07-05-rbac-01-closeout.md`.

The close is not clean enough to say the residual "never reproduced." Any
future current-main staging P0.1 agent/staff marker miss freezes `MOB-01b`
again.

`MOB-01b` remains blocked until MK L2, B6, B7, and a later
current-authority/design-gate are complete.

## Next Human Actions

For the 2026-07-07 dispatch queue, use
`docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md`.

1. Collect the signed MK professional review PDFs and record the reviewer name,
   qualification, date, scope, evidence path, and counsel countersign path in
   `docs/product/2026-07-06-mk-reviewer-appointment-intake.md`.
2. Choose owners for B6 hotfix exercise and B7 alert catalog.
   Use `docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md` as the
   Albanian return guide for both owners.
3. Decide who signs Memo 1 and Memo 2 if not Arben, using
   `docs/product/2026-07-06-business-memo-return-packet-albanian.md`.
4. Assign the generated PDF board or a derived Figma board to design reviewers
   and collect dated findings before runtime decisions.
5. Fill and sign both business-memo decision records, accept them through
   `docs/product/2026-07-06-business-memo-signature-intake.md`, then commit the
   signed files.
6. Keep the MOB-01b gate draft current as A04/A05/A06 evidence arrives; do not
   use it as runtime authority.
   Index every returned artifact or correction in
   `docs/reviews/2026-07-06-nine-step-evidence-intake-register.md`.
7. Once Memo 1 and Memo 2 are signed, update the MOB-05a/MOB-02 prep worksheet
   with the selected options before any current-authority gate is requested.
8. Assign a B7 alert owner in
   `docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md`
   and complete `docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md`;
   if provider proof cannot cover SW/cache/manifest/funnel/dark-state signals,
   treat that as a blocker for a later minimal instrumentation gate.
9. Assign a B6 staging operator in
   `docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md`;
   do not mark B6 done until the staging exercise proves re-darken, manifest
   hash/version, route, cache revalidation, cache-safety, and rollback timings.
