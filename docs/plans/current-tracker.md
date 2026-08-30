---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-30
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: single current projection; Lean runtime requires matching canonical JSON and live
> Git/GitHub facts.

## Active Queue

| ID             | Status        | Owner      | Work                                                        | Exit Criteria                     |
| -------------- | ------------- | ---------- | ----------------------------------------------------------- | --------------------------------- |
| `T117B-PORTAL` | `in_progress` | `platform` | Unmounted Case, lifecycle Actions, and Recent case updates. | Promote, implement, merge, close. |

## Proof Ledger

| ID             | Source Refs                                                                                             | Execution | Run ID     | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                           |
| -------------- | ------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | ------------------------------------------------------- |
| `T117B-PORTAL` | [gate](./2026-08-28-t117b-portal-design-gate.md); [admission](./2026-08-28-t117b-portal-admission.json) | `pending` | `PR #1665` | `GitHub-hosted Ubuntu` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | Promotion and exact eleven-path product remain pending. |

## Next Selection

PR `#1665` projects T117B-PORTAL only after exact branch/base/head validation and promotion merge.
The portal consumes the closed DATA contract without querying or mounting a route. CUTOVER and
T-117C remain default-denied.

| Future UI branch | Status                        | Constraint                       |
| ---------------- | ----------------------------- | -------------------------------- |
| `T117B-PORTAL`   | `promotion_pending`           | Exact PR `#1665`; runtime awaits merge. |
| `T117B-CUTOVER`  | `deferred`                    | Exact PORTAL merge + closeout.   |
| `T-117C`         | `deferred`                    | cacheComponents/PPR/named slots. |

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
    "sliceId": "T117B-PORTAL",
    "tier": 3,
    "promotionPrNumber": 1665,
    "promotionBaseSha": "10635007175e6348017c622c81f5c1917d347662",
    "expectedProductBranch": "codex/t117b-portal",
    "gateSha256": "0c22cfc56b99608f4d53b5946d486221da777d76e1a7fc36bc777e1861b327a0",
    "admissionSha256": "4d591b1f3f31e5e006727a6bb969860b3cacc83686a2af2356bd80799a910f52",
    "productWriterPaths": [
      "apps/web/src/components/dashboard/case-summary/accident-case-summary.tsx",
      "apps/web/src/components/dashboard/case-summary/case-kind-registry.test.tsx",
      "apps/web/src/components/dashboard/case-summary/case-kind-registry.ts",
      "apps/web/src/components/dashboard/case-summary/generic-case-summary.tsx",
      "apps/web/src/components/dashboard/member-portal-region-boundary.tsx",
      "apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx",
      "apps/web/src/components/dashboard/member-portal-runtime.tsx",
      "apps/web/src/messages/en/dashboard.json",
      "apps/web/src/messages/mk/dashboard.json",
      "apps/web/src/messages/sq/dashboard.json",
      "apps/web/src/messages/sr/dashboard.json"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:T117B-PORTAL`).

## Historical Authority

Pre-compaction history through Rev 243: [manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json),
SHA-256 `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. WF01 stays
closed/non-activating; OD17 and CI01/A1 remain separate and unpromoted.
