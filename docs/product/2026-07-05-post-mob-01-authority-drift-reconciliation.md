---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-05
related:
  - docs/product/2026-07-03-mobile-program-authority-packet.md
  - docs/product/2026-07-03-mob-dg01-help-now-trip-mode-gate-packet.md
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
---

# Post-MOB-01 Authority Drift Reconciliation

> Status: docs-only reconciliation record. Repository `current-program.md` and
> `current-tracker.md` remain the source of truth; this file records the drift
> found after PR `#1296` and PR `#1297` and names the follow-up authority patch.

## Evidence Compared

- PR `#1296` merged 2026-07-05T00:25:36Z at `85aa63a50177c212c75f3cc6a69a985e18722547`.
- PR `#1297` merged 2026-07-05T01:03:53Z at `f699615f99be239574cbb5bc9624e5be93eab66f`.
- Remote `origin/main` current-program Rev 88 and tracker row `MOB-DG01` promoted `MOB-01`.
- The July 3 mobile packets still contained pre-gate language.
- The Notion Interdomestik Program page fetched on 2026-07-05 still stopped at the 2026-07-04 T-503 closeout.

## What MOB-01 Actually Proved

MOB-01 proved a public `/:locale/help-now` Help Now / Trip Mode implementation
without proxy, auth, tenancy, member-surface, schema, RLS, billing, VONESA,
claim-transition, Operational Brain, README, AGENTS, or broad architecture
changes. It added same-origin public content packs, offline/cache guards,
local-only evidence controls, anonymous funnel events, the public route, home
CTA routing, dark/placeholder behavior for unsigned country packs, and focused
unit/E2E coverage. PR `#1297` added the immediate accessibility state fixes.

MOB-01 did not prove non-dark country launch. Unsigned country packs remain
dark/placeholder-only. It also did not prove live-operationality if the earlier
T-503 staging RBAC/role-marker residual reproduces on current main or staging.

## Reconciled Authority

- `current-program.md` now records Rev 89 closeout for PR `#1296` and PR `#1297`.
- `current-tracker.md` now records `MOB-01` as completed and consumed.
- The July 3 mobile packets now identify their pre-gate language as historical.
- The real next blocker is L2 Help Now country-content sign-off for a named
  country pack, including reviewer, date, emergency numbers, police/EAS
  thresholds, Green Card/travel guidance, and language review.
- Notion needs a short advisory sync after this repo patch lands; Notion should
  cite the repo rows and stay non-authoritative.
