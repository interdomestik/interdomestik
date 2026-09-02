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

| ID              | Source Refs                                                                                               | Execution | Run ID     | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                             |
| --------------- | --------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | --------------------------------------------------------- |
| `T117B-CUTOVER` | [gate](./2026-08-28-t117b-cutover-design-gate.md); [admission](./2026-08-28-t117b-cutover-admission.json) | `pending` | `PR #1683` | `GitHub-hosted Ubuntu` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | Repromotion and exact twenty-path product remain pending. |

## Next Selection

PR `#1681` merged the prior projection at `050d5a9c241ea8f2691abc4356e112f23384b1cd`; repairs
`#1682`/`#1684`/`#1685` merged. PR `#1683` reprojects unchanged CUTOVER from latest base
`3545ef7b3867da9cda51ff37ddb51c51dd1c6be5`; DATA/PORTAL stay closed and T-117C denied.

| Future UI branch | Status              | Constraint                              |
| ---------------- | ------------------- | --------------------------------------- |
| `T117B-CUTOVER`  | `promotion_pending` | Exact PR `#1683`; runtime awaits merge. |
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
    "promotionPrNumber": 1683,
    "promotionBaseSha": "3545ef7b3867da9cda51ff37ddb51c51dd1c6be5",
    "expectedProductBranch": "codex/t117b-cutover",
    "gateSha256": "ad1f3f8df5cfdb323e59832c1bba398811b087307c695e885c34c571a9bb8335",
    "admissionSha256": "1182581a688e1e978c8ac60f14c9729fa27c454839023250838aaba6ca3eaca0",
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
