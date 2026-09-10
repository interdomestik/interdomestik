---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-10
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Lean runtime requires matching canonical JSON and live Git/GitHub facts.

## Active Queue

| ID                                   | Status    | Owner      | Work                              | Exit Criteria                                        |
| ------------------------------------ | --------- | ---------- | --------------------------------- | ---------------------------------------------------- |
| `STAFF-CURRENT-CLAIM-TENANT-CONTEXT` | `pending` | `platform` | Tenant-scoped current-claim read. | Exact promotion, implementation and main proof pass. |

## Proof Ledger

| ID                                   | Source Refs                                                                                                                                         | Execution | Run ID    | Run Root  | Sonar     | Docker           | Sentry           | Learning  | Evidence Refs                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------- | --------- | --------- | ---------------- | ---------------- | --------- | ------------------------------------------ |
| `STAFF-CURRENT-CLAIM-TENANT-CONTEXT` | [gate](./2026-09-10-staff-current-claim-tenant-context-design-gate.md); [admission](./2026-09-10-staff-current-claim-tenant-context-admission.json) | `pending` | `pending` | `pending` | `pending` | `not_applicable` | `not_applicable` | `pending` | Promotion #1741 and product trial pending. |

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
Nonblocking follow-up: use `routes.businessMembership(testInfo)` on the next authorized
E2E edit; it produces the same URL as the current expression. Migration trials remain 0/3.

## Next Selection

#1691/#1675 closed CUTOVER; #1724 failed; #1726/#1727 repaired. #1731 admits 52 paths; #1733 corpus main proof passed. #1734 merged; #1737 admits 53 paths, main CI/Sonar passed. Promotion #1738 and product #1736 merged; T117C implementation is delivered. Closeout records an inactive projection; successor promotion remains separate.

| Future successor branch             | Status              | Constraint                                                   |
| ----------------------------------- | ------------------- | ------------------------------------------------------------ |
| Tenant transaction                  | `promotion_pending` | PR #1741; exact four-path map admitted by #1740.             |
| Currency parsing / failed-run retry | `not_promoted`      | Separate bounded successors after the first migration trial. |

## Lean Authority

<!-- prettier-ignore -->
```json lean-authority
{
  "schemaVersion": 1,
  "authority": "lean-tier12-v1",
  "lifecycle": "promotion_pending",
  "owner": {
    "login": "arbenl",
    "id": 62884977
  },
  "activeSlice": {
    "sliceId": "STAFF-CURRENT-CLAIM-TENANT-CONTEXT",
    "tier": 3,
    "promotionPrNumber": 1741,
    "promotionBaseSha": "4b4bb609feb3aa55f58aa062e64ae4ee9ef9f7d6",
    "expectedProductBranch": "codex/staff-current-claim-tenant-context",
    "gateSha256": "b4a9171a8180c1ea7536550e4891b4a3f6530d1e17ac961b0c855ef6bea240a6",
    "admissionSha256": "346349f4f249ed059edcdffe825e41419575eece39ee6be50dc90f2e0dec502b",
    "productWriterPaths": [
      "packages/domain-claims/src/staff-claims/current-claim-record.test.ts",
      "packages/domain-claims/src/staff-claims/current-claim-record.ts",
      "packages/domain-claims/src/staff-claims/update-status.test.ts",
      "packages/domain-claims/src/staff-claims/update-status.ts"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator.

## Historical Authority

Pre-compaction history through Rev 243: [manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json),
SHA-256 `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. WF01 stays
closed/non-activating; OD17 and CI01/A1 remain separate and unpromoted.
