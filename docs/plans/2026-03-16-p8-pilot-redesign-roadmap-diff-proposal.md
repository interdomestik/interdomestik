---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-16
parent_program: docs/plans/current-program.md
parent_tracker: docs/plans/current-tracker.md
---

# P8 Pilot Redesign Roadmap Diff Proposal

> Status: Active supporting input. This document proposes the promotion shape required to move from completed `P7` to the redesigned `P8` pilot era. It does not commit work by itself.

## Recommendation

Preserve `P7` as complete and historical.

Do not continue the superseded 14-day pilot from Day 3.

Append a new tranche after completed `P7`:

- `P8` `Pilot Redesign And Seven-Day Rehearsal`

Split `P8` into two committed parts:

- `P8R` Reset Gate Hardening
- `P8P` Seven-Day Pilot Rehearsal

## No Reopen Rule

`P8` must not reopen:

- routing
- auth layering
- tenancy
- `apps/web/src/proxy.ts`
- broad product feature scope

`P8` is a pilot-operating-model redesign and hardening tranche, not a new product tranche.

## Proposed Canonical Program Shape

Add this phase shape after completed `P7`:

| Phase | Name                                 | Relative Timing      | Owner           | Purpose                                                                |
| ----- | ------------------------------------ | -------------------- | --------------- | ---------------------------------------------------------------------- |
| `P8R` | Reset Gate Hardening                 | immediately after P7 | `platform + qa` | close Day 2 reset-gate defects and prove clean preflight readiness     |
| `P8P` | Seven-Day Pilot Rehearsal            | after P8R            | `platform + qa` | run the redesigned 7-day rehearsal with explicit orchestration custody |
| `P9`  | Pilot-Learned Trust And ActivationUX | conditional after P8 | `web + design`  | improve trust and activation surfaces only after new pilot evidence    |

## Recommended `P8R` Work Items

| ID     | Work                                                               | Exit Criteria                                                                                                                     |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `RG01` | Stabilize `pilot:check` for the intended rehearsal environment.    | `pnpm pilot:check` passes deterministically in the intended environment and no longer fails through the Day 2 `db:rls:test` path. |
| `RG02` | Align operator log-sweep docs with installed Vercel CLI behavior.  | Operator-facing log instructions match actual supported Vercel CLI usage and are verified in the repo docs.                       |
| `RG03` | Make observability-to-decision proof deterministic.                | `pnpm pilot:decision:record` accepts fresh observability references reliably with no manual repair loop.                          |
| `RG04` | Clarify daily-sheet working state versus canonical evidence state. | Docs clearly distinguish working note sheets from the copied evidence index and canonical command writes.                         |
| `RG05` | Re-run a clean preflight proving reset-gate closure.               | Fresh `pnpm pilot:check` and fresh `pnpm release:gate:prod -- --pilotId <new-pilot-id>` both pass under the reset-gate rules.     |

## Recommended `P8P` Work Items

| ID     | Work                                          | Exit Criteria                                                                                               |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SP01` | Day 1 release and artifact baseline.          | `PD01` completes with green artifact custody and canonical evidence rows.                                   |
| `SP02` | Day 2 rollback and resume baseline.           | `PD02` proves rollback-tag discipline and resume proof cleanly under the reset-gate model.                  |
| `SP03` | Day 3 closed-loop role flow.                  | `PD03` validates member -> agent -> staff -> branch_manager -> admin continuity and boundary-safe handoffs. |
| `SP04` | Day 4 SLA, matter, and branch pressure.       | `PD04` validates incomplete vs running SLA, matter behavior, and branch recommendation handling.            |
| `SP05` | Day 5 privacy, RBAC, and multi-tenant stress. | `PD05` validates tenant, branch, and aggregate-only boundaries plus high-volume registration stress.        |
| `SP06` | Day 6 communications and incident drill.      | `PD06` validates pilot-critical comms, observability review, and bounded incident or hotfix handling.       |
| `SP07` | Day 7 executive review.                       | `PD07` produces a final recommendation pack without changing canonical daily decision vocabulary.           |

## Proposed `current-program.md` Delta

After completed `P7`, add one new committed era:

`P8` supersedes the exploratory 14-day master pilot model with a reset-gate hardening slice and a seven-day pilot rehearsal. `P8` keeps completed `P7` history intact, requires a new pilot id, preserves the current pilot command model, and adds explicit multi-agent orchestration custody to each pilot day.

Then split the queue into:

- `P8R/RG01-RG05`
- `P8P/SP01-SP07`

## Proposed `current-tracker.md` Delta

Add these rows after completed `P7`:

| ID     | Status    | Owner           | Work                                                              | Exit Criteria                                                                                                                     |
| ------ | --------- | --------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `RG01` | `pending` | `platform + qa` | Stabilize `pilot:check` for the intended rehearsal environment.   | `pnpm pilot:check` passes deterministically in the intended environment and no longer fails through the Day 2 `db:rls:test` path. |
| `RG02` | `pending` | `platform + qa` | Align operator log-sweep docs with installed Vercel CLI behavior. | Operator-facing log instructions match actual supported Vercel CLI usage and are verified in the repo docs.                       |
| `RG03` | `pending` | `platform + qa` | Make observability-to-decision proof deterministic.               | `pnpm pilot:decision:record` accepts fresh observability references reliably with no manual repair loop.                          |
| `RG04` | `pending` | `platform + qa` | Clarify daily-sheet versus canonical evidence state.              | Docs clearly distinguish working note sheets from the copied evidence index and canonical command writes.                         |
| `RG05` | `pending` | `platform + qa` | Re-run a clean preflight proving reset-gate closure.              | Fresh `pnpm pilot:check` and fresh `pnpm release:gate:prod -- --pilotId <new-pilot-id>` both pass under the reset-gate rules.     |
| `SP01` | `pending` | `platform + qa` | Day 1 release and artifact baseline.                              | `PD01` completes with green artifact custody and canonical evidence rows.                                                         |
| `SP02` | `pending` | `platform + qa` | Day 2 rollback and resume baseline.                               | `PD02` proves rollback-tag discipline and resume proof cleanly under the reset-gate model.                                        |
| `SP03` | `pending` | `platform + qa` | Day 3 closed-loop role flow.                                      | `PD03` validates member -> agent -> staff -> branch_manager -> admin continuity and boundary-safe handoffs.                       |
| `SP04` | `pending` | `platform + qa` | Day 4 SLA, matter, and branch pressure.                           | `PD04` validates incomplete vs running SLA, matter behavior, and branch recommendation handling.                                  |
| `SP05` | `pending` | `platform + qa` | Day 5 privacy, RBAC, and multi-tenant stress.                     | `PD05` validates tenant, branch, and aggregate-only boundaries plus high-volume registration stress.                              |
| `SP06` | `pending` | `platform + qa` | Day 6 communications and incident drill.                          | `PD06` validates pilot-critical comms, observability review, and bounded incident or hotfix handling.                             |
| `SP07` | `pending` | `platform + qa` | Day 7 executive review.                                           | `PD07` produces a final recommendation pack without changing canonical daily decision vocabulary.                                 |

## Later Canonical Docs To Update

After promotion, the canonical update set should include:

- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`
- `docs/pilot/PILOT_RUNBOOK.md`
- `docs/pilot/PILOT_GO_NO_GO.md`
- `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md`
- `docs/pilot/PILOT_DAILY_SHEET_TEMPLATE.md`

## Historical Evidence Rule

Day 1 and Day 2 from the superseded pilot remain part of the historical evidence base.

They justify the redesign, but they do not become Day 1 and Day 2 of the new `P8P` run. `P8P` must start fresh with a new pilot id.

## Summary

The clean promotion order is:

1. keep `P7` complete and historical
2. promote `P8R`
3. close the reset gate
4. promote and execute `P8P`
5. consider `P9` only after the new rehearsal produces usable evidence
