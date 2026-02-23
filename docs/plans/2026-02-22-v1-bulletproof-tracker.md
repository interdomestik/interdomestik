# V1.0.0 Bulletproof Tracker

Last updated: 2026-02-23
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

## Mandatory Test Delta (A12-A22)

1. If code behavior changes, add/update at least one unit test in the same PR.
2. If boundary/user-flow behavior changes (tenant/auth/api/billing/funnel), add/update integration or e2e coverage in the same PR.
3. Document both test deltas in the action evidence line with exact command(s).
4. If no test delta is added for a behavior change, block merge unless Atlas + Sentinel + Gatekeeper approve and note the exception in Notes Log.

## Completed

- [x] P00 - Program ratified and persisted in-repo (this file + program file) | Date: 2026-02-22 | Evidence: git history
- [x] A01 - Required-suite manifest added at `scripts/release-gate/v1-required-specs.json` | Date: 2026-02-22 | Evidence: `jq . scripts/release-gate/v1-required-specs.json` + per-spec file existence check
- [x] A02 - Required-suite no-skip checker added at `scripts/release-gate/check-no-skip.mjs` | Date: 2026-02-22 | Evidence: `node scripts/release-gate/check-no-skip.mjs --manifest scripts/release-gate/v1-required-specs.json` + temp-manifest injected `test.skip` exits 1
- [x] A03 - RC evidence manifest writer added at `scripts/release-gate/write-rc-manifest.mjs` | Date: 2026-02-22 | Evidence: `node scripts/release-gate/write-rc-manifest.mjs --manifest scripts/release-gate/v1-required-specs.json --run-id test-run --results-dir tmp/release-rc/test-run/results --logs-dir tmp/release-rc/test-run/logs` + `jq . tmp/release-rc/test-run/rc.json` + `tmp/release-rc/test-run/rc.json.sha256`
- [x] A04 - Streak anchor/capture scripts added at `scripts/release-gate/streak/compute-anchor.mjs` and `scripts/release-gate/streak/capture-streak.mjs` | Date: 2026-02-22 | Evidence: `node scripts/release-gate/streak/compute-anchor.mjs` + `node scripts/release-gate/streak/capture-streak.mjs` + `tmp/release-streak/2026-02-22/run-2026-02-22T21-19-34-841Z-e012d7af/pack.sha256`
- [x] A05 - Playwright gate reporters emit JUnit/XML and JSON outputs at `apps/web/test-results/junit.xml` and `apps/web/test-results/report.json` | Date: 2026-02-22 | Evidence: `pnpm --filter @interdomestik/web exec playwright test e2e/gate --project=gate-ks-sq --workers=1` + `test -f apps/web/test-results/junit.xml` + `test -f apps/web/test-results/report.json`
- [x] A06 - Release-candidate workflow added at `.github/workflows/release-candidate.yml` | Date: 2026-02-22 | Evidence: `https://github.com/interdomestik/interdomestik/actions/runs/22286625815` + artifact `release-candidate-artifacts-22286625815-1`
- [x] A07 - Secret scan blocking on `release/*` and `rc/*` in security workflows | Date: 2026-02-22 | Evidence: `rg -n "continue-on-error:\\s*true|gitleaks|secret" .github/workflows/security.yml .github/workflows/secret-scan.yml` + PR runs `22287449326` (Security) / `22287449314` (Secret Scan) + RC smoke runs `22287448408` (Security) / `22287448415` (Secret Scan)
- [x] A08 - Enforce mandatory RLS integration for RC (`REQUIRE_RLS_INTEGRATION=1`) | Date: 2026-02-23 | Evidence: `REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test` exits non-zero when `DATABASE_URL` is missing; `pnpm db:rls:test` preserves local skip ergonomics when DB env is absent; `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test` prints `RLS_INTEGRATION_RAN=1`
- [x] A09 - Unify tenant resolver usage in sensitive surfaces | Date: 2026-02-23 | Evidence: `pnpm --filter @interdomestik/web test:unit --run src/lib/tenant/tenant-hosts.test.ts` + `pnpm --filter @interdomestik/web test:unit --run 'src/app/api/auth/[...all]/_core.test.ts'` + `KS_HOST=ks.127.0.0.1.nip.io:3000 MK_HOST=mk.127.0.0.1.nip.io:3000 PILOT_HOST=pilot.127.0.0.1.nip.io:3000 pnpm --filter @interdomestik/web exec playwright test e2e/gate/tenant-resolution.spec.ts --project=gate-ks-sq --project=gate-mk-mk --workers=1 --max-failures=1`
- [x] A10 - Enforce member upload ownership | Date: 2026-02-23 | Evidence: `pnpm --filter @interdomestik/web test:unit --run src/app/api/uploads/route.test.ts src/features/member/claims/actions.test.ts`
- [x] A11 - Implement fail-closed rate limits on sensitive endpoints | Date: 2026-02-23 | Evidence: `pnpm --filter @interdomestik/web test:unit --run src/lib/rate-limit.core.test.ts` + `pnpm --filter @interdomestik/web test:unit --run 'src/app/api/auth/[...all]/route.test.ts' src/app/api/register/route.test.ts src/app/api/webhooks/paddle/route.test.ts src/app/api/uploads/route.test.ts` + `pnpm pr:finalize`

## Next Up (work top-down)

1. A12 - Add tenant predicates for membership/subscription reads

## Milestone Actions

### M0-A Gate Foundation (2026-02-23 to 2026-02-27)

- [x] A01 - Create required-suite manifest. Verify: `node scripts/release-gate/verify-required-specs.mjs --manifest scripts/release-gate/v1-required-specs.json --playwright-json apps/web/test-results/report.json` | Date: 2026-02-22 | Evidence: `scripts/release-gate/v1-required-specs.json` + `jq` + spec file existence check
- [x] A02 - Enforce no skip/fixme/quarantine in required suites. Verify: `node scripts/release-gate/check-no-skip.mjs --manifest scripts/release-gate/v1-required-specs.json` | Date: 2026-02-22 | Evidence: emits `file:line: matched_token` and exits non-zero on violations
- [x] A03 - Write rc.json evidence contract. Verify: `node scripts/release-gate/write-rc-manifest.mjs --manifest scripts/release-gate/v1-required-specs.json --run-id test-run --results-dir tmp/release-rc/test-run/results --logs-dir tmp/release-rc/test-run/logs` | Date: 2026-02-22 | Evidence: `tmp/release-rc/test-run/rc.json` + `tmp/release-rc/test-run/rc.json.sha256` + `checks.rls_integration_ran=true`
- [x] A04 - Add streak anchor and daily capture scripts. Verify: `node scripts/release-gate/streak/compute-anchor.mjs && node scripts/release-gate/streak/capture-streak.mjs` | Date: 2026-02-22 | Evidence: `anchor_sha=bccc12e6333ebb0f8d916d483d3c4f529ff45ac4` + `tmp/release-streak/2026-02-22/run-2026-02-22T21-19-34-841Z-e012d7af/pack.sha256`
- [x] A05 - Update Playwright to emit JUnit and JSON reports. Verify: `pnpm --filter @interdomestik/web exec playwright test e2e/gate --project=gate-ks-sq --workers=1` | Date: 2026-02-22 | Evidence: `apps/web/playwright.config.ts` reporter includes `junit` + `json` outputFile settings and gate run emits both files in `apps/web/test-results/`
- [x] A06 - Add release-candidate workflow. Verify: run `.github/workflows/release-candidate.yml` on `rc/*` branch | Date: 2026-02-22 | Evidence: run `22286625815` (`rc/pr6-a06-smoke`) uploaded artifact `release-candidate-artifacts-22286625815-1` with release-gate outputs + test results + rc manifest + streak pack
- [x] A07 - Make secret scan blocking on `release/*` and `rc/*`. Verify: workflow triggers on `rc/**` + `release/**`; gitleaks runs blocking in both workflows and uploads SARIF artifact evidence | Date: 2026-02-22 | Evidence: PR runs `22287449326` / `22287449314`; RC smoke runs `22287448408` / `22287448415`

### M0-B Security and Isolation Closure (2026-02-28 to 2026-03-08)

- [x] A08 - Enforce mandatory RLS integration for RC (`REQUIRE_RLS_INTEGRATION=1`). Verify: `REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test` | Date: 2026-02-23 | Evidence: required mode hard-fails on missing `DATABASE_URL` and missing RLS/policy prerequisites; RC marker is emitted only by integration run path (`RLS_INTEGRATION_RAN=1`)
- [x] A09 - Unify tenant resolver usage in sensitive surfaces. Verify: targeted unit tests + isolation scenario | Date: 2026-02-23 | Evidence: canonical resolver `resolveTenantIdFromSources` is now used by `apps/web/src/lib/proxy-logic.ts`, `apps/web/src/app/api/auth/[...all]/_core.ts`, `apps/web/src/app/api/register/route.ts`, `apps/web/src/app/api/simple-register/route.ts`; targeted unit commands pass and gate isolation contract pass command above is green
- [x] A10 - Enforce member upload ownership. Verify: upload/member action unit tests | Date: 2026-02-23 | Evidence: upload API + member server action enforce claim ownership with safe deny behavior; `pnpm --filter @interdomestik/web test:unit --run src/app/api/uploads/route.test.ts src/features/member/claims/actions.test.ts`
- [x] A11 - Implement fail-closed rate limits on sensitive endpoints. Verify: rate-limit core unit tests | Date: 2026-02-23 | Evidence: strict production-sensitive fail-closed behavior for `/api/auth/*`, `/api/register/*`, `/api/webhooks/paddle/*`, and `/api/uploads` with `503 + Retry-After + RATE_LIMIT_BACKEND_MISSING` in `apps/web/src/lib/rate-limit.core.ts`; `pnpm --filter @interdomestik/web test:unit --run src/lib/rate-limit.core.test.ts`; `pnpm --filter @interdomestik/web test:unit --run 'src/app/api/auth/[...all]/route.test.ts' src/app/api/register/route.test.ts src/app/api/webhooks/paddle/route.test.ts src/app/api/uploads/route.test.ts`; `pnpm pr:finalize`
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

## Test Delta Checklist (use in every A12-A22 PR)

- [ ] Unit test delta added for changed logic files.
- [ ] Integration/e2e test delta added for changed boundary or user-flow behavior.
- [ ] No skip/fixme/quarantine introduced in required suites.
- [ ] Tracker evidence line includes exact test commands executed.

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

- 2026-02-23: Added mandatory test-delta policy for A12-A22 (unit + integration/e2e in same PR for behavior changes).
- 2026-02-23: A11 handoff status: Atlas confirmed A11 scope and sensitive endpoint list (`/api/auth/*`, `/api/register/*`, `/api/webhooks/paddle/*`, `/api/billing/*`, checkout-session creation endpoints, mutation-heavy claim endpoints) and repo applicability (`/api/billing/*` and checkout-session routes not present; claim mutation route applicable at `/api/uploads`); Forge implemented fail-closed production-sensitive behavior in `apps/web/src/lib/rate-limit.core.ts` with `RATE_LIMIT_BACKEND_MISSING` telemetry plus strict call-site wiring in `apps/web/src/app/api/auth/[...all]/route.ts`, `apps/web/src/app/api/register/route.ts`, `apps/web/src/app/api/webhooks/paddle/route.ts`, `apps/web/src/app/api/uploads/route.ts`; Sentinel pre-review completed for auth/api boundary paths before gate; Gatekeeper verified targeted unit evidence (`pnpm --filter @interdomestik/web test:unit --run src/lib/rate-limit.core.test.ts` and `pnpm --filter @interdomestik/web test:unit --run 'src/app/api/auth/[...all]/route.test.ts' src/app/api/register/route.test.ts src/app/api/webhooks/paddle/route.test.ts src/app/api/uploads/route.test.ts`) and owns final `pnpm pr:finalize` merge gate; Sentinel post-review completed for boundary-impacting updates.
- 2026-02-23: A10 handoff status: Atlas confirmed boundary-impacting scope/acceptance paths (`apps/web/src/features/member/claims/actions.ts`, `apps/web/src/app/api/uploads/route.ts`, `apps/web/src/app/api/uploads/_core.ts`, `apps/web/src/app/api/uploads/route.test.ts`, `apps/web/src/features/member/claims/actions.test.ts`) and A10 criteria (member-only claim upload ownership at route+action layer, safe deny, no path/upload URL leak); Forge implemented owner-scoped claim predicates in member upload actions with safe 404 responses and added ownership denial assertions in route tests + new action unit tests; Sentinel pre-review completed for auth/tenant/api boundary changes, Gatekeeper verified targeted unit test evidence command above, Sentinel post-review completed for boundary impact with no route contract changes.
- 2026-02-23: A09 handoff status: Atlas confirmed boundary-impacting scope/acceptance paths (`apps/web/src/lib/tenant/tenant-hosts.ts`, `apps/web/src/lib/proxy-logic.ts`, `apps/web/src/app/api/auth/[...all]/_core.ts`, `apps/web/src/app/api/register/route.ts`, `apps/web/src/app/api/simple-register/route.ts`), Forge implemented canonical source resolver and host/session fail-closed guard on `/api/register`, Sentinel pre-review completed for tenant/auth/api boundary changes, Gatekeeper verified targeted unit commands + gate isolation contract (`e2e/gate/tenant-resolution.spec.ts` on `gate-ks-sq` + `gate-mk-mk`); requested pilot scenario command with gate projects currently reports `No tests found` due project `testMatch` scoping, Sentinel post-review pending before merge.
- 2026-02-23: A08 handoff status: Atlas confirmed boundary-impacting scope (`packages/database/test/rls-engaged.test.ts` + RC workflow marker path), Forge implemented required-mode hard-fail behavior and integration-only marker emission, Sentinel pre-review completed for `packages/database` changes, Gatekeeper verified required/non-required/integration-capable command evidence (`REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test`, `pnpm db:rls:test`, `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test`); Sentinel post-review pending before merge.
- 2026-02-22: A07 handoff completed: Atlas confirmed A07 scope/touched files (`.github/workflows/security.yml`, `.github/workflows/secret-scan.yml`), Runway implemented rc/release triggers + blocking gitleaks CLI with SARIF artifact uploads, Gatekeeper verified `rg` policy check and PR/RC workflow evidence (`22287449326`, `22287449314`, `22287448408`, `22287448415`); Sentinel review not required (no boundary-owned product paths touched).
- 2026-02-22: A06 handoff completed: Atlas confirmed A06 slice/dependencies (`.github/workflows/release-candidate.yml` + tracker evidence update; A04/A05 present), Runway implemented RC orchestration, Gatekeeper verified formatting + RC branch run `22286625815` and artifact upload `release-candidate-artifacts-22286625815-1`; Sentinel review not required (no boundary-owned product paths touched).
- 2026-02-22: A05 handoff completed: Atlas confirmed scope/path (`apps/web/playwright.config.ts` only, no boundary-owned paths), Forge implemented reporter outputs, Gatekeeper verified gate command + reporter artifacts; Sentinel review not required.
- 2026-02-22: A04 handoff completed: Atlas confirmed A04 scope/dependencies (`scripts/release-gate/streak/*` + tracker evidence update), Runway implemented, Gatekeeper verified via required local commands; Sentinel review not required (no boundary-owned paths touched).
- 2026-02-22: A04 completed (added streak anchor/capture scripts with repo-relative path handling, immutable run directory policy, and pack-level SHA256 checksums).
- 2026-02-22: A03 completed (RC evidence manifest writer added; emits `rc.json` and `rc.json.sha256`, with `checks.rls_integration_ran=true` from `rls.log` marker).
- 2026-02-22: A02 completed (no-skip checker added; required-suite scan currently reports existing `test.skip` violations as intended by policy).
- 2026-02-22: A01 completed (required-suite manifest created and validated).
- 2026-02-22: Tracker created and linked to operational plan.
