# V1.0.0 Bulletproof Program (Operational)

Status: NO-GO (bulletproof v1.0.0)
Program start: 2026-02-23
Target tag window: 2026-04-16
Source baseline SHA: 083cca9c3ff50a21a5dba6cf42bb5ba2ecbd1e71

## Objective

Deliver a bulletproof v1.0.0 for a multi-tenant claims and billing product with provable tenant isolation, MoR-by-entity billing correctness, deterministic release gates, and no flaky/skip-based false greens.

## Global Non-Negotiables

1. Any cross-tenant unauthorized 200 is stop-the-line.
2. Any webhook accepted without valid entity-bound signature is stop-the-line.
3. Any replay that double-posts activation/invoice/ledger is stop-the-line.
4. Any required RC suite skip/fixme/quarantine is stop-the-line.
5. Any RC run where RLS integration is skipped is stop-the-line.

## PR Discipline (Mandatory)

1. Commit scoped changes and push.
2. Wait for required CI checks on the pushed SHA.
3. Run `pnpm pr:finalize` to verify required checks and unresolved review threads.
4. Address all review comments (including Copilot feedback), push, and rerun `pnpm pr:finalize`.
5. Merge only when `pnpm pr:finalize` passes on the latest SHA.

## Streak Reset Scope (10-day evidence policy)

Reset streak if a PR changes:

- apps/web/src/proxy.ts
- apps/web/src/lib/proxy-logic.ts
- apps/web/src/lib/tenant/\*\*
- apps/web/src/lib/auth/\*\*
- apps/web/src/server/auth/\*\*
- apps/web/src/app/api/\*\*
- packages/shared-auth/\*\*
- packages/database/\*\*
- packages/domain-membership-billing/\*\*
- .github/workflows/\*\*
- scripts/release-gate/\*\*

Do not reset for docs-only or UI-copy-only changes that do not touch the paths above.

## Milestones

### M0-A (2026-02-23 to 2026-02-27): Gate Foundation

Goal: convert policy into machine-enforced RC checks.

Exit criteria:

- required-suite manifest exists and is verified against reports.
- no-skip/fixme/quarantine checker exists for required suites.
- RC workflow exists and publishes immutable artifacts.
- secret scan blocks on release and rc branches.

### M0-B (2026-02-28 to 2026-03-08): Security and Isolation Closure

Goal: fail-closed tenant boundary posture with deterministic RLS proof.

Exit criteria:

- REQUIRE_RLS_INTEGRATION=1 enforced; RLS integration cannot skip.
- host/session mismatch fails closed in sensitive surfaces.
- member upload ownership and membership tenant scoping covered by tests.
- AL tenant config added (dark), isolation matrix green.

### M1 (2026-03-09 to 2026-03-22): MoR by Tenant Entity

Goal: billing correctness by entity (KS/MK/AL).

Exit criteria:

- entity-bound webhook routing implemented.
- one-secret verification per entity; metadata mismatch rejected.
- idempotency and transaction linkage constraints enforced.
- invoice and append-only ledger invariants pass.

### M2 (2026-03-23 to 2026-03-29): Analytics and Growth Instrumentation

Goal: trusted funnel and retention telemetry.

Exit criteria:

- funnel coverage across landing -> activation -> first claim.
- tenant_id and experiment variant captured at >=99%.
- paid activation telemetry differs <=2% from DB truth.

### M3 (2026-03-30 to 2026-04-05): Conversion UX Package

Goal: measurable membership conversion uplift without risk regressions.

Exit criteria:

- hero-v2 funnel fragmentation removed.
- plan continuity pricing -> register -> checkout implemented.
- dashboard next-best-action flow live.
- A/B tests launched with guardrails.

### M4 (2026-04-06 to 2026-04-15): Evidence Streak and Tag Readiness

Goal: 10 consecutive daily full-green RC runs with immutable evidence.

Exit criteria:

- 10/10 daily RC evidence packs complete and valid.
- no streak reset trigger during the window.
- no open P0/P1 in tenant isolation, billing, or release gates.

## Daily RC Command Pack

1. pnpm security:guard
2. REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test
3. pnpm pr:verify:hosts
4. pnpm -s release:gate:p0:raw --baseUrl http://127.0.0.1:3000
5. pnpm -s release:gate:p1:raw --baseUrl http://127.0.0.1:3000
6. pnpm -s release:gate:raw --suite all --baseUrl http://127.0.0.1:3000
7. node scripts/release-gate/check-no-skip.mjs --manifest scripts/release-gate/v1-required-specs.json
8. node scripts/release-gate/verify-required-specs.mjs --manifest scripts/release-gate/v1-required-specs.json --playwright-json apps/web/test-results/report.json --junit apps/web/test-results/junit.xml
9. node scripts/release-gate/write-rc-manifest.mjs
10. node scripts/release-gate/streak/capture-streak.mjs

## Tag Decision (v1.0.0)

GO only if all milestones exited cleanly and the 10-day streak is complete.
