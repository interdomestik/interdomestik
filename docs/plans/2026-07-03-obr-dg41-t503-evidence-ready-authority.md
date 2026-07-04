---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-03
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# OBR-DG41: T-503 Evidence-Ready Waiver/Intake Authority

## Classification

This gate is Tier 0 governance/evidence work. It records the post-DG40
G01-G10 evidence disposition and decides whether the final M0-M5 implementation
candidate, `T-503`, may resume as a governed Tier 3 destructive implementation
slice. It does not change source/runtime code, database schema, RLS, migrations,
proxy/routing, auth/session, tenancy, billing, product UI, dependencies,
README, AGENTS, or broad architecture documentation.

## Inputs

- `OBR-DG39` identified `T-503` as the final remaining status-bearing M0-M5
  candidate.
- `OBR-DG40` accepted controlled-continuation evidence only and kept direct
  destructive `claims.status` removal blocked until final qualifying
  release-cycle or explicitly approved equivalent evidence records G04/G05/G09/G10
  disposition or waiver.
- `docs/release/production-evidence.yaml` now records all G01-G10 gates with
  non-pending statuses, artifact paths, SHA-256 hashes, signer names, signer
  roles, and signature dates.
- `pnpm release:evidence:check` passed in the dependency-ready canonical
  worktree on 2026-07-03 with `[release-evidence] PASS gates=10`.
- The clean DG41 worktree was created at
  `/Users/arbenlila/development/interdomestik-crystal-home-t503-dg41` because
  the original worktree had unrelated branch history and pre-existing untracked
  `docs/product/*` files that blocked a direct branch switch.

## Evidence Disposition

The following gates are supplied:

- G01 roster/access signoff.
- G02 supervisor release-cycle approval.
- G03 sponsor invoice acceptance.
- G06 terms/privacy approval.
- G07 access matrix approval.
- G08 activation acceptance ratification.

The following gates are explicitly waived for T-503 implementation readiness,
not final business closure:

- G04 bank payment proof mapping remains a controlled finance exception and does
  not authorize final `PAID`.
- G05 600 MKD reconciliation remains a controlled finance exception and does
  not authorize finance closure.
- G09 POA/consent/service-fee terms remain a controlled legal-authority
  exception and do not replace claimant-specific POA/consent where required.
- G10 closure evidence remains a controlled legal/finance closure exception and
  does not authorize final `CLOSED`.

The waiver disposition is accepted only as explicitly approved equivalent
evidence for starting the destructive T-503 implementation path. It is not final
settlement, final recovery, final paid-state, final individual representation,
or final closure proof.

## Decision

Promote exactly one canonical tracker slice: `T-503`.

The next active governed implementation goal is exactly one canonical tracker
slice: `T-503`.

Future `T-503` is limited to:

- revalidating the G01-G10 evidence manifest and hashes on the implementation
  branch;
- proving current lifecycle data quality before destructive migration;
- dropping legacy `claims.status` and obsolete status indexes/predicates only
  after rollback, data-repair, observability, and compatibility proof;
- preserving any public/member/agent/staff/admin status-shaped output only as
  derived lifecycle compatibility;
- satisfying Tier 3 DB/RLS/migration/reviewer/security gates;
- obtaining explicit human approval or waiver before implementation merge
  readiness.

This gate does not authorize M6/product expansion, broad VONESA/SVC/CQRS/UI/UX
work, proxy/routing/auth/session/tenancy changes, billing/product UI, Dependabot
work, README, AGENTS, Operational Brain runtime/live AI, or broad architecture
rewrites.

## Current Authority Outcome

After this gate merges, resolver state is expected to promote `T-503` as the
only active governed implementation slice. Direct runtime work must still run as
Tier 3 implementation from a clean branch and must treat G04/G05/G09/G10 as
controlled exceptions, not final closure proof.
