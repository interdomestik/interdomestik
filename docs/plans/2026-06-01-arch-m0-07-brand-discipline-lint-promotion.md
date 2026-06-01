# ARCH-M0-07 Brand Discipline Lint Promotion

Status: complete
Slice: `ARCH-M0-07`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-01
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-06b`.

## Closeout Basis

`ARCH-M0-06b` landed in PR `#892` with merge commit
`203a51b3878c570a28100e6c98d0f21e2587fa9e`, completing `T-006b` by adding
a repo-owned raw role-array guard, narrow allowlist custody, seeded allow/reject
proof, and `security:guard` wiring.

## Promoted Slice

Promote `ARCH-M0-07 — Brand Discipline Lint`.

Tracker task: `T-007`.

Goal: add a focused static guard that blocks banned compensation/guarantee/final-opinion
framings across supported service/localized copy surfaces and asserts the mandatory
protective message remains present on key pages.

## Scope

- Inventory existing brand/compliance copy checks and reuse the narrowest current guard
  pattern.
- Add a repo-owned lint/check over supported `messages/**`, checkout/registration, and
  email-template copy surfaces for the banned framings named by `T-007`.
- Define the checked surface list explicitly in the guard or its fixture before enforcement.
  The initial key-page set must include the tracker-named surface classes: service cards,
  checkout or registration conversion surfaces, eligibility or Free Start result surfaces,
  and recovery activation surfaces that present commercial/professional-support guidance.
- Add proof that each checked key page keeps the mandatory protective message present.
- Add seeded proof that a banned framing and a missing protective message fail the check.
- Wire the check into the relevant required guard lane.

## Review Evidence

- Sonnet 4.6 architecture/scope review ran through the Claude CLI on 2026-06-01.
- Disposition: the untracked-file blocker is resolved by including this promotion document
  in the PR; the surface-enumeration hardening is applied above; the reported e2e-column
  concern is rejected because the proof-ledger quality columns are Sonar/Docker/Sentry/Learning,
  while `pnpm e2e:gate` is recorded in the evidence text as verification evidence.

## Out Of Scope

- Do not start `T-007b`, `T-008`, `T-009`, `T-010`, `T-011`, M1, or any unrelated product-surface slice.
- Do not touch `apps/web/src/proxy.ts`, canonical routes, auth/session architecture, tenancy architecture, schemas, migrations, billing, Stripe/Paddle posture, README, AGENTS, or broad architecture docs.
- Do not rewrite product positioning, redesign public/member surfaces, add new services, or broaden the copy surface beyond what is needed for the `T-007` guard.

## Verification Bar

- Focused lint/check unit proof for allowed copy, banned-framing rejection, and missing
  protective-message rejection.
- The check wired into the relevant required guard lane.
- `pnpm security:guard`.
- `pnpm pr:verify`.
- `pnpm e2e:gate` only if implementation touches a web flow or gate surface; otherwise
  record why it is not relevant.
