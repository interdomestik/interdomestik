# P41-DG03 Admin/Ops Filter Wrapping Hardening Design Gate

Status: complete
Slice: `P41-DG03`
Owner: platform + product + design + qa
Phase: Phase C
Date: 2026-05-24
Authority: approved design gate. This gate promotes the next bounded implementation slice after
`P41-UX02 Agent CRM Task Queue Action Density And Mobile Ergonomics`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, `promoted` means implementation-approved but not yet started, and `deferred`
records an explicitly postponed candidate. Tracker queue statuses remain the repo-audited values
`completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                                                                   |
| -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-24 | Initial review draft after `P41-UX02` merged through PR `#856`.                                                                         |
| `r2`     | 2026-05-24 | Sonnet 4.6 hardening for shared consumer blast radius, assignment group accessibility, link-tab tests, and structural responsive proof. |
| `r3`     | 2026-05-24 | Gemini Pro product/accessibility review; no blocker findings, local authenticated browser proof caveat retained.                        |

## Definitions

- Admin/ops filter bar: the shared `OpsFiltersBar` component used by ops-style claim and lead
  pages, including `apps/web/src/components/ops/OpsFiltersBar.tsx`.
- Filter wrapping hardening: presentation-only changes that let filter tabs, search, and
  right-side segmented controls wrap or stack without horizontal scroll, clipped labels, or broken
  keyboard order.
- Admin claims filter composition: the existing `/admin/claims` filter surface in
  `apps/web/src/components/admin/claims/claims-filters.tsx`, including status tabs, search,
  assignment filters, and diaspora-origin filters.
- Presentation-only hardening: layout, responsive classes, accessibility labels, focus/tab-order
  preservation, and tests that do not change filter semantics, query parameters, routing,
  authorization, data reads, or persistence.

## Predecessor Dependency

`P41-UX02 Agent CRM Task Queue Action Density And Mobile Ergonomics` is the direct predecessor.

Predecessor proof:

- `P41-DG02 Agent CRM Task Queue Action Density And Mobile Ergonomics Design Gate` is recorded in
  `docs/plans/2026-05-23-p41-dg02-agent-crm-task-queue-ergonomics-design.md`.
- `P41-UX02` merged as PR `#856`, merge commit
  `aa9237a08542651099fc2e1f30820b8aca06a73e`, on 2026-05-24.
- PR `#856` implemented presentation-only `/agent/crm` queue ergonomics by keeping lifecycle work
  visible, moving due-date, priority, and cancellation controls into row-local secondary actions,
  and preserving CRM26/P40 task behavior, completed recovery, lead links, route markers, canonical
  routes, and `apps/web/src/proxy.ts`.
- Remote checks were green before merge, including validation, audit, static, unit, full E2E,
  `e2e-gate`, Pilot Gate, gitleaks, pnpm-audit, PR finalizer, SonarCloud, Vercel ignored-build,
  and Vercel Preview Comments.

This promotion records `P41-UX02` as complete in `docs/plans/current-program.md` and
`docs/plans/current-tracker.md`, then promotes only the bounded P41 implementation slice defined
here.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- P41 predecessors:
  `docs/plans/2026-05-23-p41-dg01-post-crm33-ui-ux-slice-selection.md`,
  `docs/plans/2026-05-23-p41-ux01-product-surface-ux-audit.md`, and
  `docs/plans/2026-05-23-p41-dg02-agent-crm-task-queue-ergonomics-design.md`.
- Shared ops filter surface:
  `apps/web/src/components/ops/OpsFiltersBar.tsx` and
  `apps/web/src/components/ops/OpsFiltersBar.test.tsx`.
- Admin claims filter surface:
  `apps/web/src/components/admin/claims/claims-filters.tsx` and
  `apps/web/src/components/admin/claims/claims-filters.test.tsx`.
- Existing admin claims E2E proof:
  `apps/web/e2e/admin-claims-v2.spec.ts` and `apps/web/e2e/gate/golden-gate.spec.ts`.

Codebase verification as of this draft:

- `P41-UX01` ranked admin/ops filter wrapping hardening second after the CRM queue action-density
  slice, with medium severity and an explicit note that `OpsFiltersBar` plus admin-claims
  right-actions create a plausible narrow mobile wrapping risk.
- `OpsFiltersBar` currently renders its tab group as `flex gap-2` and its search/right-action area
  as `flex w-full sm:w-auto items-center gap-3`; neither container pins wrapping behavior.
- `OpsFiltersBar` applies `sm:min-w-[280px]` to search, which is useful on desktop but can crowd
  sibling right actions if the right-action area is not allowed to wrap predictably.
- Current `OpsFiltersBar` consumers are `AgentClaimsProPage`, `AgentLeadsProPage`,
  `BranchHealthFilters`, `VerificationFiltersBar`, and `AdminClaimsFilters`. The implementation
  must account for this full shared-component blast radius rather than treating admin claims as
  the only affected surface.
- `AdminClaimsFilters` composes two right-action segmented groups for assignment and diaspora
  origin. The outer right-action wrapper already uses `flex flex-wrap`, but each segmented group
  is an unwrapped `flex` row and can still become the widest item on narrow viewports.
- The diaspora-origin segmented group has `aria-label={tAdmin('filters.origin_label')}`. The
  assignment segmented group currently lacks an equivalent explicit group label and must be
  hardened as part of the accessibility contract, using localized copy such as
  `filters.assignment_label`.
- Existing admin claims tests pin URL/query semantics, pending feedback, active-tab inertness,
  overlapping navigation prevention, and the stable markers `admin-claims-filter-region`,
  `claims-tab-*`, `claims-search-input`, `assigned-filter-*`, `diaspora-filter-*`, and
  `admin-claims-pending`.

## Decision

Propose exactly one next implementation slice:

`P41-UX03 Admin/Ops Filter Wrapping Hardening`

The proposed slice hardens wrapping, stacking, and keyboard order for the existing shared
`OpsFiltersBar` and the existing `/admin/claims` filter composition. It does not change filter
semantics, query parameters, data reads, authorization, routes, or persistence.

## Candidate Ranking

| Rank | Candidate                                         | Decision | Rationale                                                                                                           |
| ---- | ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| 1    | `P41-UX03 Admin/Ops Filter Wrapping Hardening`    | Propose  | The P41 audit already ranked this as the next bounded product-professionalism risk after CRM queue ergonomics.      |
| 2    | Member dashboard visual hierarchy hardening       | Defer    | Useful, but less directly evidenced as a repeated workflow blocker than the shared ops filter wrapping risk.        |
| 3    | Staff claims queue mobile scanning polish         | Defer    | Valuable later, but broader than the shared filter bar and requires separate staff workflow ranking.                |
| 4    | Public commercial surface follow-up               | Defer    | Lower severity in the P41 audit and less tied to high-frequency authenticated operations.                           |
| 5    | Broad admin/ops information-architecture redesign | Reject   | Conflicts with Phase C route, proxy, auth, tenancy, and architecture boundaries without a separate design gate.     |
| 6    | New CRM task/runtime capability                   | Reject   | P40 closed CRM runtime product depth; P41 remains focused on product-surface professionalism for existing behavior. |

## Proposed P41-UX03 Scope

Authorized implementation scope for P41-UX03:

- Harden `OpsFiltersBar` layout so tabs, search, and right actions wrap or stack predictably at
  mobile, dense desktop, and standard desktop widths.
- Preserve all existing `OpsFiltersBar` props, tab click semantics, link-tab semantics, search
  callback semantics, pending behavior, and test IDs.
- Keep the search input full width on narrow viewports and avoid fixed or minimum widths that
  force horizontal overflow.
- Allow filter tabs to wrap before they overflow; keep tab order matching visual order.
- Allow the search/right-actions region to wrap so right actions can move below search instead of
  squeezing or clipping labels.
- Harden `/admin/claims` right-action segmented groups so assignment and diaspora-origin controls
  wrap or stack predictably without horizontal scroll.
- Add an explicit accessible group label to the assignment segmented controls, matching the
  existing diaspora-origin group pattern.
- Preserve existing admin claims query parameters: `status`, `assigned`, `diaspora`, `search`, and
  `view=list`.
- Preserve pending feedback, `aria-busy`, active-control inertness, and overlapping navigation
  prevention.
- Preserve all existing stable markers and add only non-PII layout markers if tests need them.
- Add focused unit tests proving the responsive class contract and admin-claims marker/query
  behavior remain stable.
- Add browser or Playwright proof for `/admin/claims` at mobile `390x844`, dense desktop
  `1024x768`, and standard desktop `1440x900` when a reachable authenticated environment is
  available. If auth blocks local browser proof, report the exact blocker and keep focused unit/E2E
  proof.

Expected implementation delta should stay focused on:

- `apps/web/src/components/ops/OpsFiltersBar.tsx`;
- `apps/web/src/components/ops/OpsFiltersBar.test.tsx`;
- `apps/web/src/components/admin/claims/claims-filters.tsx`;
- `apps/web/src/components/admin/claims/claims-filters.test.tsx`;
- existing consumer tests for `AgentClaimsProPage`, `AgentLeadsProPage`, `BranchHealthFilters`,
  and `VerificationFiltersBar` when those surfaces have focused tests that can run without
  unrelated fixtures;
- targeted admin claims E2E proof only if existing gate fixtures make it practical.

P41-UX03 should avoid changing page routes, query semantics, server actions, database reads,
domain packages, repositories, schemas, migrations, RLS, proxy, auth/session layering, tenancy
boundaries, Stripe, README, `AGENTS.md`, or architecture docs.

## UI And Accessibility Contract

- The shared filter bar remains visually quiet, dense, and operational rather than marketing-like.
- Tabs must remain keyboard reachable in their rendered order.
- Link tabs must keep their current `href`, `scroll={false}`, `prefetch={false}`, active inertness,
  pending inertness, and primary-click interception behavior.
- Non-link tabs must keep their current disabled behavior for active and pending states.
- Search must remain a native search input with its existing `aria-label` and test ID behavior.
- Right-action content must not become unreachable below the fold because of an independently
  scrollable nested container.
- Segmented controls in admin claims must keep `aria-pressed`, `aria-disabled`, disabled state, and
  `data-state` behavior.
- The assignment segmented group must have an explicit localized accessible group label; the
  diaspora-origin group must keep its existing accessible label.
- Wrapping must not introduce horizontal scroll at `390x844`.
- Dense desktop `1024x768` must keep tabs, search, and right actions scannable without clipped
  text or overlapping controls.
- Standard desktop `1440x900` must preserve the current efficient one-row or near-one-row layout
  where space allows.

## Entrypoint And Routing Contract

Authorized entrypoints:

- Existing shared `OpsFiltersBar`.
- Existing `/admin/claims` filter component.
- Existing route-local tests and existing admin claims E2E/golden-gate proof where practical.

Unauthorized entrypoints:

- New routes, route groups, route aliases, middleware, or API handlers.
- Changes to canonical route names or proxy behavior.
- Changes to search parameter names, filter values, or server-side filtering.
- Changes to auth, tenancy, role mapping, data access, schemas, migrations, RLS, Stripe, README,
  `AGENTS.md`, or architecture docs.

`apps/web/src/proxy.ts` must remain untouched.

## PII And Privacy Boundary

This slice is layout-only. It must not add customer, member, claim, legal, medical, insurer,
document, or free-text content to labels, markers, snapshots, logs, telemetry, or tests.

Allowed material:

- stable filter labels already rendered by the admin claims page;
- existing test IDs that do not include entity ids or PII-bearing values;
- responsive class names and layout-only assertions.

Blocked material:

- raw claim narratives, notes, emails, phone numbers, uploaded document text, member messages,
  legal strategy, medical facts, insurer correspondence, AI summaries, or user-authored free text.

## Non-Goals

- New admin, staff, agent, member, or public pages.
- Filter semantics, query-state architecture, data fetching, pagination, sorting, saved views, or
  server-side filtering changes.
- Broad ops component redesign or design-system migration.
- CRM task runtime changes, new CRM controls, assignment, task creation, scheduler, reminders,
  notifications, outbox, or AI behavior.
- Database schema, migrations, RLS, auth, tenancy, routing, proxy, canonical route, Stripe,
  README, `AGENTS.md`, or architecture-doc changes.

## Acceptance Criteria

- `P41-UX02` is recorded as completed in `current-program.md` and `current-tracker.md` with PR
  `#856` and merge commit `aa9237a08542651099fc2e1f30820b8aca06a73e`.
- DG03 promotes only `P41-UX03 Admin/Ops Filter Wrapping Hardening`.
- `OpsFiltersBar` allows tabs and the search/right-actions region to wrap or stack predictably
  without horizontal overflow on narrow viewports.
- `/admin/claims` assignment and diaspora-origin segmented controls wrap or stack predictably
  without clipped labels or horizontal overflow.
- Existing filter URLs, query parameter names, pending feedback, active inertness, and stable
  markers remain unchanged.
- Focused unit tests cover the responsive class contract structurally by asserting the relevant
  rendered DOM nodes carry wrapping/stacking classes, rather than only testing click behavior.
- Focused unit tests cover both `OpsFiltersBar` non-link and link-tab paths, including active or
  pending inertness for link tabs.
- Focused unit tests cover admin claims query/marker stability and the assignment segmented
  group's accessible label.
- Existing focused tests for the other `OpsFiltersBar` consumers remain green where present.
- Mobile `390x844`, dense desktop `1024x768`, and standard desktop `1440x900` proof is recorded
  through Playwright/browser validation when auth and fixtures allow it, or the exact auth blocker
  is recorded.
- No route, proxy, auth, tenancy, schema/RLS/migration, server action, domain, Stripe, README,
  `AGENTS.md`, or architecture-doc change is included.

## Implementation Review Plan

The P41-UX03 implementation PR must include independent review evidence before merge. Reviewer
areas:

- Product/UX: wrapping behavior improves admin/ops scanability without creating a broad redesign.
- Accessibility: keyboard order, active/inert states, native search input behavior, and segmented
  button states remain correct.
- Maintainability: shared `OpsFiltersBar` changes remain small and do not force all consumers into
  route-specific assumptions.
- QA/E2E: existing admin claims filter behavior and markers remain stable.
- Security/privacy: no PII, route, auth, tenancy, or data-access behavior changes.

Independent reviewer may be a subagent where available or a local fallback review if the runtime
blocks subagents.

## Risks And Decisions

- Medium: `OpsFiltersBar` is shared by multiple ops surfaces. The implementation must make the
  layout more resilient without adding admin-claims-specific behavior to the shared component.
- Medium: wrapping segmented controls can change visual density. The implementation should favor
  predictable wrapping and stable tab order over trying to keep every control on one line.
- Low: unit tests can only assert class/structure contracts, not actual CSS layout. Browser proof
  at the named viewports is required when auth and fixtures allow it.

Resolved review decisions:

- This is a presentation-only UX hardening slice.
- The first implementation targets the shared filter bar and the admin claims composition only.
- No query semantics, routes, data reads, or authorization behavior changes are authorized.
- Mandatory Sonnet 4.6 review ran through Copilot CLI with no blocker findings. Hardening findings
  were applied for P41-UX02 closeout recording, full `OpsFiltersBar` consumer blast-radius naming,
  assignment segmented-group accessible labeling, link-tab inertness tests, and structural
  responsive class assertions.
- Gemini Pro product/accessibility review reported no blockers. It recommended stable authenticated
  E2E infrastructure as future platform hardening, which remains outside this narrow slice.

## Verification Proof For This Design Gate

Before opening a promotion PR, run:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check` and repo-size audit if the added design/tracker/program text crosses the
  current budget.

Also run `pnpm ci:local:quick` if available in the active environment. If dependencies or auth
fixtures block a verification step, report the exact blocker and run the strongest available
fallback.

## Verification Plan For P41-UX03 Implementation

Focused implementation proof should include:

- `OpsFiltersBar` unit tests for wrapped tab/search/right-action class contracts using structural
  DOM class assertions and existing tab inert/click behavior;
- `OpsFiltersBar` link-tab tests for active or pending inertness, `aria-disabled`, `tabIndex`, and
  primary-click interception;
- `AdminClaimsFilters` unit tests proving assignment and diaspora controls keep their markers,
  disabled states, query updates, accessible group labels, and responsive wrapping classes;
- focused consumer non-regression tests for `AgentClaimsProPage`, `AgentLeadsProPage`,
  `BranchHealthFilters`, and `VerificationFiltersBar` where repo fixtures make those tests
  practical;
- targeted admin claims E2E or golden-gate proof if the existing fixtures can reach `/admin/claims`;
- browser proof at mobile `390x844`, dense desktop `1024x768`, and standard desktop `1440x900`
  when an authenticated environment is available;
- `pnpm --filter @interdomestik/web test:unit -- src/components/ops/OpsFiltersBar.test.tsx src/components/admin/claims/claims-filters.test.tsx`;
- `pnpm ci:local:quick`;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

The implementation PR must also run the Interdomestik implementation reviewer pool and a
diff-scoped security scan before required gates.

## Program/Tracker Promotion State

This promotion records the repo-canonical state:

- `P41-UX02` is recorded as complete in `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md` using PR `#856` and merge commit
  `aa9237a08542651099fc2e1f30820b8aca06a73e`.
- `P41-DG03` is complete after mandatory Sonnet 4.6 review through Copilot CLI and Gemini Pro
  product/accessibility review.
- Exactly one next implementation slice is promoted:
  `P41-UX03 Admin/Ops Filter Wrapping Hardening`.
- Promotion changes stay scoped to docs/plans, tracker/program proof, and repo-size budget.
- Do not edit runtime code, tests, proxy, routes, auth, tenancy, schemas, migrations, Stripe,
  README, `AGENTS.md`, or architecture docs during DG03 promotion.

## Completion State

| Item                                                                 | Status   | Evidence                                                            |
| -------------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `P41-UX02 Agent CRM Task Queue Action Density And Mobile Ergonomics` | merged   | PR `#856`, merge commit `aa9237a08542651099fc2e1f30820b8aca06a73e`. |
| `P41-DG03 Admin/Ops Filter Wrapping Hardening Design Gate`           | complete | This document; hardened after Sonnet 4.6 and Gemini Pro review.     |
| `P41-UX03 Admin/Ops Filter Wrapping Hardening`                       | promoted | Sole next implementation slice authorized by this gate.             |

## Final Decision For Review

This gate promotes exactly one implementation slice:

`P41-UX03 Admin/Ops Filter Wrapping Hardening`

Implementation is authorized only within the scope and exclusions defined above.
