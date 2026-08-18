---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-18
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for current program work.

## Active Queue

| ID                                             | Status    | Owner                         | Work                                                       | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | --------- | ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `blocked` | `platform + performance + qa` | Fail-closed exact-head proof of OD#17 public-shell budgets | [PR #1593](https://github.com/interdomestik/interdomestik/pull/1593) closed unmerged at exact head `a5c5534da28cb37553daad5d696523baeba5da49`. Exact-head E2E, preparation, Sonar, CodeQL, security and current-head review passed. The sole automatic Vercel Preview compiled in 2.8 minutes, stalled at `Running TypeScript`, and hit the provider's 45-minute build maximum. Canary did not run; OD#17 remains open until fresh authority can prove the same budgets without the failed provider capability. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `gate:feb4fa42`; `correction-r2:0382428a`; `pr:1593`; `head:a5c5534d`; `e2e:32166438771`; `prepare:32166438756`; `vercel:dpl_Cu1Doy9Y6iswiwCzEMySSe9kaFQY` | `blocked` | `provider_failure` | `not_applicable` | `pass` | `not_applicable` | `not_applicable` | `not_applicable` | `docs/plans/2026-08-18-ida-t115-od17-terminal-provider-failure-evidence.md` |

## Next Selection

No slice is promoted. OD#17 remains the first eligible residual and needs fresh
current authority that addresses provider build capability. Dependent `T-118` and
`T-117` remain blocked until OD#17 is actually PASS, merged and closed.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is blocked pending fresh current authority; activeSlice=null.
