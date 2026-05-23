# P41-DG02 Agent CRM Task Queue Action Density And Mobile Ergonomics Design Gate

Status: complete
Slice: `P41-DG02`
Owner: platform + product + design + qa
Phase: Phase C
Date: 2026-05-23
Authority: approved design gate. This gate promotes the next bounded implementation slice after
`P41-UX01 Product Surface UX Audit And Slice Ranking`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, `promoted` means implementation-approved but not yet started, and `deferred`
records an explicitly postponed candidate. Tracker queue statuses remain the repo-audited values
`completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                 |
| -------- | ---------- | --------------------------------------------------------------------- |
| `r1`     | 2026-05-23 | Initial review draft after `P41-UX01` merged through PR `#854`.       |
| `r2`     | 2026-05-23 | Sonnet 4.6 hardening for disclosure state, ARIA, i18n, and proof.     |
| `r3`     | 2026-05-23 | Gemini Pro hardening for focus flow, refresh state, and sub-action exclusivity. |

## Definitions

- Action density: the amount of visible row-local task controls competing with lead context,
  status, due-date, priority, cancellation, and lifecycle affordances inside an existing
  `/agent/crm` task row.
- Mobile ergonomics: the ability to scan a non-empty CRM task queue and operate each task on a
  narrow viewport without horizontal scroll, clipped controls, incoherent wrapping, or broken
  keyboard order.
- Dense desktop: a constrained desktop viewport that still represents desktop usage but exposes
  row crowding. DG02 defines the proof viewport as `1024x768` with at least one open CRM task row
  containing Start or Complete, due-date, priority, cancellation, and lead-link affordances.
- Primary row actions: high-frequency row actions that should stay immediately visible on open
  task rows. For P41-UX02, these are the current lifecycle action (`Start` or `Complete`) and the
  lead link or lead-opening affordance.
- Secondary row actions: lower-frequency or higher-risk row actions that should be grouped in a
  compact row-local disclosure: due-date adjustment, priority adjustment, and cancellation.
- Dirty secondary draft: an unsaved route-local edit value inside the secondary disclosure, such as
  a changed due-date input or changed priority select value that has not been submitted.
- Presentation-only hardening: route-local layout, grouping, responsive behavior, focus, labels,
  and test/proof updates that do not change CRM task state machines, server actions, action
  payloads, persistence, authorization, routing, or schemas.

## Predecessor Dependency

`P41-UX01 Product Surface UX Audit And Slice Ranking` is the direct predecessor.

Predecessor proof:

- `P41-DG01 Post-CRM33 UI/UX Slice Selection Design Gate` is recorded in
  `docs/plans/2026-05-23-p41-dg01-post-crm33-ui-ux-slice-selection.md`.
- `P41-UX01` is recorded in
  `docs/plans/2026-05-23-p41-ux01-product-surface-ux-audit.md`.
- `P41-UX01` merged as PR `#854`, merge commit
  `3c34d82ec8ec66572e75ae9cbc2d70668a481e19`, on 2026-05-23.
- The audit ranked accumulated `/agent/crm` CRM task-row action density and mobile ergonomics as
  the clearest post-P40 product-professionalism risk.
- The audit recommended exactly one next design gate:
  `P41-DG02 Agent CRM Task Queue Action Density And Mobile Ergonomics Design Gate`.
- `P41-UX01` did not edit runtime UI, route code, auth, tenancy, schemas, tests, messages, proxy,
  Stripe, README, `AGENTS.md`, or architecture docs.

This promotion records `P41-DG02` as complete in `docs/plans/current-program.md` and
`docs/plans/current-tracker.md`, then promotes only the bounded P41 implementation slice defined
here.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- P41 predecessors:
  `docs/plans/2026-05-23-p41-dg01-post-crm33-ui-ux-slice-selection.md` and
  `docs/plans/2026-05-23-p41-ux01-product-surface-ux-audit.md`.
- CRM task queue implementation files:
  `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-due-date-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-priority-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-cancel-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-reopen-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-icon-button.tsx`, and
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts`.
- Existing migrated follow-up E2E proof: `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.
- Existing localization inputs: `apps/web/src/messages/en/agent-crm.json` and sibling active app
  locale files for `sq`, `sr`, and `mk`.

Codebase verification as of this draft:

- `/agent/crm` renders the active open CRM task queue, completed recovery panel, and legacy
  due-follow-up panel on one route.
- Open CRM task rows use a responsive row layout that stacks on small screens and places actions
  in a secondary column on wider screens.
- `task-queue-controls.tsx` composes Start or Complete, due-date edit/clear/save, always-visible
  priority select/save, and cancellation controls in one row-local action area.
- Due-date controls can expand into a datetime-local input plus Save, Clear, and Cancel affordances.
- Priority controls remain always visible on every open CRM task row after P40-CRM33.
- Cancellation uses a row-local inline confirmation and reason picker.
- Completed recovery rows are already separated into a distinct completed panel and use
  `task-queue-reopen-controls.tsx`.
- Existing queue clarity markers include `agent-crm-page-ready`, `agent-crm-task-queue-ready`, and
  `agent-crm-task-completed-queue-ready`.

## Decision

Promote exactly one next implementation slice:

`P41-UX02 Agent CRM Task Queue Action Density And Mobile Ergonomics`

The proposed slice hardens the presentation and interaction model of existing `/agent/crm` task
queue rows. It keeps high-frequency lifecycle work visible, groups secondary task management
controls into an accessible row-local disclosure, and proves the resulting layout on mobile and
dense desktop viewports. It does not add, remove, or change CRM task behavior.

## Candidate Ranking

| Rank | Candidate                                                                | Decision | Rationale                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P41-UX02 Agent CRM Task Queue Action Density And Mobile Ergonomics`     | Propose  | Directly addresses the P41-UX01 top risk with a route-local presentation-only slice and clear proof surface.                                                   |
| 2    | Completed recovery panel visual polish                                   | Defer    | Related but narrower; completed rows are less action-dense than open work rows and should remain secondary to active queue ergonomics.                         |
| 3    | Admin/ops filter wrapping hardening                                      | Defer    | Plausible product-surface risk, but shared component blast radius is broader than route-local CRM queue hardening.                                             |
| 4    | Member dashboard visual hierarchy hardening                              | Defer    | Useful future lane, but current evidence ranks repeated agent CRM workflow density higher.                                                                     |
| 5    | Staff claims queue mobile scanning polish                                | Defer    | Staff queue density is real, but the surface is older and already has more established responsive proof than the newly expanded CRM row action stack.           |
| 6    | Additional CRM task runtime feature                                      | Reject   | P40 closed CRM task runtime depth. P41 should improve professionalism of existing behavior rather than add new CRM capability by default.                       |
| 7    | Broad agent workspace redesign or cross-role navigation redesign         | Reject   | Conflicts with Phase C route, proxy, auth, tenancy, and information-architecture constraints without a separate design gate.                                    |

## Proposed P41-UX02 Scope

Authorized implementation scope for P41-UX02:

- Harden only the existing `/agent/crm` CRM task queue presentation.
- Preserve existing CRM26 server actions and route-local action wrappers.
- Preserve current task behavior for Start, Complete, due-date update/clear, priority update,
  cancellation, completed-task recovery, lead links, result-copy mapping, pending states, and
  row-local live-region messages.
- Keep the current lifecycle action (`Start` for pending rows, `Complete` for in-progress rows)
  immediately visible on open queue rows.
- Keep lead navigation immediately visible and keyboard reachable.
- Move due-date adjustment, priority adjustment, and cancellation into a compact row-local
  secondary-actions disclosure on open task rows.
- Keep cancellation destructive handling behind its existing explicit row-local confirmation and
  reason-selection flow inside the secondary-actions region.
- Keep due-date and priority controls row-local; do not introduce page-level modals, global
  dialogs, toasts as the only feedback, or route-level task editors.
- Add an explicit row-local close control inside the secondary-actions panel in addition to
  allowing the disclosure trigger and `Escape` key to close the panel.
- Preserve the completed recovery panel as a distinct section below the open queue. Reopen controls
  may receive minor presentation alignment only when needed to avoid visual inconsistency, but no
  completed-row behavior change is authorized.
- Keep legacy due-follow-up entries visually separate from CRM task queue rows.
- Add or update active locale copy only for labels needed by the secondary-actions disclosure,
  such as open, close, more actions, and accessible group names.
- Add focused tests and visual/browser proof for mobile and dense desktop behavior.
- Do not add animation to the secondary-actions disclosure in the first implementation slice.
  Height or opacity transitions add timing and proof complexity without solving the P41-UX01 risk.

Expected implementation delta should stay focused on:

- `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx` only if row composition or section
  headings require wiring changes;
- `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx`;
- existing route-local task queue control components;
- a narrow route-local secondary-actions disclosure component if extracting it simplifies the row;
- route-local component/page tests and the targeted `agent-crm-follow-up` E2E gate;
- active app locale message files only for new presentation labels.

P41-UX02 should avoid changing server actions, domain packages, repositories, database schema,
migrations, RLS, proxy, route groups, auth/session layering, tenancy boundaries, Stripe, README,
`AGENTS.md`, or architecture docs.

## Row Interaction Contract

Open queue rows must distinguish primary work from secondary adjustment:

- Primary row area:
  - lead context and current status remain visible;
  - priority and due-date summary remain visible as non-editing context;
  - the current lifecycle action remains visible;
  - the lead link remains visible.
- Secondary row area:
  - due-date editor, priority editor, and cancellation affordance are grouped under one compact
    row-local disclosure;
  - the disclosure trigger must have an accessible name that includes row context or otherwise
    points to row context through a stable accessible relationship;
  - the disclosure trigger must be a native `button` with `aria-expanded` and `aria-controls`
    targeting a stable row-local panel id;
  - the trigger button's accessible name must use `crm.taskQueue.secondaryActions.openFor` when
    row context is available, falling back to `crm.taskQueue.secondaryActions.open` only when a
    row-specific label cannot be formed without adding PII;
  - the disclosure panel must be a row-local `div` with `role="group"` and a meaningful label from
    `crm.taskQueue.secondaryActions.group` or `crm.taskQueue.secondaryActions.groupFor`;
  - the panel must contain a row-local close control using `crm.taskQueue.secondaryActions.closeFor`
    when row context is available, falling back to `crm.taskQueue.secondaryActions.close` only when
    needed to avoid PII-bearing labels;
  - the preferred implementation allows multiple rows to have their own secondary disclosure open
    at the same time, but row state, live regions, and focus must remain independent. If that
    independence cannot be proven, the implementation must use a parent-managed close-others-on-open
    fallback and document it in the PR.
- Expanded secondary actions:
  - the disclosure reveals three stacked sub-groups in a fixed order: due-date actions, priority
    actions, and cancellation actions;
  - each sub-group keeps its existing internal editor or confirmation state. The due-date control
    may still enter its current edit mode, priority may still expose its select/save state, and
    cancellation may still enter its current confirmation state;
  - due-date adjustment preserves existing date/time input, save, clear, cancel, pending, success,
    and error behavior;
  - priority adjustment preserves existing select/save, same-priority disabled state, pending,
    success, conflict, and error behavior;
  - cancellation preserves existing explicit confirmation, reason picker, dismiss behavior,
    pending, success, conflict, terminal, rate-limit, and error behavior;
  - cancellation confirmation is mutually exclusive with other secondary editing. When the
    cancellation confirmation is open, due-date and priority controls in that row's disclosure must
    be disabled until cancellation is submitted or dismissed;
  - closing the secondary disclosure while due-date or priority draft values are dirty must discard
    the route-local draft values silently and reset them to the current server-rendered row values
    the next time the disclosure opens. Do not add a warning dialog or unsaved-changes prompt.

The UI must not perform client-side authorization. Controls render only for rows already present in
the trusted server-derived queue DTO, and all mutations continue through existing server actions.

The existing row-level disabled contract remains in force across the new disclosure boundary.
When any mutation is pending for a row, primary lifecycle controls and all controls inside that
row's secondary disclosure are disabled for that row only. Adjacent rows, the completed recovery
panel, and legacy due-follow-up entries remain interactive unless their own row/action is pending.

## Responsive Layout Contract

P41-UX02 must prove the open queue row at these viewports:

- mobile: `390x844`;
- dense desktop: `1024x768`;
- standard desktop sanity: `1440x900`.

At each viewport:

- no row-local control may require horizontal scroll;
- button text and select labels must fit within their containers or wrap in a professional layout;
- the row must keep a stable tab order from row context through primary action, lead navigation,
  and secondary actions;
- expanded secondary actions must wrap or stack predictably without overlaying adjacent rows;
- dense desktop proof must open the secondary disclosure and show all three secondary action
  families in the row. It does not require due-date edit mode and cancellation confirmation to be
  expanded simultaneously unless the final implementation permits that state; if it does, that
  simultaneous expanded state must also be checked for no overlap or horizontal scroll;
- live-region messages must remain row-local and must not visually obscure the next row;
- successful server refresh or row reordering must not jump focus to the top of the page;
- after a server refresh or row reorder, any open secondary disclosure should close and focus
  should land on the row's disclosure trigger if the row still exists, or the open queue heading if
  the row no longer exists.

Dense desktop proof is required because CRM row crowding can appear before mobile breakpoints. The
implementation PR must include screenshot, trace, or Playwright evidence for at least one non-empty
row containing all existing open-row action families.

## Accessibility And Focus Contract

P41-UX02 must preserve WCAG 2.1 AA expectations for the affected route:

- The existing `agent-crm-page-ready`, `agent-crm-task-queue-ready`, and
  `agent-crm-task-completed-queue-ready` markers remain stable.
- The secondary-actions disclosure trigger must be keyboard reachable and have a clear accessible
  name.
- The expanded secondary-actions region must use a row-local grouping pattern with a meaningful
  label.
- Existing row-local `aria-live="polite"` messaging remains available for each mutation family.
- Opening the secondary disclosure moves focus to the first enabled interactive control inside the
  panel.
- Collapsing the secondary disclosure returns focus to the disclosure trigger.
- Pressing `Escape` from inside the secondary disclosure closes the disclosure and returns focus to
  the disclosure trigger.
- Dismissing cancellation confirmation while the secondary disclosure remains open returns focus to
  the cancel-task affordance inside the disclosure. If a server refresh removes or hides that
  affordance, focus falls back to the disclosure trigger.
- Successful due-date, priority, cancellation, or lifecycle mutations preserve the behavior defined
  by their existing P40 contracts, including generic conflict handling and non-PII errors.
- Pending state for one row must not disable or announce state for adjacent rows, the completed
  panel, or legacy due-follow-up entries.

New locale keys for the disclosure must use this namespace in all active locales:

- `crm.taskQueue.secondaryActions.open`;
- `crm.taskQueue.secondaryActions.openFor`;
- `crm.taskQueue.secondaryActions.close`;
- `crm.taskQueue.secondaryActions.closeFor`;
- `crm.taskQueue.secondaryActions.group`;
- `crm.taskQueue.secondaryActions.groupFor`.

Existing value and action labels must continue using their current namespaces, including
`crm.taskQueue.dueActions.*`, `crm.taskQueue.priorityActions.*`, `crm.taskQueue.cancelActions.*`,
and `crm.taskQueue.priority.*`.

## Entrypoint And Routing Contract

Authorized entrypoints for P41-UX02:

- Existing `/agent/crm` page and route-local component flow.
- Existing CRM task server actions and route-local wrappers.
- Existing task queue component and E2E proof surfaces.

Unauthorized entrypoints:

- New `app/api/**/route.ts` HTTP handlers.
- New `app/api/cron/**/route.ts` cron handlers.
- New route groups, route aliases, middleware, proxy edits, or canonical route rewrites.
- New `/member`, `/staff`, or `/admin` task UI.
- New task detail route, full task history route, queue filter route, or action API.

`apps/web/src/proxy.ts` must remain untouched.
`task-queue-reopen-controls.tsx` and completed recovery behavior are out of scope except for
route-level spacing or alignment necessary to keep the completed panel visually distinct after the
open-row hardening.

## PII And Privacy Boundary

P41-UX02 is presentation-only and must not introduce new data exposure.

Allowed UI material:

- existing task status, priority, due date, completion/cancellation/reopen summaries already shown
  by the CRM task queue;
- existing lead display reference and lead link;
- stable localized labels for primary actions, secondary actions, disclosure open/close, pending,
  and row-local errors;
- existing non-PII result-copy buckets.

Blocked UI material:

- lead notes, emails, phone numbers, member messages, support-handoff bodies, public responses,
  insurer correspondence, claim narratives, medical facts, legal strategy, assistance summaries,
  document text, AI summaries, or legacy follow-up free text;
- raw task titles or descriptions if not already displayed by the queue contract;
- PII in `data-testid` values, telemetry names, route params beyond existing lead links, logs,
  snapshots, or error messages.

No AI behavior is introduced. P41-UX02 must not add model calls, prompts, embeddings, AI scoring,
AI routing, summarization, extraction, or agentic/tool-using behavior.

## Side-Effect Contract

P41-UX02 may change layout, grouping, labels, focus handling, and tests for existing row controls.

It must not add:

- new CRM task mutations or action payload fields;
- task create, assign, reassign, bulk action, drag/drop ordering, filters, saved views, pagination,
  full history, or task detail/timeline surfaces;
- staff/admin/member task-management UI;
- scheduler, cron, due-task runner, reminders, notification fanout, email, SMS, WhatsApp, push,
  analytics, calendar, or outbox emission;
- database schema, migration, RLS, repository, adapter, or domain-package changes;
- auth, tenancy, routing, proxy, canonical route, Stripe, README, `AGENTS.md`, or architecture-doc
  changes.

## Acceptance Criteria

- `P41-UX01` is recorded as completed in `current-program.md` and `current-tracker.md` with PR
  `#854` and merge commit `3c34d82ec8ec66572e75ae9cbc2d70668a481e19`.
- DG02 promotes only `P41-UX02 Agent CRM Task Queue Action Density And Mobile Ergonomics`.
- P41-UX02 is presentation-only and does not change CRM task server actions, action payloads,
  domain state machines, repository behavior, schemas, migrations, RLS, auth, tenancy, routing, or
  proxy behavior.
- Open queue rows keep lifecycle action and lead navigation immediately visible.
- Due-date adjustment, priority adjustment, and cancellation are grouped into a compact row-local
  secondary-actions disclosure.
- The disclosure uses a native `button` with `aria-expanded` and `aria-controls`, and the panel is
  a labeled row-local `role="group"` region.
- Closing the disclosure silently discards unsubmitted due-date and priority draft values and
  resets them from current row values on the next open.
- Cancellation remains explicitly confirmed with reason selection before submission.
- The row-level pending disabled contract still spans primary lifecycle controls and secondary
  controls for the same row only.
- Existing Start/Complete, due-date, priority, cancellation, completed recovery, lead-link, queue
  marker, legacy due-follow-up, result-copy, pending, and conflict behavior remains stable.
- Completed recovery rows remain visually distinct from active work and do not become a full task
  history surface.
- Mobile `390x844`, dense desktop `1024x768`, and standard desktop `1440x900` proof shows no
  horizontal scroll, clipped controls, incoherent wrapping, or action overlap with the disclosure
  open and all secondary action families visible.
- Keyboard and focus proof covers opening and closing secondary actions, operating due-date,
  priority, and cancellation controls, row-local pending/error states, and refresh/reorder behavior.
- Active locale labels are present for `sq`, `en`, `sr`, and `mk` if new disclosure copy is added.
- No PII-bearing content is introduced in labels, test IDs, logs, snapshots, or error copy.

## Implementation Review Plan

The P41-UX02 implementation PR must include independent review evidence before merge. Reviewer
areas:

- Product/design: primary vs. secondary action grouping, repeated-use efficiency, completed-panel
  separation, and dense row scanning.
- Accessibility/QA: keyboard order, focus return, live-region independence, row-local pending and
  error behavior, mobile and dense-desktop proof.
- Platform: route-local scope, no server-action/domain/schema drift, no proxy or routing changes,
  no new CRM behavior.
- Security/privacy: no new PII exposure, no caller-supplied authority, no leaking low-level action
  errors through UI copy or test snapshots.

Independent reviewer may be a subagent where available or a human sidecar otherwise. Mandatory
Sonnet 4.6 design review applies before DG02 promotion.

## Risks And Decisions

- High: grouping secondary actions can hide important task controls if the disclosure label is too
  vague. The label must name the row-local task actions clearly, not use an ambiguous overflow-only
  pattern.
- High: moving existing controls can regress focus, live-region, and pending-state behavior. The
  implementation must prove keyboard operation for every existing action family.
- High: disclosure focus behavior can become inconsistent across pointer, keyboard, and refresh
  paths if left to implementer judgment. P41-UX02 pins focus on open, close, `Escape`, cancellation
  dismiss, and post-refresh/reorder behavior.
- High: unsaved route-local due-date or priority drafts can become confusing if the disclosure
  closes. P41-UX02 resolves this by silently discarding unsubmitted drafts on disclosure close and
  resetting them from the current server-rendered row state on next open; no warning prompt is
  authorized.
- Medium: reducing always-visible controls may add one interaction for due-date, priority, or
  cancellation edits. This is accepted because those actions are lower frequency than Start,
  Complete, and lead navigation, and because the current row stack competes for scanability.
- Medium: multiple expanded rows could reintroduce vertical density. The preferred behavior is
  independent row-local disclosure state with predictable expansion. If independence cannot be
  proven, a close-others-on-open fallback is authorized inside the route-local queue component.
- Medium: completed recovery rows could look like full task history if over-emphasized. P41-UX02
  keeps them below the open queue and does not change recovery scope.

Resolved design decisions:

- The next implementation slice is presentation-only.
- Start/Complete and lead navigation remain immediately visible.
- Due-date, priority, and cancellation move into a row-local secondary-actions disclosure.
- The disclosure reveals all three secondary action families as stacked sub-groups, preserves each
  existing sub-control's internal behavior, and uses the named `secondaryActions` locale namespace.
- Cancellation confirmation is mutually exclusive with due-date and priority editing inside the
  same disclosure.
- No CRM runtime capability is added.
- Dense desktop proof at `1024x768` is mandatory, alongside mobile and standard desktop proof.

## Sonnet 4.6 Design Review Proof

Mandatory architecture/scope review ran through the callable Copilot Sonnet route:
`copilot -p "<minimized non-PII design packet>" --model claude-sonnet-4.6 --available-tools=""
--disable-builtin-mcps --no-custom-instructions --no-color`.

Review result:

- Verdict: Not promotable as written before `r2`; promotable after resolving blockers and
  hardening items in this revision.
- Blockers resolved in `r2`:
  - dirty draft behavior on disclosure close is now pinned to silent discard and reset from current
    row values on next open;
  - secondary disclosure structure is now pinned to three stacked sub-groups preserving existing
    due-date, priority, and cancellation internal states;
  - multi-row expansion now has an explicit independence test requirement and close-others-on-open
    fallback if independence cannot be proven.
- Hardening applied in `r2`:
  - disclosure ARIA pattern is now pinned to native `button` plus `aria-expanded`/`aria-controls`
    and a labeled `role="group"` panel;
  - focus-return targets are disambiguated for disclosure collapse versus cancellation dismiss;
  - disclosure i18n keys are explicitly named under `crm.taskQueue.secondaryActions.*`;
  - dense-desktop proof is reconciled with the chosen sub-group structure;
  - the existing row-level pending disabled contract is explicitly preserved across the disclosure
    boundary;
  - disclosure animation is excluded, and completed recovery controls are explicitly out of scope.

## Gemini Pro Product/UX Review Proof

Recommended product, mobile, and accessibility critique ran through the callable Gemini route:
`gemini -p "<minimized non-PII design packet>" --model gemini-2.5-pro --output-format text`.

Review result:

- Verdict: Ready to promote, conditional on hardening.
- Blockers: None.
- Hardening applied in `r3`:
  - focus behavior is now explicit for opening, closing, `Escape`, cancellation-dismiss, and
    refresh/reorder paths;
  - post-refresh/reorder behavior now closes any open secondary disclosure and defines the focus
    fallback;
  - cancellation confirmation is now mutually exclusive with due-date and priority editing inside
    the same disclosure;
  - `secondaryActions.openFor`, `groupFor`, and `closeFor` application is now normative when row
    context can be used without adding PII;
  - an explicit close control inside the disclosure is required.

## Verification Proof For This Design Gate

Before opening the promotion PR, run:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check`;
- `pnpm ci:local:quick` if available in the active environment.

Also run an Interdomestik scope audit that confirms changes are limited to `docs/plans/**` and
repo-size budget files if needed.

## Verification Plan For P41-UX02 Implementation

Focused implementation proof should include:

- component tests for primary action visibility, secondary-actions disclosure open/close, due-date
  controls inside the disclosure, priority controls inside the disclosure, cancellation confirmation
  inside the disclosure, and completed recovery panel preservation;
- accessibility tests or Playwright proof for keyboard order, accessible names, group labels,
  focus return, row-local live-region messages, and pending-state independence;
- mobile and dense-desktop screenshot or trace proof at `390x844`, `1024x768`, and `1440x900`;
- targeted E2E proof extending `apps/web/e2e/gate/agent-crm-follow-up.spec.ts` or a narrow sibling
  gate so a non-empty CRM task row exercises the grouped controls;
- existing focused route-local unit tests for due-date, priority, cancellation, and recovery
  behavior staying green;
- `pnpm i18n:check` and `pnpm i18n:purity:check` if new locale copy is introduced;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

The implementation PR must also run the Interdomestik implementation reviewer pool and a
diff-scoped security scan before required gates.

## Program/Tracker Promotion State

This promotion records the following repo-canonical state:

- `P41-UX01` remains complete in `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md` with PR `#854` and merge commit
  `3c34d82ec8ec66572e75ae9cbc2d70668a481e19`.
- `P41-DG02` is complete after mandatory Sonnet 4.6 review, Gemini Pro review, and hardening.
- Exactly one next implementation slice is promoted:
  `P41-UX02 Agent CRM Task Queue Action Density And Mobile Ergonomics`.
- Promotion changes stay scoped to `docs/plans/**` and repo-size budget proof if needed.
- Do not edit runtime code, tests, messages, proxy, routes, auth, tenancy, schemas, migrations,
  Stripe, README, `AGENTS.md`, or architecture docs during DG02 promotion.

## Completion State

| Item                                                                 | Status       | Evidence                                                                 |
| -------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `P41-UX01 Product Surface UX Audit And Slice Ranking`                | merged       | PR `#854`, merge commit `3c34d82ec8ec66572e75ae9cbc2d70668a481e19`.   |
| `P41-DG02 Agent CRM Task Queue Action Density And Mobile Ergonomics` | complete | This document; promoted after Sonnet 4.6 and Gemini Pro hardening.       |
| `P41-UX02 Agent CRM Task Queue Action Density And Mobile Ergonomics` | promoted | Sole next implementation slice authorized by this gate.                  |

## Final Decision For Review

This gate promotes exactly one implementation slice:

`P41-UX02 Agent CRM Task Queue Action Density And Mobile Ergonomics`

Implementation is authorized only within the scope and exclusions defined above.
