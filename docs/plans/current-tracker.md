---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-19
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for current program work.

## Active Queue

| ID                                | Status    | Owner                         | Work                                                  | Exit Criteria                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | --------- | ----------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-OD17-FINAL-MEASUREMENT` | `blocked` | `platform + performance + qa` | Terminal one-shot OD#17 Preview measurement          | Inert commit `8f091436`, frozen head `3a9689b9`; sole Preview `dpl_DH8E1oGWTsf8s4xi2Mg6i7Ck87Wx` ended `BUILD_EXCEEDED_MAXIMUM_TIME` with no READY; GitHub deployment `5987940626` / status `17029471770` failed. Fixed INCONCLUSIVE; all task controls rolled back and re-read; no measurement PR, preparation, canary, metrics, audit, finalizer, merge or retry. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-OD17-FINAL-MEASUREMENT` | `dg51:9a6b755c`; `r1:b8e27c97`; `e1:c0505785`; `pr:1598`; `pr:1600`; `base/main:bf984974`; `runtime:8f091436`; `head:3a9689b9`; `vercel:dpl_DH8E1oGWTsf8s4xi2Mg6i7Ck87Wx`; `gh-deployment:5987940626`; `gh-status:17029471770`; `raw:ac745d3b` | `blocked` | `dpl_DH8E1oGWTsf8s4xi2Mg6i7Ck87Wx` | `head:3a9689b9` | `not_applicable` | `not_applicable` | `not_applicable` | `not_applicable` | `docs/plans/2026-08-19-ida-dg51-t115-od17-projection-capability.md`; `https://github.com/interdomestik/interdomestik/commit/8f091436945849851672503734c85e9e7b6cc78a`; `https://github.com/interdomestik/interdomestik/commit/3a9689b94cb9a353ab2db8435d32ac5e8534123f`; `provider-raw:5074:sha256:ac745d3bb4b092d2d8e786e37aef4f1c0f493bd0b118baa82e83ca7d60da393d` |

## Next Selection

No slice is promoted. Runtime R1's one-shot frozen head
`3a9689b94cb9a353ab2db8435d32ac5e8534123f` is fixed as
`INCONCLUSIVE — measurement_capability_missing/provider_failure`, subreason
`Vercel BUILD_EXCEEDED_MAXIMUM_TIME / no READY`. No measurement PR, preparation,
canary, metrics, audit, finalizer or merge occurred. Runtime R1 is consumed and
`runtime_authorized:false`; both task variables and the task Trusted Source were re-read
absent, `deployment_status Events` and `repository_dispatch Events` were OFF, Standard
Protection remained ON, and deployment history was retained. The capability remains
merged. `T-118`, `T-117` and `T-116` remain blocked pending a new separate strategic
decision.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is blocked pending a fresh current-authority/design-gate selection; resolver target is `blocked_requires_current_authority`, `activeSlice=null`.
