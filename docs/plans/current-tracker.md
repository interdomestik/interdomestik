---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-08
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: single current projection; Lean runtime requires matching canonical JSON and live
> Git/GitHub facts.

## Active Queue

| ID       | Status    | Owner      | Work                               | Exit Criteria                   |
| -------- | --------- | ---------- | ---------------------------------- | ------------------------------- |
| `T-117C` | `pending` | `platform` | Nonce-compatible member rendering. | Merge repeat promotion `#1715`. |

## Proof Ledger

| ID       | Source Refs                                                                                                   | Execution  | Run ID     | Run Root         | Sonar     | Docker           | Sentry           | Learning | Evidence Refs                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ---------------- | --------- | ---------------- | ---------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `T-117C` | [gate](./2026-09-07-t117c-rendering-design-gate.md); [admission](./2026-09-07-t117c-rendering-admission.json) | `scripted` | `PR #1715` | `not_applicable` | `pending` | `not_applicable` | `not_applicable` | `pass`   | docs/plans/2026-09-07-t117c-rendering-design-gate.md; docs/plans/2026-09-07-t117c-rendering-admission.json |

Terminal evidence: re-promotion `#1691`; product head
`503d4b179251f9d3d06e07349ec80f85805565ae`, tree
`61b2316606c9b3facd6c8aff2a14bb4402d80c82`, squash
`31cae997e42dbc0bee13ca670899b988576bd42c`; Full Gate `33863200404`, CI `33863200381`, Pilot
`33863200495`, backstops `33863200850`, security `33862616690`, finalizer `33863200356` attempt 2,
delivery `33863200387` attempt 2, and exact-main CI/Sonar/CodeQL/security were green; CD
`33865541227` was cancelled with zero jobs.

## Next Selection

T117B-CUTOVER completed through exact re-promotion `#1691` and product `#1675`. T-117C promotions `#1703` and `#1710` merged exactly, while products `#1705` and `#1711` failed closed before merge. Prerequisite `#1713` repaired topology, typing, navigation, evidence, and security findings and merged as base `30ad64ae20486ce03dbea2d116c008866cd97aba`. Repeat promotion `#1715` is pending for product branch `codex/t117c-rendering-r3`. The missing compiled post-merge-node certificate remains shadow backlog evidence only.

| Future UI branch | Status              | Constraint                               |
| ---------------- | ------------------- | ---------------------------------------- |
| `T-117C`         | `promotion_pending` | Promotion `#1715`; product branch `-r3`. |

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
    "sliceId": "T-117C",
    "tier": 3,
    "promotionPrNumber": 1715,
    "promotionBaseSha": "30ad64ae20486ce03dbea2d116c008866cd97aba",
    "expectedProductBranch": "codex/t117c-rendering-r3",
    "gateSha256": "46ec3789b2aa56fb0c597f10001e1bc099f7507147aad4d3b9663a7116a492f0",
    "admissionSha256": "a61511964c94ab4d8788daf574b601332115dcb1ecd2f2a4b5a33655df9ff9c1",
    "productWriterPaths": [
      "apps/web/e2e/gate/member-home-cta.spec.ts",
      "apps/web/e2e/gate/member-parallel-routes.spec.ts",
      "apps/web/e2e/gate/rendering-build-mode.spec.ts",
      "apps/web/next.config.mjs",
      "apps/web/src/app/[locale]/_core.entry.test.tsx",
      "apps/web/src/app/[locale]/_core.entry.tsx",
      "apps/web/src/app/[locale]/(agent)/agent/layout.tsx",
      "apps/web/src/app/[locale]/(app)/layout.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/@actions/default.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/@actions/page.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/@case/default.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/@case/page.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/@updates/default.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/@updates/page.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/default.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/layout.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/page.tsx",
      "apps/web/src/app/[locale]/(app)/member/(portal)/portal-context.test.ts",
      "apps/web/src/app/[locale]/(app)/member/(portal)/portal-context.ts",
      "apps/web/src/app/[locale]/(app)/member/layout.tsx",
      "apps/web/src/app/[locale]/(app)/member/page.test.tsx",
      "apps/web/src/app/[locale]/(app)/member/page.tsx",
      "apps/web/src/app/[locale]/(staff)/staff/layout.tsx",
      "apps/web/src/app/[locale]/admin/commissions/page.tsx",
      "apps/web/src/app/[locale]/admin/layout.tsx",
      "apps/web/src/app/[locale]/admin/members/number/[memberNumber]/page.tsx",
      "apps/web/src/app/[locale]/admin/settings/page.tsx",
      "apps/web/src/app/[locale]/admin/users/[id]/page.tsx",
      "apps/web/src/app/[locale]/components/home/footer.test.tsx",
      "apps/web/src/app/[locale]/components/home/footer.tsx",
      "apps/web/src/app/[locale]/layout.tsx",
      "apps/web/src/app/[locale]/stats/page.tsx",
      "apps/web/src/app/api/claims/route.ts",
      "apps/web/src/app/api/csp-report/route.ts",
      "apps/web/src/app/api/e2e/branches/route.ts",
      "apps/web/src/app/track/[token]/page.test.tsx",
      "apps/web/src/app/track/[token]/page.tsx",
      "apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx",
      "apps/web/src/components/dashboard/member-portal-runtime.tsx",
      "apps/web/src/components/shell/request-boundary.test.tsx",
      "apps/web/src/components/shell/request-boundary.tsx",
      "apps/web/src/instrumentation.ts",
      "apps/web/src/lib/rendering-build-mode.test.ts",
      "apps/web/src/lib/rendering-build-mode.ts"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:T-117C`; lifecycle `promotion_pending`).

## Historical Authority

Pre-compaction history through Rev 243: [manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json),
SHA-256 `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. WF01 stays
closed/non-activating; OD17 and CI01/A1 remain separate and unpromoted.
