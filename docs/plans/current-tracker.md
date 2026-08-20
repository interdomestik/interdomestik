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

| ID                                                       | Status    | Owner                         | Work                                                                    | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | --------- | ----------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` | `pending` | `platform + performance + qa` | Install the inert canonical archive and pinned runtime-input foundation | A2 (17,796 bytes; SHA-256 `07c0d238f5062a6652c976cf89f1f7d7dc80d11afd052ddfd87026c62260d473`) and Child-A V2 admission (10,667 bytes; SHA-256 `c3c95198d4992fe2718ac75c4282f8f7d97cf5c6999cc9bc316bc6599ae66a29`) are exact-approved on `main@d384f8182b1441315d724a58b788a5383e3b53db`; V1 is historical and superseded for execution. Runtime is unauthorized; healthy exact A2 main and separately approved R1-A are required before any semantic writer. No GitHub-environment, provider, OIDC, dispatch, deployment or measurement operation is authorized. |

## Proof Ledger

| ID                                                       | Source Refs                                                                             | Execution | Run ID    | Run Root                                        | Sonar            | Docker           | Sentry           | Learning  | Evidence Refs                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- | --------- | ----------------------------------------------- | ---------------- | ---------------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` | `dg52-a1:4fa5b4f6`; `dg52-a2:07c0d238`; `admission-a-v2:c3c95198`; `base/main:d384f818` | `pending` | `pending` | `main@d384f8182b1441315d724a58b788a5383e3b53db` | `not_applicable` | `not_applicable` | `not_applicable` | `pending` | `docs/plans/2026-08-20-ida-dg52-a2-od17-child-fail-closed-repair.md`; all three V2 admission paths linked there independently return `ready` with writer counts 8/5/10, three proof surfaces each, one shared future consumer each, zero active special environments, and 21 unique semantic paths. V1 admissions remain immutable historical evidence. No implementation or runtime proof is claimed. |

## Next Selection

Only `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` remains promoted to
`awaiting_runtime_authority` under exact-approved A2 and its Child-A V2 admission.
`runtime_authorized:false`; this A2 PR authorizes only inert authority convergence.
Implementation remains forbidden pending healthy exact A2 main and one separately approved
R1-A. Deployment Confinement and Measurement Integration V2 admissions remain blocked
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
