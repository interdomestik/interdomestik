---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-02
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: single current projection; Lean runtime requires matching canonical JSON and live
> Git/GitHub facts.

## Active Queue

| ID              | Status        | Owner      | Work                                 | Exit Criteria          |
| --------------- | ------------- | ---------- | ------------------------------------ | ---------------------- |
| `T117B-CUTOVER` | `in_progress` | `platform` | Member mount and behavior migration. | Promote, merge, close. |

## Proof Ledger

| ID              | Source Refs                                                                                               | Execution | Run ID     | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                  |
| --------------- | --------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | ------------------------------ |
| `T117B-CUTOVER` | [gate](./2026-08-28-t117b-cutover-design-gate.md); [admission](./2026-08-28-t117b-cutover-admission.json) | `pending` | `PR #1691` | `GitHub-hosted Ubuntu` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | Exact 21-path product pending. |

## Next Selection

PR `#1686` merged 21-path authority at `01117c712f56ce0ce12750605b3fbf0b337d24c3`, tree
`7e44c5a177b8da0770b8e12a445037b62e9cfee4`; `#1691` reprojects CUTOVER. DATA/PORTAL stay closed;
T-117C remains denied.

| Future UI branch | Status              | Constraint                              |
| ---------------- | ------------------- | --------------------------------------- |
| `T117B-CUTOVER`  | `promotion_pending` | Exact PR `#1691`; runtime awaits merge. |
| `T-117C`         | `deferred`          | cacheComponents/PPR/named slots.        |

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
    "sliceId": "T117B-CUTOVER",
    "tier": 3,
    "promotionPrNumber": 1691,
    "promotionBaseSha": "01117c712f56ce0ce12750605b3fbf0b337d24c3",
    "expectedProductBranch": "codex/t117b-cutover",
    "gateSha256": "b119f78ee6abf8ff2c835b4ec1b03b25c1c8e60cdfc4d7ea93c743ed6faf2f39",
    "admissionSha256": "c7e871a43e03458e24b1aa3d45f641073dcceeb750016b16ee657b373af49a2a",
    "productWriterPaths": [
      "apps/web/e2e/dashboard-access.spec.ts",
      "apps/web/e2e/gate/member-diaspora.spec.ts",
      "apps/web/e2e/gate/member-home-cta.spec.ts",
      "apps/web/e2e/golden/agent-member-overlay.spec.ts",
      "apps/web/e2e/golden/member-dashboard-empty-state.spec.ts",
      "apps/web/e2e/golden/member-dashboard-has-claims.spec.ts",
      "apps/web/e2e/golden/member-portal-agent-consumer.spec.ts",
      "apps/web/e2e/production.spec.ts",
      "apps/web/e2e/smoke/ida-dashboard-smoke.spec.ts",
      "apps/web/e2e/ui-v2-onboarding.spec.ts",
      "apps/web/src/app/[locale]/(app)/_core.entry.tsx",
      "apps/web/src/app/[locale]/(app)/member/_core.entry.test.tsx",
      "apps/web/src/app/[locale]/(app)/member/_core.entry.tsx",
      "apps/web/src/app/[locale]/(app)/member/page.test.tsx",
      "apps/web/src/app/[locale]/(app)/member/page.tsx",
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
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:T117B-CUTOVER`).

## Historical Authority

Pre-compaction history through Rev 243: [manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json),
SHA-256 `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. WF01 stays
closed/non-activating; OD17 and CI01/A1 remain separate and unpromoted.
