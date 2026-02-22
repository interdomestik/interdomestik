# V1.0.0 Bulletproof Tracker

Last updated: 2026-02-22
Current phase: M0-A (Gate Foundation)
Plan reference: docs/plans/2026-02-22-v1-bulletproof-program.md
Status command: pnpm v1:status

## Mandatory PR Loop (every PR)

1. Commit scoped changes.
2. Push branch.
3. Wait for CI.
4. Run `pnpm pr:finalize` (verifies required checks and unresolved review threads, including Copilot threads).
5. Address all comments/threads.
6. Push updates.
7. Run `pnpm pr:finalize` again.
8. Merge only when finalizer passes on latest SHA.

## Completed

- [x] P00 - Program ratified and persisted in-repo (this file + program file) | Date: 2026-02-22 | Evidence: git history
- [x] A01 - Required-suite manifest added at `scripts/release-gate/v1-required-specs.json` | Date: 2026-02-22 | Evidence: `jq . scripts/release-gate/v1-required-specs.json` + per-spec file existence check
- [x] A02 - Required-suite no-skip checker added at `scripts/release-gate/check-no-skip.mjs` | Date: 2026-02-22 | Evidence: `node scripts/release-gate/check-no-skip.mjs --manifest scripts/release-gate/v1-required-specs.json` + temp-manifest injected `test.skip` exits 1
- [x] A03 - RC evidence manifest writer added at `scripts/release-gate/write-rc-manifest.mjs` | Date: 2026-02-22 | Evidence: `node scripts/release-gate/write-rc-manifest.mjs --manifest scripts/release-gate/v1-required-specs.json --run-id test-run --results-dir tmp/release-rc/test-run/results --logs-dir tmp/release-rc/test-run/logs` + `jq . tmp/release-rc/test-run/rc.json` + `tmp/release-rc/test-run/rc.json.sha256`

## Next Up (work top-down)

1. A04 - Add streak scripts at scripts/release-gate/streak/compute-anchor.mjs and scripts/release-gate/streak/capture-streak.mjs
2. A05 - Update Playwright to emit JUnit and JSON reports
3. A06 - Add release-candidate workflow

## Milestone Actions

### M0-A Gate Foundation (2026-02-23 to 2026-02-27)

- [x] A01 - Create required-suite manifest. Verify: `node scripts/release-gate/verify-required-specs.mjs --manifest scripts/release-gate/v1-required-specs.json --playwright-json apps/web/test-results/report.json` | Date: 2026-02-22 | Evidence: `scripts/release-gate/v1-required-specs.json` + `jq` + spec file existence check
- [x] A02 - Enforce no skip/fixme/quarantine in required suites. Verify: `node scripts/release-gate/check-no-skip.mjs --manifest scripts/release-gate/v1-required-specs.json` | Date: 2026-02-22 | Evidence: emits `file:line: matched_token` and exits non-zero on violations
- [x] A03 - Write rc.json evidence contract. Verify: `node scripts/release-gate/write-rc-manifest.mjs --manifest scripts/release-gate/v1-required-specs.json --run-id test-run --results-dir tmp/release-rc/test-run/results --logs-dir tmp/release-rc/test-run/logs` | Date: 2026-02-22 | Evidence: `tmp/release-rc/test-run/rc.json` + `tmp/release-rc/test-run/rc.json.sha256` + `checks.rls_integration_ran=true`
- [ ] A04 - Add streak anchor and daily capture scripts. Verify: `node scripts/release-gate/streak/compute-anchor.mjs && node scripts/release-gate/streak/capture-streak.mjs`
- [ ] A05 - Update Playwright to emit JUnit and JSON reports. Verify: `pnpm --filter @interdomestik/web exec playwright test e2e/gate --project=gate-ks-sq --workers=1`
- [ ] A06 - Add release-candidate workflow. Verify: run `.github/workflows/release-candidate.yml` on `rc/*` branch
- [ ] A07 - Make secret scan blocking on `release/*` and `rc/*`. Verify: security workflow fails on seeded secret

### M0-B Security and Isolation Closure (2026-02-28 to 2026-03-08)

- [ ] A08 - Enforce mandatory RLS integration for RC (`REQUIRE_RLS_INTEGRATION=1`). Verify: `REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test`
- [ ] A09 - Unify tenant resolver usage in sensitive surfaces. Verify: targeted unit tests + isolation scenario
- [ ] A10 - Enforce member upload ownership. Verify: upload/member action unit tests
- [ ] A11 - Implement fail-closed rate limits on sensitive endpoints. Verify: rate-limit core unit tests
- [ ] A12 - Add tenant predicates for membership/subscription reads. Verify: membership core unit tests
- [ ] A13 - Add AL dark tenant config and run KS/MK/AL matrix. Verify: scenario suite

### M1 MoR by Tenant Entity (2026-03-09 to 2026-03-22)

- [ ] A14 - Add billing entity mapping and strict env validation (KS/MK/AL). Verify: billing unit tests
- [ ] A15 - Add entity-bound webhook routes (`/api/webhooks/paddle/[entity]`). Verify: webhook route tests
- [ ] A16 - Verify signature with exactly one entity secret; reject mismatch. Verify: webhook unit tests
- [ ] A17 - Add idempotency + provider transaction linkage constraints. Verify: replay tests + DB constraints
- [ ] A18 - Add invoice and append-only ledger invariants by tenant/entity. Verify: invariant test suite
- [ ] A19 - Add billing B1-B4 scenarios (KS/MK/AL + replay + wrong entity). Verify: billing scenario suite

### M2 Analytics (2026-03-23 to 2026-03-29)

- [ ] A20 - Instrument funnel + retention with tenant_id and variant. Verify: analytics validation scripts/reports

### M3 UX Conversion (2026-03-30 to 2026-04-05)

- [ ] A21 - Restore full funnel in hero-v2 and plan continuity. Verify: e2e + experiment checks

### M4 Evidence Streak (2026-04-06 to 2026-04-15)

- [ ] A22 - Complete 10 consecutive daily full-green RC runs. Verify: daily artifact packs in `tmp/release-streak/`

## Daily RC Run Checklist

- [ ] Run `pnpm security:guard`
- [ ] Run `REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test`
- [ ] Run `pnpm pr:verify:hosts`
- [ ] Run p0/p1/all release gate suites
- [ ] Run no-skip checker
- [ ] Run required-suite verifier
- [ ] Write rc.json evidence
- [ ] Capture daily streak artifact

## Notes Log (append newest first)

- 2026-02-22: A03 completed (RC evidence manifest writer added; emits `rc.json` and `rc.json.sha256`, with `checks.rls_integration_ran=true` from `rls.log` marker).
- 2026-02-22: A02 completed (no-skip checker added; required-suite scan currently reports existing `test.skip` violations as intended by policy).
- 2026-02-22: A01 completed (required-suite manifest created and validated).
- 2026-02-22: Tracker created and linked to operational plan.
