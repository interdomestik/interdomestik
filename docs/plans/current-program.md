---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-17
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This is the only document allowed to define the current phase, committed priorities, and sequencing for repository execution.

## Current Phase

Repository authority is between governed slices. The most recent completed slice is
`IDA-CI05-PILOT-SONAR-CRITICAL-PATH-DECOUPLING`; its implementation and closeout are
recorded in the current tracker. No replacement product, architecture, governance, or
runtime slice is promoted.

The architecture-finalization program remains the conditional authority when an exact
design gate promotes one of its tracker items. Phase C guardrails remain binding: canonical
routes and clarity markers are preserved, `apps/web/src/proxy.ts` stays read-only unless
explicitly authorized, Paddle remains the billing provider, and tenancy/RLS work requires
its own approved scope and evidence.

## Ordered Candidate Priorities

| Priority | Candidate                         | Current disposition                                                                                                                        |
| -------: | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
|        1 | Fresh current-authority selection | Audit current product and architecture trackers, then propose exactly one smallest valuable slice through a content-addressed design gate. |

This table is a selection order, not runtime authority. A candidate becomes active only
after its exact gate is merged, repository authority converges, and a separate exact runtime
receipt is approved when the risk contract requires one.

## Selection Constraints

- Select one outcome and one slice; do not combine product, architecture, CI, AI OS, or
  housekeeping work.
- Prefer direct user/business value, bounded dependencies, low protected-surface risk,
  focused proof, and explicit rollback.
- Repository source, `AGENTS.md`, tests, current program/tracker, relevant architecture
  tracker, resolver, PR checks, finalizer, and merged evidence are final authority.
- Obsidian and AI OS are advisory memory. They cannot promote or authorize repository work.
- Current docs replace their one compact state at selection and closeout. Detailed gate,
  review, PR, CI, runtime, and rollback evidence belongs in the stable per-slice artifact and
  is linked rather than copied here.

## Historical Authority

All authority history through Rev 243 is recoverable byte-for-byte from Git through
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The next active governed implementation goal is blocked pending a fresh current-authority/design-gate selection; resolver target is `blocked_requires_current_authority`, `activeSlice=null`.
