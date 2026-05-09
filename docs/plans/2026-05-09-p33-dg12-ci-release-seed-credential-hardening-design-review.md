---
status: design-review
date: 2026-05-09
slice: P33-DG12
title: CI/Release Seed Credential Hardening Design Review
owner: platform
phase: Phase C
---

# P33-DG12 CI/Release Seed Credential Hardening Design Review

## Decision

`P33-DG12` accepts the `P33-DG11` promotion and records the bounded design for
CI/release seed credential hardening.

The next bounded implementation slice is:

`P33-SEC09 CI/Release Seed Credential Hardening`

The implementation must remove shared literal seed credentials from GitHub
workflow release/pilot gate jobs and replace them with per-run generated,
masked seed credentials that are passed consistently to seed creation, E2E auth
fixtures, and release-gate account variables.

The implementation must also replace workflow-level literal E2E API placeholders
with per-run generated, masked values where the workflow uses an E2E helper API
secret.

DG12 does not implement `P33-SEC09`. Workflow, seed, E2E fixture, and release
gate behavior changes must wait for the implementation slice.

## Inputs

| Input                                     | Relevance                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P33-DG11`                                | Promoted exactly one next design gate: `P33-DG12 CI/Release Seed Credential Hardening Design Review`.                                                |
| `.github/workflows/ci.yml`                | Uses local Postgres fallback, a test-only auth secret fallback, an `E2E_API_SECRET` placeholder, and seed commands.                                  |
| `.github/workflows/e2e-pr.yml`            | Uses local Postgres fallback and delegates PR browser gates to seeded E2E flow.                                                                      |
| `.github/workflows/e2e-nightly.yml`       | Uses local Postgres fallback, RLS DB fallback, and seeded E2E auth state generation.                                                                 |
| `.github/workflows/release-candidate.yml` | Uses local Postgres fallback, an `E2E_API_SECRET` placeholder, and literal `GoldenPass123!` values for release-gate role passwords.                  |
| `.github/workflows/pilot-gate.yml`        | Uses local Postgres service DB URLs and literal `GoldenPass123!` values for release-gate role passwords.                                             |
| `.github/workflows/cd.yml`                | Uses GitHub secrets for staging/production release-gate account credentials; this is already the correct production-facing model.                    |
| `packages/database/src/e2e-users.ts`      | Defines `E2E_PASSWORD = 'GoldenPass123!'`, which seed data and Playwright fixtures consume as the deterministic local seed fixture password.         |
| `apps/web/e2e/fixtures/auth.project.ts`   | Reads `E2E_PASSWORD` and `E2E_USERS` for seeded Playwright auth fixtures.                                                                            |
| `scripts/release-gate/config.ts`          | Defines the release-gate role account environment contract and required password variables.                                                          |
| `scripts/ci/workflow-contracts.test.mjs`  | Already asserts workflow shape and is the right focused test surface for future workflow credential-hardening contracts.                             |
| Local E2E scripts                         | `scripts/run-with-default-db-url.mjs`, `scripts/e2e-gate.sh`, and `scripts/m4-gatekeeper.sh` intentionally provide loopback-only local DB fallbacks. |

## Credential Surface Classification

| Surface                                                                    | Classification               | DG12 Decision                                                                                                                                                   |
| -------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub service Postgres passwords and loopback `postgres:postgres` DB URLs | Ephemeral CI/local DB        | Allowed. They target GitHub service containers or local Supabase only and must not be conflated with application user credentials.                              |
| Local script fallback DB URLs in E2E/gate helpers                          | Local deterministic fallback | Allowed. They preserve deterministic local verification and must remain loopback-only.                                                                          |
| `packages/database/src/e2e-users.ts` deterministic seeded-user password    | Seed-fixture default         | Allowed as a local fallback only. SEC09 may make it overridable, but must preserve local zero-config E2E behavior.                                              |
| Playwright fixtures importing `E2E_PASSWORD`                               | Seed-fixture consumer        | Must consume the same effective password as seed creation after SEC09, including generated CI values.                                                           |
| Release-candidate workflow literal `GoldenPass123!` release-gate passwords | Unsafe shared workflow value | Must be replaced in SEC09 by generated, masked, per-run seed password propagation.                                                                              |
| Pilot-gate workflow literal `GoldenPass123!` release-gate passwords        | Unsafe shared workflow value | Must be replaced in SEC09 by generated, masked, per-run seed password propagation.                                                                              |
| Workflow `E2E_API_SECRET: test-secret-placeholder` values                  | Unsafe shared workflow value | Must be replaced in SEC09 by generated, masked, per-run values where an E2E helper API secret is required.                                                      |
| Staging/production `cd.yml` release-gate credentials                       | GitHub secret-backed         | Already acceptable. SEC09 must not replace these with generated seed credentials because they verify deployed environments with explicitly provisioned secrets. |
| `BETTER_AUTH_SECRET` test-only CI fallbacks                                | Test auth signing fallback   | Not the promoted implementation target. Existing production/staging jobs already use secrets or generated Dependabot fallback behavior.                         |
| Seeded account email addresses such as `member.ks.a1@interdomestik.com`    | Fixture identifiers          | Allowed for seeded fixture identity and release-gate account selection; not confidential by themselves.                                                         |

## Promoted Slice

`P33-SEC09 CI/Release Seed Credential Hardening`

Implementation scope:

- add or extend a canonical seed credential resolver so `E2E_PASSWORD` can be
  supplied by a generated CI environment variable while preserving the current
  local default for zero-config developer E2E;
- ensure seed creation, Playwright auth fixtures, release-gate config, and
  release-gate workflow variables all use the same effective seed password in
  CI;
- generate and mask per-run seed passwords in workflows that both seed the DB
  and authenticate seeded role accounts;
- replace literal `GoldenPass123!` release/pilot workflow role passwords with
  the generated seed password path;
- replace literal workflow `E2E_API_SECRET: test-secret-placeholder` values with
  generated, masked per-run values where the app and tests need an E2E helper
  API secret;
- add focused workflow contract tests or a small static guard that prevents
  reintroducing literal seeded-user passwords or E2E API placeholders in
  `.github/workflows/**`;
- preserve GitHub-secret-backed staging and production release-gate credentials
  in `cd.yml`;
- preserve loopback-only DB fallbacks for local and ephemeral CI databases;
- keep seeded account email addresses stable unless a focused test requires a
  fixture rename.

Allowed implementation touch points:

- `.github/workflows/ci.yml`;
- `.github/workflows/e2e-pr.yml`;
- `.github/workflows/e2e-nightly.yml`;
- `.github/workflows/release-candidate.yml`;
- `.github/workflows/pilot-gate.yml`;
- `.github/workflows/multi-agent-pr-hardening.yml` only if its seeded-auth path
  needs the same generated password propagation;
- `packages/database/src/e2e-users.ts` and narrow seed helpers needed for
  password override support;
- `apps/web/e2e/fixtures/**` only where needed to consume the effective seed
  password;
- `scripts/release-gate/**` only where needed to preserve the release-gate
  account contract with generated seed credentials;
- `scripts/ci/workflow-contracts.test.mjs` or a focused new guard/test;
- `scripts/security-guard.mjs` only if a workflow credential guard is added.

Must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`;
- auth provider layering or session shape;
- tenancy architecture;
- broad schema design;
- Storage redesign;
- Stripe;
- README, AGENTS, or architecture docs;
- staging or production secret names in `cd.yml`, except for focused contract
  assertions that prove they remain secret-backed.

## Acceptance Criteria For SEC09

- No GitHub workflow sets `RELEASE_GATE_*_PASSWORD` to the literal seeded-user
  default password.
- No GitHub workflow uses `E2E_API_SECRET: test-secret-placeholder` as the active
  E2E helper API secret value.
- CI jobs that seed role accounts and later authenticate those accounts share
  one generated, masked seed password for the full job.
- Local E2E still works without requiring developers to provide a seed password.
- Staging and production release gates still require GitHub secret-backed
  credentials.
- A focused workflow contract test or static guard fails if the unsafe workflow
  literals return.
- Required local design/implementation gates remain green after the change.

## Rejected Alternatives

| Alternative                                                     | Decision | Reason                                                                                                                                                             |
| --------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Require GitHub secrets for all PR and nightly seeded E2E users  | Reject   | This would make fork, Dependabot, and local deterministic gates brittle. The safer path is per-run generated seeded-user credentials for ephemeral seeded DB jobs. |
| Rotate production or staging release-gate secrets in this slice | Reject   | CD already uses GitHub secrets. Rotation is operational secret management, not the repo workflow/seed hardening gap DG12 is designing.                             |
| Remove loopback Postgres fallbacks                              | Reject   | They are deterministic local/ephemeral DB infrastructure, not reusable application credentials, and removing them would harm local verification.                   |
| Rename seeded user emails                                       | Reject   | Fixture identifiers are not the main risk. The shared password and API placeholder values are.                                                                     |
| Bundle CSP, DB posture hard cases, or supply-chain attestation  | Reject   | DG12 is intentionally scoped to CI/release seed credential hardening.                                                                                              |
| Refactor auth or session architecture                           | Reject   | The credential-hardening target is seed/workflow plumbing, not auth provider behavior.                                                                             |

## Verification Plan

DG12 is a docs/design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

`P33-SEC09` is an implementation slice and must additionally run:

- focused workflow contract tests for the changed workflows;
- focused seed credential tests covering default local password and CI override
  behavior;
- focused release-gate config tests if the account credential contract changes;
- `pnpm security:guard` when a static guard is added or changed;
- the mandatory implementation reviewer pool;
- `pnpm verify-slice -- --required-gates`;
- PR CI/Sonar/Vercel/reviewer monitoring before merge.

## Rollback And Mitigation

The SEC09 implementation should be reversible by removing the generated
credential propagation and restoring the local deterministic default. The design
requires preserving local default seed behavior so rollback does not block local
E2E or emergency PR verification.

If generated seed credentials break a workflow, the implementation must fail
closed at seed/auth-state setup rather than silently falling back to shared
workflow literals.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched by DG12.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain
  unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth provider layering, tenant identity architecture, routing, domain
  architecture, broad schema design, Storage architecture, and Stripe remain
  untouched.
- DG12 does not promote CSP Phase 1 enforcement.
- DG12 does not promote SEC03 retry because no concrete DG07 unlock condition is
  recorded.
