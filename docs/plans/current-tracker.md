---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-28
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This document defines the single current queue/proof projection. Lean runtime is
> resolved only from the agreeing canonical JSON projection and live Git/GitHub facts.

## Active Queue

| ID                      | Status    | Owner      | Work                                              | Exit Criteria                                                |
| ----------------------- | --------- | ---------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `T-117B-PORTAL-RUNTIME` | `pending` | `platform` | Ordinary RSC member portal runtime, no PPR/slots. | Exact Tier-3 promotion then product/closeout proof is green. |

## Proof Ledger

| ID                      | Source Refs                                                                                                             | Execution | Run ID    | Run Root  | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- | --------- | --------- | --------- | ---------------- | ---------------- | ---------------- | ---------------------------------------------------------------- |
| `T-117B-PORTAL-RUNTIME` | [gate](./2026-08-28-t117b-portal-runtime-design-gate.md); [admission](./2026-08-28-t117b-portal-runtime-admission.json) | `pending` | `pending` | `pending` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | No implementation, PR, CI/E2E, merge, or closeout proof claimed. |

## Next Selection

T-116 remains terminally complete. T-117B is the sole pending Tier-3 projection; live promotion
PR `#1650` is bound to the exact branch/base/head and grants no runtime before its owner marker
and green merge. T-117C remains deferred until T-117B closes.

| Future UI branch | Status     | Constraint                                                   |
| ---------------- | ---------- | ------------------------------------------------------------ |
| `T-117C`         | `deferred` | Atomically owns cacheComponents, PPR, and named route slots. |

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
    "sliceId": "T-117B-PORTAL-RUNTIME",
    "tier": 3,
    "promotionPrNumber": 1650,
    "promotionBaseSha": "be398cbccdd4491b2d0721bc201fd9e49ce101af",
    "expectedProductBranch": "codex/t117b-portal-runtime",
    "gateSha256": "3c95af83eb0edf62f10db79a0043b4e314bb9cd9cf1d059cb41328c6bb01520d",
    "admissionSha256": "0d2952f43f47304b745636009c812138e888d1952ea9c4623682da8c784fa8de",
    "productWriterPaths": [
      "apps/web/src/lib/auth.server.ts",
      "apps/web/src/components/shell/member-portal-context.ts",
      "packages/domain-member/src/portal-runtime/get-member-portal-activity.ts",
      "packages/domain-member/src/portal-runtime/get-member-portal-activity.test.ts",
      "packages/domain-member/src/index.ts",
      "apps/web/src/components/dashboard/member-portal-runtime.tsx",
      "apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx",
      "apps/web/src/app/[locale]/(app)/member/_core.entry.tsx",
      "apps/web/src/app/[locale]/(app)/member/_core.entry.test.tsx",
      "apps/web/src/app/[locale]/(app)/member/page.tsx",
      "apps/web/src/app/[locale]/(app)/member/page.test.tsx"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:null`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

WF01 remains closed and recoverable from its stable closeout, projection, envelope, receipt, and
durable evidence; none is a Lean activation input. OD17 and CI01/A1 remain unchanged, separate,
and unpromoted.
