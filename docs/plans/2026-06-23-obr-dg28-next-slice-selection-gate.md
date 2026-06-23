---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-23
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# OBR-DG28 Post-T506a Next Slice Selection Gate

## Decision

Promote exactly one next governed implementation slice: `T-506`.

Direct implementation remains blocked until this gate merges and
`next-slice.mjs` resolves exactly `T-506`, class `implementation`, Tier 3.

## Evidence

- `T-506a` implementation PR `#1178` merged at
  `710e0a5e80045ead2e98379aa11d9e39da19e366` from final head
  `ce678228540258524fb3032ad6f96117cc64eef0`.
- `T-506a` closeout/current-authority PR `#1179` merged at
  `16ec017996d19345b063329101697ecec8c1e0d7` from final head
  `e9682fdf86dba26ab215b3694234e5f0e28c4f8e`.
- Post-closeout main health at `16ec0179` is green for CI, Sonar Main Gate,
  Secret Scan/gitleaks, and CodeQL. CD/Vercel is deployment-only evidence.
- Pre-gate resolver proof on clean main:
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`.
- Open Dependabot PR `#1128` remains out of scope.

## Candidate Comparison

| Candidate | Disposition | Rationale                                                                                                                                                                                                  |
| --------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T-501`   | Parked      | Valuable live-cutover work, but route/proxy/login and host redirect impact make it higher blast radius than the now-unblocked entity migration chain.                                                      |
| `T-502`   | Parked      | Route/layout consolidation deletes legacy routes and removes host branching; it is broad route/product surface and should not precede the already-prepared `T-506` migration.                              |
| `T-503`   | Parked      | Direct destructive `claims.status` drop remains blocked by release-cycle/destructive-migration proof and should not be promoted incidentally.                                                              |
| `T-505`   | Parked      | ADR-06 live cutover/cookie-session precedence depends on `T-501`, so it is not the next independent implementation slice.                                                                                  |
| `T-506`   | Selected    | Its tracker prerequisites are complete: `T-506a` readiness dry-run, `T-112` entity-of-record foundation, and `T-507` residence-change/DSR policy. It is the direct follow-on M5 dependency after `T-506a`. |

## Promoted Scope

`T-506` is limited to write-capable member/entity migration with:

- active-case guard for terminal versus non-terminal recovery lifecycle states,
- documented run-off posture where non-terminal cases cannot migrate,
- terms re-issue under the new governing law,
- acceptance recapture,
- history preservation,
- `membership.entity_migrated` emission,
- dry-run/apply parity,
- rollback and data-repair proof,
- ADR-12 migration semantics,
- low-privilege DB/RLS proof for tenant-scoped reads/writes,
- explicit human approval or waiver before merge readiness.

## Forbidden Scope

This gate does not authorize implementation. It also does not authorize
`T-501`, `T-502`, direct destructive `T-503`, `T-505`, proxy/routing/auth/session
changes outside the promoted migration envelope, billing/product UI, Operational
Brain runtime/live AI, high/medium CodeQL batches, Dependabot work, README,
AGENTS, broad M3/M4/M5, or broad architecture rewrites.

## Required Future Evidence

The future `T-506` worker must provide:

- active-slice proof resolving exactly `T-506`, implementation, Tier 3,
- focused migration/domain tests for eligible and blocked members,
- active-case guard tests for terminal and non-terminal recovery states,
- terms/governing-law/acceptance recapture proof,
- low-privilege tenant-scoped DB/RLS tests where DB access is used,
- schema/migration/RLS tests if any database shape changes are required,
- rollback/data-repair plan and operator evidence,
- no cross-tenant/entity leakage proof,
- `pnpm check:db-access`,
- `pnpm db:rls:test:required` when applicable,
- `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate`,
- PR current-head CI, Sonar, CodeQL, gitleaks, pnpm-audit/security,
  pr-finalizer, Pilot Gate, and PR E2E,
- Codex/Copilot feedback disposition,
- bounded Sonnet plus Gemini Tier 3 review if callable/available, with Opus
  only for unresolved high-risk ambiguity,
- Codex Security diff scan if available, or exact manual-start friction
  classification,
- human approval or explicit waiver before merge readiness.
