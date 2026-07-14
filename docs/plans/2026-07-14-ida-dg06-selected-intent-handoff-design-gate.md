---
plan_role: input
status: active
source_of_truth: false
slice: IDA-DG06
proposed_implementation_slice: IDA-UI01b
owner: platform + product + design + qa
date: 2026-07-14
last_reviewed: 2026-07-14
---

# IDA-DG06 — Need-Led Journey And Selected-Intent Handoff Design Gate

> Status: accepted current-authority/design gate. Arben explicitly approved
> `IDA-DG06` and the sole promotion of `IDA-UI01b` on 2026-07-14. Matching canonical
> `current-program.md` and `current-tracker.md` records promote exactly that one
> implementation slice.

## Decision sought

Promote one Tier 2 UI/workflow slice that carries the anonymous visitor's selected
vehicle, injury, or property intent from the approved help-first hero into the
existing Free Start intake without asking the same question twice.

The slice replaces the selected-intent confirmation and the existing `details`
state with the premium Fable-reviewed visual and interaction direction. It does not
add another `StepId` or progressively reveal new substeps. The ordinary `category`
fallback, `preview`, and `complete` states remain legacy presentation. It does not
change Free Start submission, claim-pack generation, analytics-on-completion,
membership continuation, or M0–M5 architecture.

## Authority and advisory reconciliation

| Source                                        | Current evidence                                                                                                  | Disposition                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-07-14-ida-ui01a-closeout.md` | `IDA-UI01a` is complete; no replacement slice is promoted.                                                        | Binding. A fresh gate is required.                                                                    |
| Repo resolver                                 | `blocked_requires_current_authority`, `activeSlice=null`.                                                         | Binding. Runtime remains blocked.                                                                     |
| `IDA-DG05` later-presentation queue           | First later item is chosen-intent proof and document preparation.                                                 | Binding design input, not promotion.                                                                  |
| AI OS refresh/check on 2026-07-14             | Interdomestik authority current, no active slice, runtime not authorized.                                         | Advisory and aligned.                                                                                 |
| Brain exact retrieval                         | Current `IDA-UI01a` closeout ranked first; the later-presentation section ranked first for the next-action query. | Advisory retrieval supports this candidate.                                                           |
| AI OS `Now.md`                                | Still names AI OS maintenance as the daily focus.                                                                 | Advisory drift; Arben explicitly selected this bounded UI design gate, while runtime remains blocked. |
| Arben                                         | Approved starting DG06 and rejected classic SaaS presentation as the future platform direction.                   | Human product/design decision, bounded by repo authority.                                             |

## Platform-wide experience premise

Interdomestik no longer uses classic SaaS card grids as the organizing idea for new
presentation work. The canonical UI/UX direction is a need-led journey that reveals
the next useful action with calm, direct language:

1. public: what happened → confirm the need → show the next useful step;
2. member: current case state → one clear next step → supporting evidence;
3. agent: person or work needing attention → required action → completion proof;
4. staff: queue item → decision/evidence requirement → governed outcome;
5. admin: exception or risk → control action → audit/system state.

This premise replaces presentation in place. It does not rename or bypass
`/member`, `/agent`, `/staff`, or `/admin`; alter `ida.*` as the single neutral
front door; derive tenancy or branding from host; or create a second UI architecture.
Each role surface still requires its own future single-slice gate. DG06 implements
only the public selected-intent handoff.

## Locked visual direction

The controlling baseline is the premium public-entry direction approved after
bounded Sol Ultra and Fable review:

- warm ivory `#F9F6F0`, midnight `#001A33`, and measured calm teal;
- editorial serif only for a human question or short reassurance; legible sans-serif
  for fields, actions, status, and supporting copy;
- flat linework, generous spacing, visible focus, and restrained containment;
- no illustration, gradient, glassmorphism, decorative blob, 3D treatment, generic
  dashboard card stack, unsupported badge, gratuitous shadow, or trauma imagery;
- no teaching-style `Si funksionon` or `udhëzime praktike` framing;
- no repeated `Zgjidhni situatën` after the user already selected one;
- warmth comes from direct language, continuity, honest safeguards, and reachable
  support—not decoration.

The current Free Start dark shell, pill stepper, three-card category grid, cyan glow,
confidence badge treatment, and two-card layout are legacy presentation. They are
source behavior to preserve or progressively replace, not a visual reference.

## Primary user and outcome

- **User:** an anonymous visitor who has just selected vehicle accident, injury, or
  property damage in the approved `Çfarë ju ka ndodhur?` hero.
- **Problem:** all three rows currently target the same `#free-start-intake` anchor,
  so the intake asks for the category again and breaks the personal journey.
- **Outcome:** the intake confirms the chosen intent, moves directly to the existing
  relevant detail step, and retains a clear `Ndrysho` action.
- **Fallback:** a direct visit to `#free-start-intake`, a no-JavaScript anchor
  navigation, or invalid/missing intent still shows the ordinary category choice.
- **Commercial outcome:** reduce repeated-choice friction while keeping membership
  honest and secondary to the immediate-help path on this surface.

## Selected-intent contract

The allowed intent set is exactly the existing Free Start category union:

| Hero intent      | Existing category | First intake state                                 |
| ---------------- | ----------------- | -------------------------------------------------- |
| vehicle accident | `vehicle`         | intent confirmed; relevant issue choices available |
| injury           | `injury`          | intent confirmed; relevant issue choices available |
| property damage  | `property`        | intent confirmed; relevant issue choices available |

The implementation must use an ephemeral, one-shot in-memory handoff inside the
existing landing runtime. The hero emits an allowlisted intent event; the intake
remains the sole category source of truth and consumes that event once. Consumption,
`Ndrysho`, and settlement into authenticated member mode clear the pending event.
Selecting the same row again after consumption emits a new one-shot event without
creating mirrored parent/child category state.

The handoff must not put `injury` or another selected intent into the URL, query
string, cookie, localStorage, sessionStorage, analytics event, server action, log,
telemetry payload, or analytics/session/app-wide/third-party provider state merely
because the hero row was selected. Focused route-local React state or a route-local
hook is the required mechanism and is not prohibited provider state. This avoids
referrer/log leakage and preserves the existing rule that no Free Start data is
submitted until the user deliberately completes the intake.

Every hero row remains a real `#free-start-intake` anchor. With JavaScript available,
the row also passes the allowlisted category to the existing intake state before the
anchor settles. Without JavaScript, the anchor still works and the category fallback
is visible. Invalid or absent input fails closed to no preselection.

## Target journey

### 1. Continuity from the hero

- The whole situation row remains the interactive target.
- Activation scrolls to the existing Free Start landmark. Pointer or touch activation
  uses native anchor behavior and must not programmatically move focus. Non-pointer
  activation, including keyboard activation, moves focus exactly once after render to
  the labelled intake `h2`. The `h2` has a stable ID and `tabIndex={-1}`, and the
  intake section names itself with `aria-labelledby` pointing to that ID.
- The first visible intake message acknowledges continuity instead of restarting:
  `Po vazhdoni për:` followed by the localized selected-situation label.
- A visible `Ndrysho` action clears the pending handoff and returns to the ordinary
  legacy `category` state without losing safe draft fields. Because `Ndrysho` removes
  its own control, focus moves to the newly rendered category heading. Selecting a
  different category is the confirmation and clears only incompatible issue
  selection; no confirmation modal is introduced.

### 2. Focused details task

The exact first-task boundary is the existing `details` state. The selected-intent
handoff bypasses the repeated `category` state and opens one focused details task
using the existing fields in their current behavioral order. No new `StepId`,
progressive substep, eligibility, legal-merit, coverage, compensation, diagnosis, or
outcome scoring is authorized.

The preferred composition is:

1. compact context line: `Po vazhdoni për: Aksident me veturë` + `Ndrysho`;
2. one calm question heading for the current task;
3. existing fields in natural reading order with plain-language labels;
4. one visually dominant continuation action and one quiet back/change action;
5. privacy/emergency/support guidance in the same visual register, without a second
   competing card.

### 3. Existing completion behavior

Details, preview, submission, claim-pack generation, completion analytics, and
membership/member continuation retain their existing behavioral contracts. DG06 may
define their future visual direction, but `IDA-UI01b` must not change their domain,
data, mutation, claim-pack, or commercial semantics.

The premium register covers only the selected-intent confirmation and existing
`details` state in this slice. The ordinary `category` state reached by missing or
invalid intent, no-JavaScript fallback, `Ndrysho`, or back-navigation remains a
visible legacy seam. `preview` and `complete` also remain visible legacy seams and an
owned residual for a later fresh gate. This slice must not hide those seams or claim
a complete Free Start redesign.

## Copy and trust contract

- Direct-address, second-person language continues from the hero.
- Do not promise response time, coverage, eligibility, compensation, representation,
  professional acceptance, medical conclusion, or legal outcome.
- `injury` is a navigation intent only; no medical detail is captured or inferred by
  the handoff.
- Emergency guidance stays visible and directs immediate danger to local emergency
  services.
- Privacy language states: the selection stays on this page and is not submitted or
  persisted until intake completion.
- Membership remains the paid commercial offer. IDA App is utility and IDA Card is
  proof; neither becomes the paid object.
- Final SQ/EN/SR/MK copy requires human linguistic and legal/commercial disposition.

## Anonymous and authenticated modes

- Settled anonymous UI V2 sessions receive the selected-intent handoff.
- Settled authenticated members continue to the existing member mode and must not
  receive public acquisition or preselection behavior.
- If a pending session is treated as public and the visitor selects an intent before
  that session settles as authenticated, settlement clears the one-shot intent before
  member mode renders. No preselection may cross that transition.
- UI V1 retains the real anchor fallback; DG06 does not widen into V1 runtime/session
  restructuring.
- Pending-session acquisition flash remains a disclosed baseline; this slice closes
  only the risk of selected-intent state surviving an authenticated settlement.

## Responsive and accessibility contract

- Design and test at `320`, `375`, `390`, `768`, `1024`, and `1440` CSS pixels plus
  `844x390` landscape.
- Verify SQ, EN, SR, and MK with the longest natural Cyrillic and Albanian labels.
- Body and form copy is at least 16 CSS pixels on mobile; labels and primary actions
  remain comfortably readable at 200% zoom.
- Every target is at least 44 by 44 CSS pixels; primary journey rows target 64–72px
  where space permits.
- DOM order equals visual order; one stable-ID, programmatically focusable `h2` names
  the `section[aria-labelledby]` intake landmark and the current task uses the next
  logical `h3` heading.
- Selected intent is expressed in text, not color alone.
- Visible focus, keyboard order, error focus, screen-reader names, reduced motion,
  200% zoom reflow, and no horizontal overflow are mandatory.
- Normal text meets WCAG AA 4.5:1; large text, focus indicators, and component
  boundaries meet at least 3:1 against their actual backgrounds.
- No automatic focus move for pointer users; keyboard/screen-reader focus behavior
  must be deliberate and tested.

## Presentation and modularity boundary

The implementation must not append more responsibility to the 146-line
`public-entry-actions.tsx` or the legacy oversized `free-start-intake-shell/index.tsx`,
`main-panel.tsx`, `sidebar.tsx`, or `helpers.ts`. `PublicSituationActions` is extracted
to a new focused file under 150 lines before callback responsibility is added.
One-shot handoff ownership lives in a focused route-local hook/helper; the intake
remains the only category source of truth. `home-page-runtime.tsx` remains under 150
lines, and every touched grandfathered intake file becomes smaller. The selected-
intent component/state helper must be independently testable.

Candidate file boundary after test-first discovery:

- `apps/web/src/app/[locale]/components/home/home-page-runtime.tsx`;
- `apps/web/src/app/[locale]/components/home/hero-section.tsx`;
- `apps/web/src/app/[locale]/components/home/public-entry-actions.tsx`;
- focused files under `free-start-intake-shell/` for intent state and the new
  selected-intent/first-task presentation;
- `apps/web/src/lib/public-membership-entry.ts` only if an allowlisted in-memory
  category type/helper is required, never to encode intent into the URL;
- SQ/EN/SR/MK `hero.json` or `freeStart.json` keys limited to this journey;
- focused unit/message tests and one public-entry browser spec.

If the implementation requires a broader shell, shared-token, page, route, or state
refactor, it stops and returns to current authority.

## Test-first and evidence plan

### Red tests before implementation

1. Vehicle, injury, and property rows pass distinct allowlisted intent while keeping
   the same real anchor fallback.
2. Selected intent opens the existing relevant detail state and renders localized
   confirmation plus `Ndrysho`.
3. Missing/invalid intent renders ordinary category selection.
4. Choosing a different category clears incompatible issue selection while
   preserving safe compatible draft fields.
5. Hero selection causes no server action, completion analytics event, or storage
   write; produces no click-caused analytics/provider/network call, cookie, web-
   storage, log, or telemetry delta; and places no selected-intent token in an
   outbound URL, query, fragment, request payload, telemetry payload, or log. The
   fragment may become the shared intent-neutral `#free-start-intake` anchor.
6. Authenticated member mode never receives public selected-intent behavior.
7. A pending/public selection followed by authenticated settlement clears the event
   and renders member mode without preselection.
8. Consumption, `Ndrysho`, and same-row reselection obey the one-shot lifecycle and
   never create mirrored category state.
9. SQ/EN/SR/MK key parity and non-empty copy pass.

### Browser evidence

- Chrome desktop at 1440 and 200% zoom;
- Chrome mobile emulation at 320, 375, and 390;
- automated layout assertions at 768, 1024, and `844x390` landscape, while durable
  comparison screenshots remain limited to 375, 390, and 1440;
- keyboard-only row activation and one-time heading focus; pointer/touch activation
  with no programmatic focus; `Ndrysho`/back recovery to the category heading; and
  validation-error recovery;
- no horizontal overflow across the full width matrix and longest locale;
- measured contrast and reduced-motion proof;
- an actual `javaScriptEnabled: false` direct-anchor run proving the
  `#free-start-intake` fallback and ordinary category state;
- headed 200% browser-zoom proof plus selected-state and disclosed-seam screenshots;
- public selected-intent path plus settled-member no-regression path.

Focused implementation proof includes `pnpm check:modularity-guard` before the
mandatory Phase C `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate` gates.

Screenshots are review evidence only when compared at the same viewport against the
approved premium baseline. Screenshots alone do not prove interaction, accessibility,
or behavior.

## Explicit exclusions

- `apps/web/src/proxy.ts`, routes, route names, redirects, middleware, auth/session,
  tenancy, host resolution, and role access.
- Database, schema, RLS, migration, domain writes, Free Start server-action payload,
  claim-pack semantics, billing, Paddle, pricing, production aliases, or deployment.
- URL/query/cookie/storage persistence of selected intent.
- New analytics events or changing completion-event payloads.
- Medical detail, injury categorization, diagnosis, eligibility, coverage, merits,
  compensation, or legal-outcome logic.
- German localization, flight activation, below-fold homepage redesign, shared
  tokens, page shell, service map, membership-value section, footer/trust redesign,
  campaigns, or dashboard implementation.
- Concurrent member, agent, staff, or admin redesign.

## Stop conditions

Return to design/current authority if the slice would require:

- a protected or excluded surface;
- a new route or persisted intent;
- mutation before explicit intake completion;
- medical/special-category data treatment beyond the existing approved boundary;
- unsupported copy or an unreviewed locale;
- expansion beyond the selected-intent and first-task presentation;
- a new generic card system or a parallel UI architecture;
- current-program/current-tracker changes before the gate is explicitly approved.

## Reviewer questions

Bounded reviewers must answer only these questions:

1. Does the handoff feel like one reassuring conversation rather than a second form?
2. Is in-memory intent with a real anchor fallback the safest usable mechanism?
3. Does the selected-intent confirmation reduce uncertainty without implying that
   Interdomestik accepted, covered, or evaluated the case?
4. Is the first task focused enough on mobile and at 200% zoom?
5. Does any element regress into classic SaaS card/dashboard language?
6. Is the proposed implementation boundary small and testable without protected
   architecture changes?

### Fable 5 bounded review

Claude Fable 5 ran with high effort and read-only file access. Verdict: **ACCEPT WITH
CONDITIONS**. It found one blocking contradiction between the real anchor fallback
and a red test that prohibited all fragment changes, plus three important clarity
gaps: the meaning of provider state, deterministic pointer-versus-keyboard focus,
and disclosure of the downstream legacy visual seam. All four conditions are closed
in this draft. Its optional viewport, heading-level, and no-modal clarifications are
also adopted without widening scope.

### Codex Sol Ultra bounded review

Codex Sol Ultra ran at ultra reasoning with read-only repository access. Initial
verdict: **REVISE**. It confirmed the route-local handoff and protected-surface
boundary are viable, while identifying five bounded drafting gaps: pending-session
cleanup, mapping the first task to the actual `details` state, deterministic focus
and `Ndrysho` recovery, stronger no-egress proof, and explicit extraction/state
ownership. This revision adopts each correction without adding a route, state,
provider, protected surface, second slice, or broader Free Start redesign. No
reviewer found an AI OS/repository-authority conflict.

The same Codex Sol Ultra route then ran a read-only post-remediation check against
the revised gate and the four named runtime seams. Final verdict: **ACCEPT**, with
no remaining blocker or important finding. The reviewer explicitly confirmed that
all five prior gaps are now closed and did not infer runtime promotion.

## Gate state

**Accepted and canonically promoted.** Arben approved this gate with the exact
instruction, “Miratoj IDA-DG06 dhe promovimin e vetëm të IDA-UI01b.” The matching
canonical program/tracker promotion selects only `IDA-UI01b`. Test-first runtime
work begins only after the worktree-scoped resolver confirms it as the sole active
slice.
