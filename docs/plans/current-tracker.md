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

| ID                                              | Status    | Owner                         | Work                                                                  | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | --------- | ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY` | `pending` | `platform + performance + qa` | Install one inert protected-main attested-prebuilt Preview capability | DG52 (34,213 bytes; SHA-256 `31bc347dd13436614b8f3b84a199ec586726280e5905e3ce14f72d2ca7cd2938`) and admission v1 (7,469 bytes; SHA-256 `70381edc02657ba392ff8af01e1f50e638c09239a034c7b90f249cc2bcebdb60`) are exact-approved on `main@cb33cd616abcb79c4298c1024d592d8ae998c1cc`. Runtime is unauthorized; healthy exact Phase-A main and one separately approved content-addressed R1 are required before any implementation writer. No GitHub-environment or provider operation is authorized. |

## Proof Ledger

| ID                                              | Source Refs                                                 | Execution | Run ID    | Run Root                                        | Sonar            | Docker           | Sentry           | Learning  | Evidence Refs                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------- | --------- | --------- | ----------------------------------------------- | ---------------- | ---------------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY` | `dg52:31bc347d`; `admission:70381edc`; `base/main:cb33cd61` | `pending` | `pending` | `main@cb33cd616abcb79c4298c1024d592d8ae998c1cc` | `not_applicable` | `not_applicable` | `not_applicable` | `pending` | `docs/plans/2026-08-19-ida-dg52-od17-attested-prebuilt-preview.md`; `docs/plans/2026-08-19-ida-od17-attested-prebuilt-preview-capability-admission-v1.json`; admission checker `ready` with one outcome, eleven semantic writers, three proof surfaces, one shared runtime consumer, and zero pre-implementation special environments. No implementation or runtime proof is claimed. |

## Next Selection

Only `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY` is promoted to
`awaiting_runtime_authority` under exact-approved DG52 and admission v1.
`runtime_authorized:false`; Phase A authorizes only inert authority convergence.
Implementation and provider runtime remain forbidden pending healthy exact Phase-A main
and one separately approved exact R1. Historical T-115 OD#17 remains terminal
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
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY` (Tier 3; `runtime_authorized:false`).
