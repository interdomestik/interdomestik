# P41-DG04 Member Dashboard Visual Hierarchy Hardening Design Gate

Status: complete
Slice: `P41-DG04`
Owner: platform + product + design + qa
Phase: Phase C
Date: 2026-05-24
Authority: approved design gate. This gate promotes the next bounded implementation slice after
`P41-UX03 Admin/Ops Filter Wrapping Hardening`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, `promoted` means implementation-approved but not yet started, and `deferred`
records an explicitly postponed candidate. Tracker queue statuses remain the repo-audited values
`completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                                                                                                                                                                                    |
| -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-24 | Initial review draft after `P41-UX03` merged through PR `#858` and closeout PR `#859`.                                                                                                                                                                   |
| `r2`     | 2026-05-24 | Sonnet 4.6 hardening for marker placement, inaccessible interactive-looking service cards, no-op controls, responsive proof, reduced motion, forced-colors fallback, structural marker naming, referral role preservation, and empty-state preservation. |
| `r3`     | 2026-05-24 | Gemini product/mobile/accessibility hardening for authenticated viewport-proof readiness, localized region names, combined empty-state snapshot proof, and explicit non-interactive service-card styling tests.                                          |

## Definitions

- Member dashboard: the canonical authenticated `/member` route rendered by
  `apps/web/src/app/[locale]/(app)/member/page.tsx` through `MemberDashboardView`.
- Visual hierarchy hardening: presentation-only changes that make current membership state, next
  action, active claim state, and support entrypoints easier to scan before secondary service
  marketing, without changing data, routing, authorization, or product capability.
- Task-first region: the first visible dashboard group containing member identity, primary actions,
  guidance, active or empty claim state, support link, and activation state.
- Secondary services region: existing benefit, diaspora, support-readiness, command-center,
  referral, and service-ecosystem content that remains available but should not compete visually
  with the task-first region.
- Runtime member behavior: claim creation, claim tracking, document upload, support handoff,
  membership/billing, notification settings, routing, authorization, data reads, and persistence.
  This gate does not authorize changes to those behaviors.

## Predecessor Dependency

`P41-UX03 Admin/Ops Filter Wrapping Hardening` is the direct predecessor.

Predecessor proof:

- `P41-DG03 Admin/Ops Filter Wrapping Hardening Design Gate` is recorded in
  `docs/plans/2026-05-24-p41-dg03-admin-ops-filter-wrapping-design.md`.
- `P41-UX03` merged as PR `#858`, merge commit
  `599c3fb9a647317346d1f350588f1f4db6ac6d83`, on 2026-05-24.
- Tracker/program closeout merged as PR `#859`, merge commit
  `585557e9b09719ca776421db801940bcb95753d7`, on 2026-05-24.
- PR `#858` hardened shared `OpsFiltersBar` and existing `/admin/claims` filters while preserving
  routes, proxy, auth, tenancy, data reads, schemas, migrations, Stripe, README, `AGENTS.md`, and
  architecture-doc boundaries.
- Remote validation, audit, static, unit, full E2E, `e2e-gate`, Pilot Gate, gitleaks, pnpm-audit,
  PR finalizer, SonarCloud, Vercel ignored-build, and Vercel Preview Comments were green before
  merge.

This approved design gate authorizes only the bounded implementation slice named below.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- P41 predecessors:
  `docs/plans/2026-05-23-p41-dg01-post-crm33-ui-ux-slice-selection.md`,
  `docs/plans/2026-05-23-p41-ux01-product-surface-ux-audit.md`,
  `docs/plans/2026-05-23-p41-dg02-agent-crm-task-queue-ergonomics-design.md`, and
  `docs/plans/2026-05-24-p41-dg03-admin-ops-filter-wrapping-design.md`.
- Canonical member route:
  `apps/web/src/app/[locale]/(app)/member/page.tsx`.
- Member dashboard surface:
  `apps/web/src/components/dashboard/member-dashboard-view/index.tsx` and sibling components in
  `apps/web/src/components/dashboard/member-dashboard-view/`.
- Existing top-level member dashboard primitives:
  `apps/web/src/components/member-dashboard/member-header.tsx`,
  `apps/web/src/components/member-dashboard/primary-actions.tsx`,
  `apps/web/src/components/member-dashboard/active-claim-focus.tsx`,
  `apps/web/src/components/member-dashboard/empty-state.tsx`, and
  `apps/web/src/components/member-dashboard/support-link.tsx`.
- Related but non-canonical rich dashboard component:
  `apps/web/src/components/dashboard/member-dashboard-v2.tsx`.
- Existing member dashboard tests:
  `apps/web/src/components/dashboard/member-dashboard-view.test.tsx`,
  `apps/web/src/components/dashboard/member-dashboard-v2.test.tsx`,
  `apps/web/src/app/[locale]/(app)/member/page.test.tsx`,
  `apps/web/e2e/gate/member-home-cta.spec.ts`,
  `apps/web/e2e/gate/v1-live-surface-revalidation.spec.ts`, and
  member dashboard golden specs.

Codebase verification as of this draft:

- The canonical `/member` route renders `MemberDashboardView`, not `MemberDashboardV2`.
- `MemberDashboardView` currently renders `MemberHeader`, `PrimaryActions`,
  `MemberGuidancePanel`, orientation/active/empty claim state, `SupportLink`, and
  `ActivationPanel`, then a secondary `more_services` block.
- The secondary block contains a visually heavy `DashboardHero` with a large Digital ID card,
  `DiasporaRibbon`, `MemberActionGrid`, `SupportReadinessCard`, `ServiceEcosystemGrid`,
  `CommandCenterCard`, and `ReferralStatusColumn`.
- `DashboardHero`, `MatteAnchorCard`, `SupportReadinessCard`, and `ServiceEcosystemGrid` use large
  radii, gradients, hover lifts, animation, and oversized display typography. These patterns are
  expressive but can compete with the task-first dashboard actions that members need most often.
- Existing tests already pin `member-dashboard-ready`, `dashboard-heading`,
  `member-primary-actions`, `member-start-claim-cta`, `member-support-link`,
  `member-active-claim`, `member-empty-state`, and member home CTA navigation.
- The existing `dashboard-heading` marker is currently inside the secondary `DashboardHero`.
  P41-UX04 must move the marker to the task-first region so the contractual heading aligns with
  the promoted visual hierarchy.
- `ServiceEcosystemGrid` currently renders visually interactive cards without real keyboard
  actions and also includes an `Explore All` button without a route or click target. P41-UX04 must
  remove those interactive affordances or convert them to accessible real actions without changing
  route scope. The preferred implementation is to make these secondary service cards static and
  remove the no-op `Explore All` control.
- `ReferralStatusColumn` receives role-sensitive behavior through the existing
  `isAgent(userDetails.role)` branch and must remain behaviorally unchanged during layout
  restructuring.
- Empty dashboards currently render both `OrientationCard` and `MemberEmptyState`. P41-UX04 must
  preserve both states unless a later design gate explicitly promotes empty-state consolidation.
- `P41-UX01` ranked member dashboard visual hierarchy hardening as the next deferred medium-risk
  product-surface candidate after the CRM ergonomics and admin/ops filter wrapping slices.

## Decision

Promote exactly one next implementation slice:

`P41-UX04 Member Dashboard Visual Hierarchy Hardening`

The proposed slice makes the existing `/member` dashboard more task-first and work-focused by
strengthening the first visible member work region and quieting the secondary service/benefit
region. It preserves existing data, links, route markers, translations, authorization, tenancy,
claim/membership/support behavior, and canonical routes.

## Candidate Ranking

| Rank | Candidate                                                | Decision | Rationale                                                                                                                            |
| ---- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `P41-UX04 Member Dashboard Visual Hierarchy Hardening`   | Propose  | The P41 audit ranked this as the next useful UX candidate after CRM row density and admin/ops filters, both now completed.           |
| 2    | Staff claims queue mobile scanning polish                | Defer    | Useful, but staff claims need a separate workflow ranking and have older responsive grid proof than the member dashboard rich stack. |
| 3    | Public commercial surface follow-up                      | Defer    | Lower severity in the P41 audit and less tied to authenticated repeated-use member work.                                             |
| 4    | Broad member portal redesign or navigation restructuring | Reject   | Conflicts with Phase C route/proxy/auth/tenancy constraints and is larger than the evidenced visual hierarchy risk.                  |
| 5    | New member dashboard runtime capability                  | Reject   | P41 is improving existing product-surface professionalism, not adding claim, support, billing, notification, or AI behavior.         |

## Proposed P41-UX04 Scope

Authorized implementation scope for P41-UX04:

- Keep the canonical `/member` route and `MemberDashboardView` as the implementation target.
- Add or strengthen a task-first region in `MemberDashboardView` that groups existing member
  identity, primary actions, member guidance, current claim/empty state, support link, and
  activation state in a predictable first-viewport hierarchy.
- Add stable non-PII structural markers `member-dashboard-priority-region` and
  `member-dashboard-secondary-region`. These regions must have accessible names through
  `aria-labelledby` or `aria-label`; test IDs alone are not sufficient.
- Accessible region names should be meaningful and localized. Preferred labels are equivalent to
  "Primary tasks" for `member-dashboard-priority-region` and "Additional services and benefits" for
  `member-dashboard-secondary-region`, using existing locale keys if suitable or narrow new
  localized copy if needed.
- Keep existing `member-dashboard-ready`, `member-primary-actions`,
  `member-start-claim-cta`, `member-view-claims-cta`, `member-support-link`,
  `member-active-claim`, and `member-empty-state` markers unchanged.
- Move the existing `dashboard-heading` marker from the secondary `DashboardHero` into the
  task-first region and update tests to assert that the marker precedes
  `member-dashboard-secondary-region` using DOM order, not fragile text assumptions.
- Quiet the secondary service area so membership status, benefits, diaspora support, service
  categories, command center, and referral status remain available but visually secondary to
  current member work.
- Remove or neutralize secondary cards that look interactive but are not operable. Specifically,
  `ServiceEcosystemGrid` cards must either become real accessible links/buttons with existing
  route targets or become static informational cards without `cursor-pointer`, hover-lift, or
  clickable-card styling. P41-UX04 should not invent new route targets to satisfy this.
- Remove the current no-op `Explore All` affordance in `ServiceEcosystemGrid` unless it is wired to
  an existing, already-authorized route. Preferred scope is removal.
- Reduce decorative visual weight in existing member dashboard components where it directly
  competes with task-first scanning: large gradients, high hover lift, oversized display type,
  overly large border radii, and animation-heavy cards may be softened.
- Preserve or add reduced-motion safety for any remaining animation or transitions. New or touched
  motion-heavy classes should use `motion-safe:` variants or an equivalent reduced-motion-safe
  pattern.
- If gradient clipped text survives the implementation, add a forced-colors-safe fallback so the
  heading remains readable under high-contrast modes.
- Preserve the Digital ID/membership status material as contextual support, not the dominant first
  task target.
- Preserve the existing `ReferralStatusColumn` role branch and do not alter referral semantics.
- Preserve the current empty-dashboard behavior where both `OrientationCard` and
  `MemberEmptyState` render.
- Preserve all existing links and route targets for incident guide, report case, Green Card,
  benefits, claims, documents, membership, settings, and support.
- Preserve existing translation keys where possible. Add new localized copy only if an accessible
  heading or structural label cannot reuse existing keys.
- Add focused tests for section order, structural markers, unchanged route targets, active/empty
  claim visibility, support link preservation, and simplified secondary-region styling contracts.
- Add browser or Playwright proof for `/member` at mobile `390x844`, dense desktop `1024x768`, and
  standard desktop `1440x900` when a reachable authenticated environment is available.
- Before implementation is considered complete, prove that the local or CI Playwright path can
  authenticate and render `/member` for viewport checks. If authenticated browser proof is blocked,
  the PR must record the exact command, environment, and error and provide the strongest available
  screenshot/manual browser evidence rather than treating the proof as optional.

Expected implementation delta should stay focused on:

- `apps/web/src/components/dashboard/member-dashboard-view/index.tsx`;
- route-local member-dashboard-view components that are already rendered by `index.tsx`, especially
  `dashboard-hero.tsx`, `member-action-grid.tsx`, `service-ecosystem-grid.tsx`, and
  `support-readiness-card.tsx` if needed;
- `apps/web/src/components/dashboard/matte-anchor-card.tsx` only if the primary member action cards
  cannot be made quieter through the route-local caller;
- focused member dashboard component tests and targeted member home E2E proof;
- active app locale message files only if new copy is unavoidable.

P41-UX04 should avoid changing:

- `apps/web/src/proxy.ts`;
- canonical routes or route groups;
- `apps/web/src/app/[locale]/(app)/member/page.tsx` data/auth flow unless a tiny test-only marker
  preservation fix is required;
- domain packages, repositories, server actions, claim/support/billing behavior, schemas,
  migrations, RLS, auth/session layering, tenancy boundaries, Stripe, README, `AGENTS.md`, and
  architecture docs.

## UI And Accessibility Contract

- The member dashboard should feel like a member work surface: current state, next action, claim
  status, support, and membership readiness must be more prominent than secondary service tiles.
- First-viewport content must avoid a marketing-style hero that pushes current work below the fold
  on mobile.
- The task-first region must be scannable with keyboard focus order matching visual order.
- `dashboard-heading` must identify the task-first region, not the secondary services region.
- `member-dashboard-priority-region` and `member-dashboard-secondary-region` must be real named
  regions or sections with accessible labels.
- The region labels must be localized or reuse existing localized text; hard-coded English labels
  are not acceptable in runtime UI.
- Existing links must remain anchors with their current route targets.
- Existing active-claim and empty-claim states must remain present and distinguishable.
- The existing simultaneous empty-state pairing, `OrientationCard` plus `MemberEmptyState`, must be
  preserved in this slice.
- Existing `member-home-cta` navigation expectations must remain green.
- UI that looks clickable must be keyboard-operable or made visually static. Non-action service
  cards must not use pointer cursors, hover-lift motion, button-like affordances, or dead controls.
- Decorative gradients, hover motion, and display type should be restrained where they reduce
  scanability, create layout shift, or make secondary items look primary.
- Touched animations and long transitions must respect reduced-motion preferences.
- Gradient text that remains in headings must remain readable in forced-colors/high-contrast modes.
- Text must not overlap, clip, or force horizontal scroll at mobile `390x844`.
- Dense desktop `1024x768` must keep the task-first region and secondary region readable without
  crowding or nested horizontal scrolling.
- Standard desktop `1440x900` should preserve efficient two-column scanning where useful.
- WCAG 2.1 AA remains the review floor for contrast, visible focus, headings, and link targets.

## Entrypoint And Routing Contract

Authorized entrypoints:

- Existing `/member` route.
- Existing member dashboard view components.
- Existing member dashboard component tests and member home/gate E2E proof.

Unauthorized entrypoints:

- New pages, API routes, route groups, route aliases, middleware, or proxy edits.
- New query parameters, route target changes, redirects, or canonical route rewrites.
- Auth, tenancy, role mapping, data access, claim/support/billing mutations, schemas, migrations,
  RLS, Stripe, README, `AGENTS.md`, or architecture docs.

`apps/web/src/proxy.ts` must remain untouched.

## PII And Privacy Boundary

This slice is presentation-only. It must not add customer, claim, legal, medical, insurer,
document, support-message, or free-text material to labels, test ids, logs, telemetry, snapshots, or
analytics.

Allowed material:

- existing stable dashboard labels and headings;
- existing member name, member number, active claim number/status already rendered by the member
  dashboard;
- stable non-PII structural markers;
- route targets already present in the dashboard.

Blocked material:

- raw claim narratives, notes, emails, phone numbers, uploaded document text, support bodies,
  medical facts, legal strategy, insurer correspondence, AI summaries, or user-authored free text.

No AI behavior is introduced. P41-UX04 must not add model calls, prompts, embeddings, extraction,
summarization, classification, or agentic/tool-using behavior.

## Non-Goals

- Broad member portal redesign.
- New member dashboard capability or workflow.
- Claim creation, claim state, document upload, support handoff, notification, billing,
  membership, subscription, referral, or analytics behavior changes.
- New routes, route aliases, route groups, API endpoints, proxy edits, auth/session changes,
  tenancy changes, role changes, schemas, migrations, RLS, Stripe, README, `AGENTS.md`, or
  architecture docs.
- Replacing the design system, changing global dashboard shell behavior, or modifying staff/admin/
  agent dashboards.
- Runtime CRM changes, scheduler, notifications, outbox, automation, or AI behavior.

## Acceptance Criteria

- `P41-UX03` is recorded as completed in `current-program.md` and `current-tracker.md` with PR
  `#858` and merge commit `599c3fb9a647317346d1f350588f1f4db6ac6d83`.
- DG04 promotes only `P41-UX04 Member Dashboard Visual Hierarchy Hardening`.
- The canonical `/member` route still renders `MemberDashboardView` and all existing readiness
  markers needed by gates.
- The first dashboard region clearly prioritizes current member work: primary actions, guidance,
  claim/empty state, support, and activation state.
- The `dashboard-heading` marker is in the task-first region, not the secondary service hero, and
  tests prove the task-first region precedes the secondary region with `compareDocumentPosition` or
  an equivalent DOM-order assertion.
- `member-dashboard-priority-region` and `member-dashboard-secondary-region` exist as named
  accessible regions.
- Their accessible names are localized and meaningful, equivalent to "Primary tasks" and
  "Additional services and benefits".
- The secondary services region remains available but visually quieter than the task-first region.
- `ServiceEcosystemGrid` no longer exposes inaccessible interactive-looking cards or a dead
  `Explore All` control.
- Existing member dashboard links keep their current route targets.
- Existing active-claim, empty-claim, support, and primary-action tests remain green.
- Existing empty-dashboard rendering preserves both `OrientationCard` and `MemberEmptyState`.
- The combined empty-dashboard view has mobile and desktop visual proof so the preserved
  `OrientationCard` plus `MemberEmptyState` pairing does not look broken or duplicated in layout.
- `ReferralStatusColumn` still receives the existing role-sensitive `isAgent(userDetails.role)`
  value.
- Focused tests cover section order, new structural markers if added, unchanged link targets,
  active/empty claim state preservation, and simplified secondary styling contracts.
- Browser or Playwright proof covers `/member` at `390x844`, `1024x768`, and `1440x900`. If local
  auth or fixture setup blocks that proof, the implementation PR must record the exact command,
  environment, and error; vague availability notes are not acceptable.
- Touched animation/transition behavior respects reduced-motion preferences, and any remaining
  gradient clipped heading text has a forced-colors-safe fallback.
- Component or visual contract tests prove neutralized service cards do not keep `cursor-pointer`,
  hover transform, or hover shadow affordances unless they have been converted to real accessible
  actions with existing route targets.
- No proxy, canonical route, auth, tenancy, data-read, schema/RLS/migration, server-action, domain,
  Stripe, README, `AGENTS.md`, or architecture-doc change is included.

## Implementation Review Plan

The P41-UX04 implementation PR must include independent review evidence before merge:

- Security/privacy: no authority, tenancy, route, or PII boundary changes.
- Product/UX/accessibility: first-viewport task hierarchy, mobile scanability, focus order, and
  secondary-region de-emphasis.
- Maintainability: component changes remain local and do not introduce a new dashboard framework.
- QA/gates: existing member home CTAs, dashboard readiness markers, and member/agent overlay gates
  remain green.

Independent reviewer may be a subagent where available or a human/model sidecar otherwise. If the
runtime blocks subagents, record the blocker and use the strongest available local review fallback.

## Risks And Decisions

- Medium: the member dashboard already carries several historical dashboard concepts. P41-UX04
  should simplify visual hierarchy without deleting current entrypoints or changing routes.
- Medium: reducing decorative weight can accidentally alter perceived brand quality. The target is
  quieter operational polish, not a plain unstyled page.
- Medium: large dashboard cards and Digital ID content may still push work below the fold on mobile.
  Implementation must prove mobile layout and first task visibility.
- Medium: the existing secondary services grid currently looks interactive despite having no real
  action. P41-UX04 must remove the false affordance or make it a real accessible action without
  expanding route scope.
- Low: `MemberDashboardV2` exists but is not the canonical route target. P41-UX04 should not spend
  runtime effort on it unless tests prove it is directly rendered by the promoted surface.

Resolved review decisions:

- P41-UX04 is the next proposed slice because CRM ergonomics and admin/ops filter wrapping, the two
  higher-ranked P41 audit candidates, are complete.
- The implementation is presentation-only and must not introduce new member runtime behavior.
- The canonical route target is `MemberDashboardView`, not `MemberDashboardV2`.
- The `dashboard-heading` marker moves into the task-first region as part of this slice.
- `ServiceEcosystemGrid` false affordances and its no-op `Explore All` control are in scope for
  removal or neutralization.
- Structural markers are required and must be accessible named regions.
- Empty-dashboard consolidation is deferred; current `OrientationCard` plus `MemberEmptyState`
  behavior is preserved.
- A later backlog candidate may consolidate the member empty state if product review ranks it, but
  P41-UX04 only verifies the preserved pairing does not visually clash.

## Mandatory Sonnet Review Receipt

Sonnet 4.6 design review was run through Copilot CLI before promotion. The review produced two
blockers and several hardening items, all resolved in `r2`:

- `dashboard-heading` was inside the secondary hero; P41-UX04 now requires moving it to the
  task-first region and updating DOM-order tests.
- `ServiceEcosystemGrid` cards and the no-op `Explore All` affordance created accessibility risk;
  P41-UX04 now requires static cards or real accessible actions, with no new routes invented.
- Responsive proof, reduced-motion handling, forced-colors fallback, `ReferralStatusColumn` role
  preservation, structural marker accessible names, and empty-state preservation are now explicit
  implementation requirements.

## Gemini Product Review Receipt

Gemini Pro product/mobile/accessibility review was run after Sonnet hardening. It confirmed the
scope is structurally sound and emphasized four implementation guardrails, all recorded in `r3`:

- authenticated `/member` viewport proof must be treated as required implementation evidence, with
  exact blocker details and fallback screenshots only if automation is blocked;
- the two new structural regions need meaningful localized accessible names;
- the preserved `OrientationCard` plus `MemberEmptyState` pairing needs mobile and desktop visual
  proof so it does not look broken;
- neutralized service cards need explicit tests against pointer and hover affordance regressions.

## Verification Proof For This Design Gate

Before opening a promotion PR, run:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check` and repo-size audit if the added design/tracker/program text crosses the
  current budget;
- `pnpm ci:local:quick` if available in the active environment.

Also run mandatory Sonnet 4.6 architecture/scope review before promotion. Gemini Pro product/mobile/
accessibility review is recommended because the slice is product-facing UI work.

## Verification Plan For P41-UX04 Implementation

Focused implementation proof should include:

- component tests for `MemberDashboardView` section order, priority/secondary markers, active claim
  and empty state preservation, support link preservation, and unchanged primary action route
  targets;
- DOM-order tests should use `compareDocumentPosition` or an equivalent stable order assertion to
  prove task-first content precedes secondary services.
- component tests must prove `dashboard-heading` belongs to the task-first region and that
  `ServiceEcosystemGrid` no longer exposes dead or inaccessible interactive affordances.
- component or DOM tests must prove neutralized service cards do not expose `cursor-pointer`, hover
  transform, or hover shadow affordances unless converted to real actions with existing route
  targets.
- visual/screenshot proof must cover the empty-dashboard state where `OrientationCard` and
  `MemberEmptyState` both render.
- route/page tests confirming the canonical `/member` route still resolves the dashboard view and
  session boundary without route/auth changes;
- targeted member home CTA E2E proof preserving incident guide, report, Green Card, and benefits
  navigation;
- browser/Playwright responsive proof for `/member` at `390x844`, `1024x768`, and `1440x900`;
- reduced-motion and forced-colors spot checks for touched visual treatments when technically
  available in the browser toolchain;
- `pnpm i18n:check` and `pnpm i18n:purity:check` if any locale copy changes;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

The implementation PR must also run the Interdomestik implementation reviewer pool and a
diff-scoped security scan before required gates.

## Program/Tracker Promotion State

This promotion records the repo-canonical state:

- `P41-DG04` is complete after Sonnet 4.6 and Gemini Pro review hardening.
- Exactly one next implementation slice is promoted:
  `P41-UX04 Member Dashboard Visual Hierarchy Hardening`.
- Promotion changes should stay scoped to docs/plans, tracker/program proof, and repo-size budget.
- Runtime UI implementation should occur only after the gate is promoted.

## Completion State

| Item                                                     | Status   | Evidence                                                            |
| -------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `P41-UX03 Admin/Ops Filter Wrapping Hardening`           | merged   | PR `#858`, merge commit `599c3fb9a647317346d1f350588f1f4db6ac6d83`. |
| `P41-DG04 Member Dashboard Visual Hierarchy Design Gate` | complete | This document; promoted after Sonnet 4.6 and Gemini Pro hardening.  |
| `P41-UX04 Member Dashboard Visual Hierarchy Hardening`   | promoted | Sole next implementation slice authorized by this gate.             |

## Final Decision

This approved gate promotes exactly one implementation slice:

`P41-UX04 Member Dashboard Visual Hierarchy Hardening`

Implementation is authorized only within the scope and exclusions defined above.
