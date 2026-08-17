---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-17
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for current program work.

## Active Queue

| ID                                              | Status      | Owner           | Work                                                                                                    | Exit Criteria                                                                                                               |
| ----------------------------------------------- | ----------- | --------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `IDA-CI05-PILOT-SONAR-CRITICAL-PATH-DECOUPLING` | `completed` | `platform + qa` | Decouple Pilot admission from advisory Sonar polling without weakening exact-head Sonar or merge gates. | Implementation PR `#1573` and closeout PR `#1574` merged; exact-main gates passed; runtime consumed; no successor promoted. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-CI05-PILOT-SONAR-CRITICAL-PATH-DECOUPLING` | `docs/plans/2026-08-15-ida-dg43-ci05-pilot-sonar-critical-path-decoupling.md`; `archive:355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78` | `manual` | `pr-1573` | `main-523fda2493ca728dea48241aad5769917f1ad03f` | `pass` | `not_applicable` | `not_applicable` | `pass` | `https://github.com/interdomestik/interdomestik/pull/1572`; `https://github.com/interdomestik/interdomestik/pull/1573`; `https://github.com/interdomestik/interdomestik/pull/1574`; `merge:22a6bbb3134cccf350445d0a4d7e87980a58ee51`; `closeout:523fda2493ca728dea48241aad5769917f1ad03f` |

## Next Selection

The next active governed implementation goal is blocked pending a fresh current-authority/design-gate selection; resolver target is `blocked_requires_current_authority`, `activeSlice=null`.

No branch, writer, product session, or runtime is authorized. The next task must run the
current-authority resolver and prepare one bounded design gate before implementation.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.
