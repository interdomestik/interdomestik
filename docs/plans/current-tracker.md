---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-11
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Lean runtime requires matching canonical JSON and live Git/GitHub facts.

## Active Queue

| ID                                   | Status        | Owner      | Work                                           | Exit Criteria                             |
| ------------------------------------ | ------------- | ---------- | ---------------------------------------------- | ----------------------------------------- |
| `MIGRATION-FAILED-RUN-RETRY-TRIAL-2` | `in_progress` | `platform` | Retry eligible failed claim AI work once only. | Exact PR gates, Z620 run, cleanup, merge. |

## Proof Ledger

| ID                                   | Source Refs                                                                   | Execution | Run ID    | Run Root | Sonar   | Docker  | Sentry           | Learning | Evidence Refs                                                |
| ------------------------------------ | ----------------------------------------------------------------------------- | --------- | --------- | -------- | ------- | ------- | ---------------- | -------- | ------------------------------------------------------------ |
| `MIGRATION-FAILED-RUN-RETRY-TRIAL-2` | docs/plans/current-program.md; docs/plans/current-tracker.md; owner direction | `pending` | `pending` | pending  | pending | pending | `not_applicable` | pending  | docs/plans/current-program.md; docs/plans/current-tracker.md |

Historical staff rehearsal: retained only as a timing baseline; no migration credit.

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
execution, this is a technical baseline rather than trial 1. Migration remains 0/3.

Future trial protocol: a separate promotion first binds the exact base, head, merge-candidate tree
and lockfile hash. Only then may one clean detached candidate run the fixed repo-native Z620
resource command with `--lanes=e2e-pr`, task-owned database and port. Existing protected PR evidence is reused when
inputs match; the result, redacted log, hashes, duration and cleanup state are retained. Missing
pre-execution binding or cleanup means no trial credit.

## Next Selection

T117C was delivered by promotion #1738 and product #1736. Closeout is inactive; successor
promotion remains separate.

| Future successor branch         | Status        | Constraint                                            |
| ------------------------------- | ------------- | ----------------------------------------------------- |
| Locale-aware currency parsing   | `completed`   | Product #1754; migration trial 1/3 closed.            |
| Bounded failed-run retry        | `in_progress` | One bounded ordinary product PR; Lean stays inactive. |
| Third bounded product-use slice | `deferred`    | Select separately after trial 2 evidence and merge.   |

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
