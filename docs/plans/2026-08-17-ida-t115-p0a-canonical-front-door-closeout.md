---
document_id: IDA-T115-P0A-CANONICAL-FRONT-DOOR-CLOSEOUT
date: 2026-08-17
status: completed
implementation_pr: 1577
implementation_head: 39a5fb07c3c56991cabfcb7bd15d2415d193c419
implementation_merge: 70c7c1f324fa3ddd8d6da7d21f31dc5df13aca34
---

# IDA-T115 P0A canonical front door — closeout

## Outcome

The locale root now always renders the existing `HomePageRuntime` with literal
`data-variant="hero_v2"`. The page-level `NEXT_PUBLIC_UI_V2` selector and direct
legacy Hero, intake and sticky-CTA mounts are gone. Header, below-fold sections,
Footer, anonymous Help Now entry, saved-progress journeys and resolved-member
continuation remain on one entry tree. Repository-controlled landing compositions
moved from 2 to 1.

## Evidence

- Authority: `IDA-DG45` SHA-256 `faed90a14251220b2092a830a8f44696d54877534ca9573e5aa699e2d5f3bc2e` plus
  `IDA-DG45-A1` SHA-256 `601ec770a7ab9fb9b0f6178767fadb0e6667bd8cf45a724864a33e2047b3cd70`.
- Runtime: exact-approved 10,717-byte `IDA-T115-P0A-CANONICAL-FRONT-DOOR-RUNTIME-R1`,
  SHA-256 `4ab5873112aa7a3a3aa0de8b81fa06c90106745cc0431190197c8ed936b9868c`,
  base `00449dbf072ac5b8988f8636e174c60ae38a8829`.
- Product: [PR #1577](https://github.com/interdomestik/interdomestik/pull/1577),
  exact head `39a5fb07c3c56991cabfcb7bd15d2415d193c419`, squash merge
  `70c7c1f324fa3ddd8d6da7d21f31dc5df13aca34`; 27 insertions, 57 deletions.
- Focused proof: RED then GREEN; five unit files / 41 tests, final page unit 5/5,
  modularity, E2E contracts, tenant-host/quarantine and deterministic size checks passed.
- Exact-head browser proof: PR E2E run `32017467272`, attempt 1, full runner
  `95349971433` passed in 16m05s; aggregate `e2e` passed. No retry or quarantine.
- Review: Opus 5 `REVISE` in 589.573s; one consolidated remediation; exact-artifact
  Opus 5 `PASS` in 417.931s. Final head had zero review threads and zero unresolved.
- PR gates: CI `32017467299`, Pilot `32017467315`, Sonar 0 issues/hotspots,
  CodeQL, gitleaks, audit/security and `pr-finalizer` all passed. Automatic Copilot
  produced no current-head review despite the active ruleset; no actionable feedback exists.
- Exact-main: CI `32019113834` passed in 15m09s. Reuse failed closed because the
  authorized no-JS spec changed the E2E tree from pinned `99576782…` to `51a0f77a…`;
  the one automatic main browser suite therefore ran 230 passed / 10 skipped in 8.2m
  (job 14m42s), with no rerun. Sonar Main `32019113745`, CodeQL
  `32019113257`/`32019113423` and Secret Scan `32019113840` all passed.
- CD `32019113935` was cancelled immediately: every job has `steps=[]`, proving no
  checkout, registry, build, provider, alias, deployment or production effect.

## Rollback and residuals

Rollback is the clean revert of merge `70c7c1f324fa3ddd8d6da7d21f31dc5df13aca34`,
which restores the page-level selector and legacy composition. No schema, persisted data,
route, proxy, auth/session, tenancy, billing, provider or deployment state changed.

This slice does not complete T-115. A neutral session-pending skeleton and OD#17 proof
remain a separately gated T-115 residual. Hero/dashboard redesign, T-117/T-118/T-116,
legacy orphan cleanup and analytics naming remain outside this closeout. No next slice is
promoted; the expected resolver state is `blocked_requires_current_authority`,
`activeSlice=null`.
