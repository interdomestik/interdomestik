---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-13
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Ordinary delivery follows the current program. Explicit legacy Lean runtime
> still requires matching canonical JSON and live Git/GitHub facts.

## Active Queue

The owner selected one bounded notification acknowledgement correctness increment after T210.
T210 remains completed evidence and no automatic successor is inferred.
The current member screen is legacy integration evidence only. The planned net-new member UI/UX
belongs in the unified portal shell; canonical role routes and readiness markers do not authorize
separate dashboard designs or freeze the legacy presentation.

| ID                                  | Status        | Owner     | Work                                                                   | Exit Criteria                                                       |
| ----------------------------------- | ------------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `T410-NOTIFICATION-ACK-CORRECTNESS` | `in_progress` | `product` | Make member notification read state reflect confirmed server outcomes. | Focused/browser/required checks, reviews, and protected merge pass. |

## Proof Ledger

| ID                                  | Source Refs                                    | Execution  | Run ID   | Run Root | Sonar   | Docker | Sentry           | Learning         | Evidence Refs                                                                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------- | ---------- | -------- | -------- | ------- | ------ | ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T410-NOTIFICATION-ACK-CORRECTNESS` | docs/plans/current-program.md; owner direction | `scripted` | bdeabe37 | local/CI | pending | pass   | `not_applicable` | `not_applicable` | source-bound local proof `bdeabe3795b7d6d4d35004cfba19f1efbbdd3648`; Sonnet/Gemini proposal receipts at `adc3ca314`; earlier Astra implementation review at `833496eb`; current-head protected review and protected PR evidence pending |

Historical staff rehearsal: retained only as a timing baseline; no migration credit.

Harness adoption completed through PR #1761 merge `a1eaeb654` and PR #1762 merge `12b22bada`;
its completed history is retained in the current program, outside the single active queue.

T210 is medium complexity: bounded UI integration and privacy/fallback regression coverage over an
unchanged authorized query. Implementation owner: Sol/high. Sonnet 5 reviewed snapshot `fa959214`
and found only prepared-versus-live wording ambiguity, which was clarified without expanding
visibility.
Gemini 3.1 Pro proposed adversarial cases; three useful cases were integrated, duplicate cases and
an incomplete mapper fixture were rejected. The resulting 24 focused tests pass. Both repo-owned
route receipts are retained in the task workspace. Independent Astra review and local `pr:verify`
passed at `061ea5910ea63aab67009bccfb2b219505733fa9` (773,700 ms, exit 0; gate 252 passed/10 skipped,
smoke 13 passed/11 skipped; repository line coverage 81.09%). Same-source `security:guard` passed.
The subsequent tracker-only enum correction does not change product code; that local proof remains
bound to its original source. Final product head `87c291f21d74c9a1dfd8d92683124c29af89f4f7`, tree
`a24e6b186f829994a693eb89fb95981e5db024e9`, and squash merge
`00794c98cc6b4d395493370552ab7b9eae525db7` matched. Final-head focused review found no unresolved
issue. Protected-main CI `34703433627` passed, SonarCloud Code Analysis check `103580834614`
passed, and Sonar Main Gate `34703433721` attempt 2 passed at the exact merge. No deployment or
claimant usability validation is claimed.

T410 local source-bound proof passed at `bdeabe3795b7d6d4d35004cfba19f1efbbdd3648`:
30 focused notification tests, both focused IDA-host browser variants, `pr:verify` (1,048 CI
contracts, 154 release-gate tests, 41 RLS tests, 81.25% repository line coverage
(21,643/26,637), 252 gate passes with 12 intentional skips, and 13 smoke passes with 11 intentional
skips), and
`security:guard`. Repo-owned routes completed Claude Sonnet 5 design and Gemini 3.1 Pro/Gemini 3.8
Flash test-screening proposals against specification commit `adc3ca314`; those receipts informed
implementation but are not current-head implementation-review evidence. An earlier independent
Astra implementation review passed at `833496eb`. Later externally reported findings were
reproduced and corrected, including bounded bulk responses, locale-safe action routing, disabled
pending actions, and Serbian glossary consistency; the corrected behavior is covered by the new
source-bound proof. Bulk acknowledgement still updates the full tenant/user unread backlog and the
client changes represented requested rows only after server confirmation. This is implementation
and scripted behavior evidence only: current-head protected review, protected PR checks, and merge
remain pending, and no legacy visual approval, claimant usability validation, or deployment is
claimed.

Terminal: promotion `#1691`; product head
`503d4b179251f9d3d06e07349ec80f85805565ae`, tree
`61b2316606c9b3facd6c8aff2a14bb4402d80c82`, squash
`31cae997e42dbc0bee13ca670899b988576bd42c`; Full Gate `33863200404`, CI `33863200381`, Pilot
`33863200495`, backstops `33863200850`, security `33862616690`, finalizer `33863200356` attempt 2,
delivery `33863200387` attempt 2, main CI/Sonar/CodeQL/security green; CD
`33865541227` cancelled, zero jobs.

T117C product: #1736, head `f13c81712d5fa012c6407337852217473a1c4d4d`, merge
`c3e79d91d103c373ac9014d136956e8d91815991`. CI `34452735233`, E2E/smoke
`34452735175`, Pilot `34452735196`, finalizer `34452735368`, delivery
`34452769704` attempt 2 passed. Owner review `5164184965` binds promotion #1738.
The 50-path product is a subset of the 53-path admission. Protected-main CI `34454527870` and Sonar `34454689720` passed at the exact merge.

Migration rehearsal: promotion #1749; product #1744 head
`b9128de3b787e26eb08935a4d85cc7580398d6cd`; exact executed merge
`be7f1d9f794f4faf338b11dfdfd43e43fe469076`, tree
`0528a173b2d29d2f5d09e4e066467f513607ca4e`; Z620 `e2e-pr` PASS in 1,548,982 ms. Result SHA-256
`5d15d07e940511665631d8819ce72345c49ea1b5885e7372a269850270d2fc59`; log SHA-256
`c5ab7f1ac1898f1b82b23d400b7ae8465b7143c0ee29fa9446e6a1a3285718d9`. Existing protected-main
evidence was reused. The task database, port, process scope and temporary checkout were cleaned.
Because live activation and the repo-bound prospective protocol did not both precede merge and
execution, this is a technical baseline rather than trial 1. Migration was 0/3 at that checkpoint.

The historical protocol for completed migration trials 2 and 3 is defined in `current-program.md`: each trial
uses one bounded ordinary product PR while Lean authority remains inactive, with exact identity
frozen before its clean detached Z620 run. Existing protected PR evidence is reused when inputs
match; the result, redacted log, hashes, duration and cleanup state are retained. Missing
pre-execution binding or cleanup means no trial credit.

Failed-run retry product #1757 passed all protected PR contexts and its exact-head Z620 `e2e-pr`
lane in 1,551,834 ms. Result SHA-256 is
`4ad149d001623f5ba63dfb8609e849704e4c26583695c5558e585177a52d0ad6`; log SHA-256 is
`cb44f5d3b3af05b391141a24f31419f35c1f23d444e02fc87aa254469a7516ea`. Task resources and the
temporary candidate were cleaned, evidence was retained, and exact source
`4a6ebbed9bb8a942d707ad81cef57fcede02dd63` squash-merged as
`1728afd3c76f952de9a6df87502800965e041093`. Migration progress at that checkpoint was 2/3.

Unsupported-document product #1758 merged head
`0819504edd2124ce4606e6102d980d78c2279ec4` as
`d54fa720ba812ade5584ada9ab51aa02a9fc0c46`; head/merge tree matched
`145260744f66eee7ecef50d24b1873d181fa71c3`. The corrected prospective Z620 run
passed in 1,553,241 ms with task-resource cleanup; result/log hashes and the
execution owner's exact-main verification are recorded in the current program.
Migration is completed at 3/3. This is not production-deployment evidence.

## Next Selection

T117C was delivered by promotion #1738 and product #1736. Its legacy projection remains inactive.
Harness adoption completed through #1761 and #1762. T210 completed through product #1763. The
owner selected the bounded notification acknowledgement correctness increment as the only active
ordinary product slice; it is not full T-410 completion and does not select T-411.

| Completed historical priority            | Status        | Constraint                                                                       |
| ---------------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| Locale-aware currency parsing            | `completed`   | Product #1754; migration trial 1/3 closed.                                       |
| Bounded failed-run retry                 | `completed`   | Product #1757; migration trial 2/3 closed.                                       |
| Unsupported claim AI document type       | `completed`   | Product #1758; migration trial 3/3 closed.                                       |
| Member timeline (T210)                   | `completed`   | Product #1763; main CI and Sonar passed at the exact protected merge.            |
| Notification acknowledgement correctness | `in_progress` | Owner-selected prerequisite increment toward T-410; no broader completion claim. |

No further successor row is recorded. A recommendation does not become program priority until the
owner selects it and the current program records that decision.

## Lean Authority

<!-- prettier-ignore -->
```json lean-authority
{
  "schemaVersion": 1,
  "authority": "lean-tier12-v1",
  "lifecycle": "inactive",
  "owner": {
    "login": "arbenl",
    "id": 62884977
  },
  "activeSlice": null
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator.

## Historical Authority

Pre-compaction history through Rev 243: [manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json),
SHA-256 `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. WF01 stays
closed/non-activating; OD17 and CI01/A1 remain separate and unpromoted.
