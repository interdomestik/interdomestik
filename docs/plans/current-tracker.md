---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-20
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for current program work.

## Active Queue

| ID                                                       | Status    | Owner                         | Work                                                                    | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | --------- | ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` | `pending` | `platform + performance + qa` | Install the inert canonical archive and pinned runtime-input foundation | A1 (24,108 bytes; SHA-256 `cc7e0afd6d52c430090fb5231133731d1cd04d915be6b124031c76c74ccfacca`) and Child-A admission (6,818 bytes; SHA-256 `a69410840dde123c552e5d5a3589fa127d054b200d6e0c48868a273f46ed81ea`) are exact-approved on `main@182fe71b3a50ad076f2a8746bf1b6401a724d2d0`. Runtime is unauthorized; healthy exact A1 main and separately approved R1-A are required before any semantic writer. No GitHub-environment, provider, OIDC, dispatch, deployment or measurement operation is authorized. |

## Proof Ledger

| ID                                                       | Source Refs                                                      | Execution | Run ID    | Run Root                                        | Sonar            | Docker           | Sentry           | Learning  | Evidence Refs                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------- | --------- | --------- | ----------------------------------------------- | ---------------- | ---------------- | ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` | `dg52-a1:cc7e0afd`; `admission-a:a6941084`; `base/main:182fe71b` | `pending` | `pending` | `main@182fe71b3a50ad076f2a8746bf1b6401a724d2d0` | `not_applicable` | `not_applicable` | `not_applicable` | `pending` | `docs/plans/2026-08-20-ida-dg52-a1-od17-attested-prebuilt-preview-split.md`; `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-artifact-foundation-admission-v1.json`; all three child admissions independently return `ready` with writer counts 8/5/10, three proof surfaces each, one shared future consumer each, zero active special environments, and 21 unique semantic paths. No implementation or runtime proof is claimed. |

## Next Selection

Only `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` is promoted to
`awaiting_runtime_authority` under exact-approved A1 and Child-A admission.
`runtime_authorized:false`; this A1 PR authorizes only inert authority convergence.
Implementation remains forbidden pending healthy exact A1 main and one separately approved
R1-A. Deployment Confinement and Measurement Integration are admitted but remain blocked
behind their predecessor closeouts. Provider runtime remains forbidden until the later exact
R2. Historical T-115 OD#17 remains terminal
`INCONCLUSIVE — measurement_capability_missing/provider_failure` with no retry or relabel.
`T-118`, `T-117`, and `T-116` remain blocked until a merged successor PASS satisfies
`OD17_READY`; none is automatically promoted.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` (Tier 3; `runtime_authorized:false`).
