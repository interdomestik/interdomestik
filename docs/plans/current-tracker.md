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

| ID                                             | Status        | Owner                         | Work                                                                 | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------- | ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `in_progress` | `platform + performance + qa` | One cache-isolated exact-head recovery of OD#17 public-shell budgets | Arben exact-approved `IDA-DG50-T115-OD17-CACHE-ISOLATED-PREVIEW-RECOVERY`, 19,685 bytes / SHA-256 `ecea46fa019907bdb235bdcb19349b30e41aa7cad8641b23ba5e71cc6c023309`, on clean main `0f0ddf3d6c00d51237fc6347c01c2aa4651936be`. The [gate](./2026-08-19-ida-dg50-t115-od17-cache-isolated-preview-recovery.md) preserves the prior reviewed contract, permits no runtime yet, and requires docs merge, exact-main convergence and separately exact-approved runtime authority before one no-cache Preview/canary attempt. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `gate:feb4fa42`; `correction-r2:0382428a`; `pr:1593`; `head:a5c5534d`; `e2e:32166438771`; `prepare:32166438756`; `vercel:dpl_Cu1Doy9Y6iswiwCzEMySSe9kaFQY`; `dg50:ecea46fa` | `manual` | `codex/ida-dg50-authority` | `main` | `pass` | `not_applicable` | `not_applicable` | `not_applicable` | `docs/plans/2026-08-18-ida-t115-od17-terminal-provider-failure-evidence.md`; `docs/plans/2026-08-19-ida-dg50-t115-od17-cache-isolated-preview-recovery.md` |

## Next Selection

Only OD#17 is promoted for authority merge. After merge, resolver must become
`awaiting_runtime_authority`; no branch, provider control, Preview or canary may begin
until a separate exact-main runtime receipt is approved. Dependent `T-118` and `T-117`
remain blocked until OD#17 is actually PASS, merged and closed.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` (Tier 3 shared performance-verification recovery; `runtime_authorized:false`; exact-approved `IDA-DG50-T115-OD17-CACHE-ISOLATED-PREVIEW-RECOVERY` pending docs-only merge).
