# ARCH-M0-11 Tenant Host Lane Inventory And Guard

Status: complete
Slice: `ARCH-M0-11`
Tracker task: `T-011`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-02

## Scope

This slice closes the M0 Playwright host-as-tenant inventory and guardrail.
It does not change proxy, routing, auth, tenancy, schema, billing, or product
runtime behavior. Country-host lanes remain alias/regression-only until later
ida-first and explicit session-context slices (`T-108`, `T-109`, `T-114`).

The existing repo-native guard is `scripts/check-e2e-tenant-host-lanes.mjs`,
wired through `pnpm check:e2e-tenant-host-lanes`,
`pnpm check:e2e-contracts`, and `pnpm pr:verify`.

## Checked Surface

The guard checks:

- `apps/web/playwright.config.ts` project definitions for tenant-host base URLs,
  tenant-host env use, and forwarded-host headers.
- `apps/web/e2e/**/*.{ts,tsx}` for country-host literals, tenant-host envs,
  `x-forwarded-host`, and `tenantBaseUrl(...)` usage.
- New or changed dashboard/auth E2E specs by default, because unallowlisted E2E
  files using country hosts or forwarded-host tenant identity fail the guard.

Server/setup inventory:

- `apps/web/playwright.config.ts` defines the legacy country-host project lanes,
  tenant-host env defaults, project-level `x-forwarded-host` headers, and E2E
  web-server trusted origins.
- `scripts/run-e2e-lane.mjs` selects the existing project lanes (`gate-ks-sq`,
  `gate-mk-mk`, `gate-mk-contract`, `front-door-ida-*`) but does not introduce
  additional country-host literals.

## Project Inventory

Country-host project lanes are explicit alias/regression coverage:

- `gate-ks-sq`: legacy KS gate lane; country-host alias until ida/session-context lanes exist.
- `gate-mk-mk`: legacy MK gate lane; country-host alias until ida/session-context lanes exist.
- `gate-mk-contract`: MK host-scoped regression lane.
- `gate-al-sq`: AL alias/security lane.
- `crm-visual-ks-sq`: opt-in visual baseline on KS country alias.
- `crm-visual-mk-mk`: opt-in visual baseline on MK country alias.
- `setup-ks`: legacy KS auth-state bootstrap.
- `setup-mk`: legacy MK auth-state bootstrap.
- `ks-sq`: legacy full-suite KS alias lane.
- `mk-mk`: legacy full-suite MK alias lane.
- `pilot-mk`: pilot alias lane.
- `smoke`: legacy smoke lane on KS alias.

Neutral ida-first project lanes:

- `front-door-ida-ks`: `ida` host with explicit `x-tenant-id: tenant_ks`.
- `front-door-ida-mk`: `ida` host with explicit `x-tenant-id: tenant_mk`.

## File Inventory

Approved tenant-host E2E files are narrow and explicit:

- `apps/web/e2e/setup.state.spec.ts`: legacy auth-state bootstrap.
- `apps/web/e2e/fixtures/auth.fixture.ts`: propagates legacy project host headers.
- `apps/web/e2e/fixtures/auth.fixture.vitest.ts`: fixture unit contract sample.
- `apps/web/e2e/gate/register-tenant-attribution.spec.ts`: attribution contract.
- `apps/web/e2e/gate/tenant-resolution.spec.ts`: tenant resolution contract.
- `apps/web/e2e/gate/v1-live-surface-revalidation.spec.ts`: pilot/live revalidation.
- `apps/web/e2e/live/pilot-day1-drive.spec.ts`: live pilot alias check.
- `apps/web/e2e/live/pilot-day1-lifecycle.spec.ts`: live pilot alias check.
- `apps/web/e2e/live/temp-check-claims.spec.ts`: temporary live diagnostic.
- `apps/web/e2e/pilot/_host.ts`: pilot actor-host helper.
- `apps/web/e2e/pilot/c1-03-pilot-member-provisioning.spec.ts`: pilot cross-host provisioning.
- `apps/web/e2e/pilot/c1-04-pilot-staff-triage.spec.ts`: pilot cross-host staff triage.
- `apps/web/e2e/pilot/c2-02-cross-tenant-artifact-isolation.spec.ts`: cross-tenant artifact isolation.
- `apps/web/e2e/pilot/c2-03-cross-tenant-write-isolation.spec.ts`: cross-tenant write isolation.
- `apps/web/e2e/pilot/c2-04-cross-tenant-staff-member-write-isolation.spec.ts`: cross-tenant staff/member write isolation.
- `apps/web/e2e/pilot/scenario-01-ks-e2e.spec.ts`: pilot scenario actor check.
- `apps/web/e2e/support/admin-tenant-classification.ts`: admin tenant classification helper.

## Exception Policy

Exceptions are path-specific and reasoned in
`scripts/check-e2e-tenant-host-lanes.mjs`. No broad `e2e/**`,
dashboard/auth, generated, or country-host glob escape is allowed.

New dashboard/auth specs must use ida/session-context setup or an explicitly
approved inventory entry. Existing country-host lanes remain regression and
alias coverage only; they are not a pattern for new canonical dashboard/auth
coverage.

## Seeded Proof

Existing seeded guard tests prove both required failure modes:

- `scripts/ci/e2e-tenant-host-lanes.test.mjs` blocks a new auth spec that sets
  mixed-case `X-Forwarded-Host: ks.localhost:3000`.
- The same test file blocks new country-host Playwright project baseURL
  literals, including mixed-case hostnames and spread/conditional project arrays.

Focused verification:

- `pnpm check:e2e-tenant-host-lanes -- --inventory`
- `node --test scripts/ci/e2e-tenant-host-lanes.test.mjs`

## Repo-Size Budget

The new tracked inventory packet required a tight budget move:
`maxTrackedFiles` `3865 -> 3866`, `maxTrackedBytes` `31013000 -> 31018300`,
and `docs/text` `4460000 -> 4460800`. Measured tracked state before the final
budget update was `3866` files and `31,018,207` bytes.
