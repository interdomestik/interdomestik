---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-24
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 closeout/current-authority record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# T-110 Host ID Telemetry Closeout

## Decision

Close `T-110` as complete. Promote no replacement implementation slice.

Direct work remains blocked until a fresh current-authority/design-gate PR
selects exactly one next governed M0-M5 slice.

## Evidence

- `T-110` implementation PR `#1199` merged at
  `9bea383d202330a9c81e26a7c89c21feb8ad9909` from final implementation head
  `6bfb28fce91a34ac47b75cf77f446b706bcfee8f`.
- PR current-head checks were green before merge for CI `28135742047`
  including unit job `83322058813` and DB-backed `e2e-gate` job
  `83322058880`; PR E2E `28135742065` / job `83322032308`; Pilot Gate
  `28135742078` including runner job `83322290335`; SonarCloud Code Analysis;
  Secret Scan/gitleaks `28135742099`; Security/pnpm-audit `28135742060`;
  Commitlint `28135742063`; `pr-finalizer` `28135742045`; and CodeQL
  `28135740105` including actions job `83322028885` and JavaScript/TypeScript
  job `83322028871`.
- Codex P2 review threads `PRRT_kwDOQ0Mhjc6MDzYL`,
  `PRRT_kwDOQ0Mhjc6MDzYO`, and `PRRT_kwDOQ0Mhjc6MDzYS` were fixed and resolved;
  the CodeQL review thread `PRRT_kwDOQ0Mhjc6MDxvU` was resolved after the
  substring-sanitization fix.
- Post-merge main health at `9bea383d` is green for CI `28136293686`,
  including unit job `83323799137` and DB-backed `e2e-gate` job
  `83323799139` with containers, E2E DB prep, RLS integration, and E2E Gate
  Suite success; Sonar Main Gate `28136293641`; Secret Scan/gitleaks
  `28136293658`; and CodeQL `28136293153`. CD/Vercel is deployment-only
  evidence and ignored for product readiness.
- Resolver proof on merged main still returned active `T-110` before this
  closeout because current-authority had not yet recorded completion.

## Completed Scope

`T-110` added bounded entry `host_id` telemetry as data:

- auth/proxy telemetry and claim domain-event writes can record the entry
  host-derived host id where the host model already recognizes a compatibility
  alias;
- `domain_events.host_id` is nullable, allowlisted, and validated before event
  insertion;
- direct claim submit/create and claim status transition entry points thread
  host id into case-created and status-changed events;
- forwarded hosts remain untrusted by default for host-id telemetry unless an
  explicit trusted-forwarded-host option is supplied;
- `host_id` is not used for tenant resolution, access-tenant resolution,
  legal-entity selection, booking authority, recovery authority, routing,
  auth/session authority, or billing authority.

## Scope Boundaries

Scope excluded `apps/web/src/proxy.ts`, canonical route changes, auth/session
or tenancy runtime refactors, schema/RLS/migrations beyond the additive
`domain_events.host_id` telemetry envelope, billing/product UI, README, AGENTS,
`T-002b`, direct destructive `T-503`, M6/product expansion,
VONESA/SVC/CQRS/UI/UX implementation, Dependabot work, Operational Brain
runtime/live AI, and broad architecture rewrites.

## Next Authority

The remaining status-bearing M0-M5 rows are `T-002b` and direct destructive
`T-503`.

This closeout promotes neither:

- `T-002b` is service/flight/SVC-adjacent and should receive a fresh exact
  current-authority/design-gate decision before implementation.
- Direct destructive `T-503` still requires qualifying release-cycle proof,
  rollback/data-repair evidence, and fresh explicit destructive approval.

Expected resolver state after this closeout is
`blocked_requires_current_authority` with `activeSlice=null`.
