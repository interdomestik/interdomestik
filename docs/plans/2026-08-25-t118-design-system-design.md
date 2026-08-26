---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-08-26
---

# IDA-DG53 — Minimal Entry-Door Cutover

> Status: pre-approval Tier 2 product/UI design candidate. It grants no repository or runtime
> authority before exact human approval and the repo-native Lean promotion lifecycle.

Gate: `IDA-DG53`

Sole implementation slice: `IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER`

Base: `b7284c35b79d1d5ee1b09a674da4f6bbd9a0c7b2`

Classified as implementation because it changes the rendered public homepage composition and its
focused server-shell contract. Risk tier: Tier 2 because the exact writer map contains only one
product-facing page and its colocated test; no E2E, CI/gate, auth, tenancy, routing, schema/RLS,
billing, AI, persistence, or architecture surface changes.

## Current authority and promotion decision

Protected main, local `main`, `origin/main`, and this clean detached worktree all resolve to
`b7284c35b79d1d5ee1b09a674da4f6bbd9a0c7b2`. GitHub records PR `#1632`, branch
`codex/ida-la03-lean-compatibility-repair`, exact head
`62b572ef65857e6895ee92b423c7ff18670fc471`, as merged at `2026-08-26T14:16:15Z` by squash commit
`b7284c35b79d1d5ee1b09a674da4f6bbd9a0c7b2`. This is terminal LA03 evidence.

`docs/plans/current-program.md` and `docs/plans/current-tracker.md` agree that Lean authority is
inactive with `activeSlice:null`; no product successor is promoted. The tracker lists `T-118` only
as `design_gate_next_unpromoted`. Arben's `2026-08-26` instruction selects this exact entry-door
cutover ahead of T-118 and T-117. The later promotion may bind only this slice and must leave both
future branches unstarted.

The repo-owned resolver currently returns `blocked_requires_current_authority`, which is the
expected pre-promotion state. This gate does not reinterpret inactive authority as runtime
authorization.

The existing bounded allocation named `t118-promotion` is reassigned mechanically to this sole
IDA cutover without adding capacity or changing any ceiling. Its two artifact path strings are
legacy allocation handles only: the bytes at those paths, this gate identity, the admission hash,
the current-authority projection, and the exact owner marker bind only
`IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER`. T-118 receives no promotion or capacity from this reserve;
it remains `design_gate_next_unpromoted` and requires a separate future evaluation.

## Sole outcome and render contract

Primary user: an anonymous or returning visitor arriving at the localized IDA public entry door.

Business outcome: reduce the entry door to the canonical help-first journey while retaining the
existing pricing step that two active browser contracts treat as part of the public funnel.

Exact exit render tree:

```text
Header
→ HomePageRuntime
  → Hero V2
  → Free Start
  → existing session/analytics behavior
→ PricingSection
→ Footer
```

Unmount only these eight legacy sections from localized page rendering:

1. `TrustStrip`
2. `VoiceClaimSection`
3. `MemberBenefitsSection`
4. `HowMembershipWorksSection`
5. `TrustStatsSection`
6. `TestimonialsSection`
7. `FAQSection`
8. final `CTASection`

Do not delete their source files, exports, translations, component tests, or assets. The cutover is
reversible by restoring the removed imports and render edges.

Preserve `Header`, `HomePageRuntime`, its literal `uiV2Enabled={true}`, Hero V2, Free Start,
`PricingSection`, `Footer`, `landing-page-ready`, `page-ready`, `data-experiment="home-funnel"`,
`data-variant="hero_v2"`, locale messages, default public tenant resolution, neutral OTP host
evaluation, session behavior, `FunnelLandingTracker`, and all existing destinations.

## Exact writer maps

The Tier 0 promotion PR may write exactly four authority paths. The first two names are the
pre-existing mechanical allocation handles now consumed exclusively by IDA-UI07:

1. `docs/plans/2026-08-25-t118-design-system-design.md`
2. `docs/plans/2026-08-25-t118-design-system-admission.json`
3. `docs/plans/current-program.md`
4. `docs/plans/current-tracker.md`

The product branch may write exactly two paths:

1. `apps/web/src/app/[locale]/page.tsx`
2. `apps/web/src/app/[locale]/page.test.tsx`

The deterministic success or terminal-failure closeout may write exactly:

1. `docs/plans/current-program.md`
2. `docs/plans/current-tracker.md`

No third product writer is optional. `scripts/repo-size-budget.json` remains byte-unchanged: this
promotion consumes the already-bounded two-file allocation and creates no new capacity. The later
implementation removes imports/render edges and need not add, delete, or rename tracked files.

## Source and contract-graph closure

Repository inspection on the exact base proves:

- `page.tsx` is the sole page composition owner for all listed legacy sections.
- `HomePageRuntime` owns Hero V2, Free Start, session resolution, host/session tenant selection,
  pending-session skeleton behavior, retained authenticated destinations, and funnel tracking.
- `PricingSection` remains mounted by `page.tsx` and preserves the active pricing-link E2E
  contracts without changing either E2E file.
- `page.test.tsx` is the colocated server-shell collector and already proves canonical runtime
  mounting, server authority propagation, literal Hero V2 selection, locale static params, and
  malformed neutral-host failure closure.
- `page.test.tsx` is 149 lines on the pinned base and is classified as a `focused-test`. The
  normative modularity policy permits it to remain at or below 300 lines; this does not authorize
  a helper or third writer path.
- `ui-v2-funnel-continuity.spec.ts` and `public-entry-hero.spec.ts` remain byte-unchanged consumers.
  Their pricing assertions stay valid because Pricing remains mounted; their existing Hero,
  keyboard, responsive, reduced-motion, contrast, and funnel assertions remain regression proof.

Contract edges:

| From            | To                               | Required disposition                                                |
| --------------- | -------------------------------- | ------------------------------------------------------------------- |
| localized page  | Header                           | preserve one mount and existing keyboard/locale/login behavior      |
| localized page  | HomePageRuntime                  | preserve props and exactly one canonical mount                      |
| HomePageRuntime | Hero V2 / Free Start             | preserve all runtime, pending, anonymous, and member branches       |
| HomePageRuntime | funnel tracker                   | preserve existing conditional tracking and tenant/locale payload    |
| localized page  | PricingSection                   | preserve one mount and all plan-link contracts                      |
| localized page  | eight legacy sections            | remove render/import edges only; retain source artifacts            |
| localized page  | Footer                           | preserve one mount and all support/legal/membership links           |
| source tree     | page unit/E2E/browser collectors | update only the colocated page contract; run existing E2E unchanged |

No durable store, event, audit row, external provider state, schema, migration, queue, webhook,
cache, or data fixture is created or changed. The evidence is exact source, focused unit results,
unchanged live browser contracts, accessibility snapshots, geometry, and current-head gate output.

## Responsive, accessibility, keyboard, and state design

- Preserve the existing semantic `<main>`, `Header`, Hero heading hierarchy, Free Start controls,
  `PricingSection`, and `Footer`; do not add wrapper landmarks or duplicate headings.
- Preserve `public-header`, `public-entry-hero`, `free-start-intake-shell`, pricing plan selectors,
  footer content, `landing-page-ready`, and `page-ready` markers.
- Preserve visible focus, locale-menu Escape behavior, keyboard activation, 44 CSS-pixel targets,
  reduced-motion behavior, forced-colors behavior, and WCAG text-spacing/reflow expectations.
- Browser proof uses SQ/EN/SR/MK at 320×720, 375×812, 390×844, and 1440×900, plus keyboard traversal
  from Header through Hero, Free Start, Pricing, and Footer.
- Verify no horizontal overflow and no hidden retained region at the four viewports. The deletion
  must not introduce compensating spacers, fixed heights, overflow masking, or viewport sniffing.
- Pending session: preserve `PublicEntrySessionSkeleton`, Hero V2, and Free Start while suppressing
  premature analytics exactly as `HomePageRuntime` does today.
- Anonymous, authenticated, missing-host-tenant, and malformed neutral-host states remain owned by
  unchanged `HomePageRuntime` and page authority logic.
- Empty/error states: the cutover introduces no new data dependency or empty state. Existing
  Free Start validation/error behavior and route-level error boundaries remain unchanged. A
  missing legacy section is the intended composition, not an error fallback.

## UI/UX benchmark and measurable outcome

Observed `2026-08-26T15:26:00.000Z` for the exact public entry-door seam:

- Lemonade presents a direct Hero proposition and immediate price action before deeper marketing
  detail: `https://www.lemonade.com/`.
- Revolut presents a direct primary proposition and sign-up action before broader product detail:
  `https://www.revolut.com/`.

Comparison criteria: number of top-level product regions before the footer; clarity and continuity
of the primary action; retained trust/commercial path; keyboard and mobile reachability.

Numeric better-than-baseline outcome: direct product regions between Header and Footer decrease
from baseline `10` (`HomePageRuntime`, Pricing, and eight legacy regions) to target `2`
(`HomePageRuntime`, Pricing), unit `regions`, direction `lower`. Measure using the rendered page DOM
and mount-spy unit contract on the four-viewport matrix. This measures composition simplification,
not conversion uplift.

Anti-copy boundary: learn only from prioritization and progressive-disclosure principles; copy no
operator words, layout, branding, illustration, interaction signature, or distinctive trade dress.
The schema-v1 UI/UX receipt remains external task evidence and must bind this exact gate/slice,
both URLs, `blockedSources=[]`, the numeric target, and the single final Arben approval.

## Acceptance matrix

| ID  | Criterion                                                                                                                           | Proof                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A1  | Exact rendered order is Header → HomePageRuntime → PricingSection → Footer                                                          | `page.test.tsx` mount spies and DOM order assertion                                                       |
| A2  | Eight named legacy regions do not mount                                                                                             | `page.test.tsx` legacy mount spies remain zero; exact source diff removes only their imports/render edges |
| A3  | Hero V2, Free Start, page markers, server authority, session and analytics contracts remain                                         | focused `page.test.tsx` plus unchanged `home-page-runtime.test.tsx`                                       |
| A4  | Pricing and its three plan links remain available                                                                                   | unchanged `ui-v2-funnel-continuity.spec.ts` and `public-entry-hero.spec.ts`                               |
| A5  | Header/Footer, keyboard flow, accessible names, focus, reflow and no-overflow remain                                                | Playwright MCP plus unchanged focused browser contracts across the viewport/locale matrix                 |
| A6  | No protected or out-of-map surface changes                                                                                          | worktree-scoped changed-file and scope audits                                                             |
| A7  | Both product writers respect their typed modularity limits; `page.test.tsx` stays at or below the focused-test ceiling of 300 lines | `wc -l` plus `pnpm check:modularity-guard`                                                                |

Skipped required proof is failure. A unit pass cannot substitute for browser proof, and a browser
snapshot cannot substitute for source/writer-map proof.

## Focused verification and review plan

RED first after promotion/runtime authorization: make `page.test.tsx` require the exact four-node
order and zero mounts for the eight retired regions while retaining every existing authority and
Hero V2 assertion. Then remove only the corresponding `page.tsx` imports, dynamic declarations,
and render edges.

Focused implementation checks:

```sh
pnpm --filter @interdomestik/web test:unit --run \
  'src/app/[locale]/page.test.tsx' \
  'src/app/[locale]/components/home/home-page-runtime.test.tsx'
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm check:modularity-guard
git diff --check
```

Focused browser proof runs the two unchanged contracts and uses Playwright MCP for exact rendered
order, absence of the eight retired regions, pricing continuity, keyboard traversal, accessibility
snapshot, and the four viewports. Tier 2 slice proof then runs `pnpm slice:verify`,
`pnpm slice:e2e:pr`, and the single supporting `pnpm ci:local:pr` lane. Repository-mandated final
PR readiness remains `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate` on the exact head;
these are not pre-approval work and do not authorize E2E infrastructure edits.

The pre-implementation Playwright MCP capability canary passed at
`2026-08-26T15:27:51.515Z`: a data-URL page produced an accessibility snapshot containing one
named main landmark, one level-one heading, and one named button with viewport boxes. Receipt:
`/tmp/interdomestik-pilot-evidence/playwright-mcp-output/page-2026-08-26T15-27-51-515Z.yml`,
SHA-256 `1266c80d1c5af0e4148cc2f355a665b153bd19b34ec76ed8257fc94e927a6a84`. This proves only
browser/snapshot capability; it does not prove the unimplemented product cutover.

Reviewer plan: one bounded Sol senior review of the mechanically clean design candidate, with QA
and accessibility focus; no second signal unless the first route is blocked or finds a material
conflict. Later implementation review covers scope, composition, regressions, accessibility,
security non-impact, Sonar/current-head feedback, and exact writer-map proof. Reviewers are
read-only and never grant authority.

## Rollout, rollback, failure closure, and operations

Rollout uses the existing web delivery path with no feature flag, provider mutation, schema step,
or data migration. Operational impact is removal-only: fewer mounted page regions and less initial
component work; no new logs, metrics, alerts, runbook, support diagnostic, or cost center is needed.
Existing funnel/session analytics remain the observable product signal.

Rollback mechanism: revert the exact product merge, restoring only the eight removed import/render
edges. Rollback triggers include missing Hero, Free Start, Pricing, Header or Footer; changed
session/analytics behavior; broken plan links; accessibility/keyboard/reflow regression; protected
path drift; or any required exact-head failure.

Any promotion closure without merge, product PR closed without merge, foreign main advance,
writer-map drift, failed exact-head evidence, merge mismatch, or failed closeout must leave
`runtimeAuthorized:false`, `activeSlice:null`, preserve observed effects, block successors, and use
only the frozen two-path current-program/current-tracker failure closeout.

## Forbidden surfaces, non-goals, and stop conditions

Forbidden: `apps/web/src/proxy.ts`; `scripts/repo-size-budget.json`; routing/middleware;
auth/session implementation; tenant/access
logic; schema/RLS/migrations; billing/Paddle; AI; E2E specs/config/selectors; CI/gates/workflows;
dependencies; i18n files; component source files; Header; HomePageRuntime; PricingSection; Footer;
M1–M5; T-118; T-117; README; AGENTS; architecture documents; deployment/provider configuration.

Non-goals: delete legacy files/tests/translations; redesign Hero, Free Start, Pricing, Header or
Footer; change copy, routes, prices, plans, membership semantics, session decisions, analytics
payloads, tenant selection, visual tokens, or authenticated dashboards; solve unrelated page
quality; promote a successor.

Stop and re-gate before mutation if implementation needs a third product writer, any E2E edit, a
new selector, protected surface, new state/capability/persistence/browser environment, second
product outcome, second authority addendum, or a test decomposition that cannot fit the frozen
two-path writer map and focused-test limit.

## One-approval boundary

Before approval, create no branch, worktree, implementation, commit, push, or PR. The final hold
binds the exact gate and admission bytes/hashes, base SHA, sole slice, product writer map, rollback,
and deterministic Lean delivery recipe. If approved, the same human decision authorizes one
promotion branch/PR, the repo-required exact structured GitHub review marker derived from the
frozen bindings and resulting promotion head/tree, one product branch/PR limited to the two
writers, required proof/remediation, deterministic success/failure closeout, and exact cleanup.

Any change to the gate/admission bytes, base, sole outcome, risk, product writer map, or rollback
invalidates this hold. Main drift before the promotion identity is sealed stops for a new freeze;
approval cannot be silently rebound.
