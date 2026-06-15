# ARCH-M0-10 Closeout And T-011 Promotion

Status: complete
Slice: `ARCH-M0-10`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-02
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-10`.

## Closeout Basis

`ARCH-M0-10` landed in PR `#901` with merge commit
`578b00d67be2a864a4c64da4334178a6ec9a261e`, completing `T-010` by
recording the claim-status transition sole-writer architecture and the
role-separation stub.

The merged slice records `canTransition(...)` and `transitionClaimStatus()` as
the sole claim-status transition architecture in
`docs/architecture/adr-04-claim-status-transition-sole-writer.md`, and keeps
`docs/architecture/adr-09-role-separation-governance-boundaries.md` limited to the later
role-separation direction without runtime role, proxy, auth, tenancy, schema,
or billing changes.

## Promoted Slice

Promote `ARCH-M0-11 -- Playwright Host-As-Tenant Lane Inventory And Guard`.

Tracker task: `T-011`.

Goal: inventory and guard the Playwright tenant lanes that still use hostnames
as tenant identity before later ida-first dashboard/auth work proceeds.

## Scope

- Inspect existing Playwright projects, fixtures, server setup, and guard
  patterns before adding anything new.
- Document every project, fixture, and setup path using `ks.localhost`,
  `mk.localhost`, or country hosts as tenant handles.
- Add the smallest repo-native CI/check guard that blocks new dashboard/auth
  specs from relying on host as tenant identity.
- Keep existing country-host lanes only as explicit alias/regression coverage.
- Keep exceptions explicit and narrow; do not add broad host, route, test, or
  generated-file escapes.
- Wire the guard through the existing repo verification lane appropriate for
  static/test guard changes.

## Out Of Scope

- Do not start `T-108`, `T-109`, `T-114`, M1, or any later architecture task.
- Do not change `apps/web/src/proxy.ts`, canonical routes, auth/session
  architecture, tenancy architecture, schemas, migrations, billing,
  Paddle/Stripe posture, README, AGENTS, broad architecture docs, or product
  surface design.
- Do not convert country hosts to `ida.localhost` in this slice; `T-011`
  inventories and guards the dependency before later adoption slices.

## Verification Bar

- Promotion/docs proof: `git diff --check`, `pnpm plan:status`,
  `pnpm plan:audit`, `pnpm track:audit`, and `pnpm docs:verify`.
- Scope proof: repo-scoped MCP `scope_audit` confirms changed files are limited
  to approved plan/tracker and repo-size budget paths, with Phase C read-only
  and out-of-scope paths untouched.
- Repo-size proof: update `scripts/repo-size-budget.json` only if the new
  tracked promotion packet requires a tight, measured budget increase.
  Measured delta for this packet: `maxTrackedFiles` `3864 -> 3865`,
  `maxTrackedBytes` `31009000 -> 31013000`; measured tracked state was
  `3865` files and `31,012,759` bytes.
- `pnpm ci:local:quick` before PR readiness unless the local parity container
  is blocked by an unrelated environment issue, in which case record the exact
  blocker.
- Model review: not applicable for this Tier 0 docs-only closeout/promotion
  unless repo-canonical tracker contradictions appear; no product-facing design
  gate or implementation packet is being promoted beyond the bounded `T-011`
  tracker authority.
