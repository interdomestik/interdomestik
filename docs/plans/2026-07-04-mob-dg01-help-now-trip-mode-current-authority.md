---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-04
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself and does not implement runtime, product UI, schema, RLS, migration,
> auth, session, tenancy, routing, proxy, billing, dependency, security
> remediation, README, or AGENTS work.

# MOB-DG01: Help Now / Trip Mode Current Authority

## Classification

This gate is Tier 0 governance and design authority work. It records the first
post-M0-M5 mobile-lane selection and decides whether a single bounded mobile
slice may enter the active implementation queue. It does not change source code,
tests, runtime behavior, database schema, RLS, migrations, proxy/routing,
auth/session, tenancy, billing, dependencies, product launch posture, README,
AGENTS, or broad architecture documentation.

## Day-Of-Use Authority State

This gate was prepared from clean main `d12c61414e1415cbe7da15eb826399266ff0156b`
on 2026-07-04.

The fresh current-authority resolver returned:

- `status=blocked_requires_current_authority`
- `reason=umbrella_without_concrete_promoted_slice`
- `activeSlice=null`
- `sourceFile=docs/plans/current-tracker.md`

That is the expected post-`T-503` state. It means M0-M5 architecture
finalization has no replacement runtime slice and a fresh gate must select
exactly one next governed action before implementation work starts.

## Inputs

- `docs/plans/2026-07-03-t503-drop-claim-status-closeout.md`
- `docs/product/2026-07-03-mob-dg01-help-now-trip-mode-gate-packet.md`
- `docs/product/2026-07-03-mobile-program-authority-packet-part-1.md`
- `docs/product/2026-07-03-mobile-program-authority-packet-part-2.md`
- `docs/product/2026-07-03-mobile-program-authority-packet-part-3.md`
- `docs/product/2026-07-03-mob-execution-sequence.md`
- `docs/product/2026-07-03-mobile-legal-compliance-input-templates.md`
- `docs/product/2026-07-03-ks-help-now-content-dossier-draft.md`
- `docs/product/2026-07-04-fable-enterprise-red-team-audit.md`

The Obsidian wiki remains navigation memory only. Repository source,
trackers, gates, tests, and explicit user instructions remain authoritative.

## Decision

Promote exactly one canonical tracker slice: `MOB-01`.

The next active governed implementation goal is exactly one canonical tracker
slice: `MOB-01`.

Future `MOB-01` is limited to Help Now / no-account free funnel implementation,
with Diaspora Trip Mode content folded into that same slice. It may implement:

- no-account Help Now entry and mobile-first incident guidance;
- Trip Mode country/corridor content packaging and pre-departure download
  controls;
- offline content-pack loading and cache controls;
- local-only evidence coach and incident bundle controls;
- mobile presentation of the existing claim-pack artifact shape;
- minimal anonymous funnel instrumentation;
- `de` locale support where copy is already within the reviewed Help Now /
  Trip Mode envelope.

No other `MOB-*` slice is promoted by this gate.

## Binding Constraints For MOB-01

`MOB-01` must not touch `apps/web/src/proxy.ts`, canonical routes, auth/session,
tenant resolution, member account creation, member surfaces, schema/RLS,
migrations, billing, Paddle, VONESA, flight submission, service authorization,
claim-transition writers, Operational Brain runtime, or broad architecture
refactors unless a later gate explicitly promotes that work.

The privacy posture must be phrased as: no identity data, no case content, and
no account data server-side before explicit handoff. Anonymous instrumentation
must use a defined minimal event schema and must exclude free text, claim facts,
document/image contents, precise location, health or injury context, account
identifiers, and local evidence-bundle contents.

Local evidence bundles may contain personal data on the user's device. `MOB-01`
must provide visible clear/delete controls, exclude bundles/photos/local
metadata from service-worker caches, avoid upload endpoints before a later
handoff gate, and include a privacy memo covering pre-handoff controller posture
and guidance against over-collection.

Country content is governed separately from the software gate. No country pack
may ship public/non-dark until its L2 Help Now country content sign-off records
a named reviewer, date, emergency-number review, police/EAS threshold review,
Green Card/travel guidance review, and language/copy review. Unsigned countries
must remain dark or placeholder-only. `MOB-01` may implement signed-off-only
gating and tests before the Kosovo pack or any other pack is signed.

The prior T-503 CD/staging RBAC/role-marker residual is not a blocker for this
Tier 0 design promotion, but it remains a blocker for launch/live-operationality
claims if it reproduces on current main or staging. `MOB-01` must not claim live
operational readiness from this gate alone.

## Gate Proof

Local Tier 0 proof on 2026-07-04 passed:

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`

After this gate text was applied, `next-slice.mjs` returned `status=ready` and
`activeSlice.id=MOB-01` from `docs/plans/current-tracker.md`.

## Current Authority Outcome

After this gate merges, resolver state is expected to promote `MOB-01` as the
only active governed implementation slice. Direct implementation must start
from a clean branch after that merge and must treat unsigned country content,
staging smoke health, legal/compliance copy, and local-evidence privacy as
blocking acceptance constraints, not optional polish.
