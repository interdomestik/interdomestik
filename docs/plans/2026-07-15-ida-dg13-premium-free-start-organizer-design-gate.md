---
title: IDA-DG13 Premium Free Start Organizer Design Gate
date: 2026-07-15
status: complete
authority: current_authority
runtime_authorized: true
promoted_slice: IDA-UI02a
risk_tier: 2
owner: platform + product + design + privacy + qa
---

# IDA-DG13 Premium Free Start Organizer Design Gate

## Promotion decision

Promote exactly one Tier 2 slice: `IDA-UI02a`, a presentation-only redesign of
the existing public Free Start organizer after completion of the vehicle, injury,
property and flight orientation tree. Arben explicitly approved `IDA-DG13` and
the sole promotion of `IDA-UI02a` on 2026-07-15.

Runtime work may start only when the worktree-scoped resolver returns exactly
`IDA-UI02a`. `IDA-UI01b` remains frozen and is not implicitly resumed. This gate
uses the current merged implementation as its baseline and does not import or
overwrite preserved branch-local work from `IDA-UI01b`.

## User and commercial outcome

After receiving useful free orientation, a visitor choosing vehicle, injury or
property should continue into a calm, coherent organizer without falling back to
the legacy dark SaaS composition. The organizer helps the visitor state the issue,
date, counterparty, desired outcome and short summary once, review the result and
create the already-existing temporary claim-pack summary.

Interdomestik gains a clearer qualified-intent moment without implying that a
claim, membership, representation agreement or durable record has been created.
The useful result comes before any later commercial or account decision.

## Locked experience direction

- Continue the approved help-first visual language: warm ivory, midnight navy,
  measured teal, restrained linework and generous spacing.
- Use editorial serif only for a short human reassurance or question; use a
  highly legible sans-serif for fields, actions and explanatory copy.
- Present one clear task at a time and one primary action per state.
- Replace the dark shell, cyan glow, confidence badge, generic card grid and
  classic SaaS stepper treatment on this path.
- Use direct language: organize the case facts, review the summary and create a
  temporary pack. Do not describe the task as training or practical guidance.
- Do not add illustration, gradients, glassmorphism, trauma imagery, fake proof,
  urgency pressure, guarantee language or decorative dashboard cards.

## Exact state contract

The existing behavior contract remains four states:

1. `category`: direct visits and JavaScript-off fallback can choose vehicle,
   injury or property.
2. `details`: a category handed off from a completed safety journey opens here;
   the category is acknowledged and can be changed.
3. `preview`: the visitor reviews the existing category, issue type, incident
   date, counterparty, desired outcome and short summary.
4. `complete`: the existing temporary claim-pack result is shown with an honest
   statement that no case or durable saved draft was created.

No new workflow state, category, field, issue, outcome or server behavior is
authorized. Flight remains outside Free Start because commercial flight handling
is inactive.

## Data and trust boundary

- Existing field values remain route-local React state until the visitor chooses
  the existing completion action.
- The existing `submitFreeStartIntake` validation and claim-pack generation
  behavior is preserved exactly; this slice adds no writer or persistence.
- Completion must say that the result is temporary, no case was opened and the
  information is not saved for later return.
- Copy must not say `save`, `saved`, `submitted claim`, `case created`,
  `representing you`, `we will contact you`, guaranteed outcome or equivalent.
- Do not add local/session storage, cookies, URL/query/history state, new analytics,
  uploads, document collection, identity/contact fields or third-party egress.
- Injury remains a category label only. Do not add health condition, diagnosis,
  treatment detail or special-category-data fields.
- A later durable-save slice requires a separate Tier 3 privacy/data gate covering
  ownership, authentication or recovery token, tenant scope, consent, encryption,
  retention, deletion, audit and health-data exclusions.

## Functional preservation

- Preserve the existing allowlisted category handoff from vehicle, injury and
  property journeys.
- Preserve direct fragment navigation and the ordinary category fallback.
- Preserve validation, idempotency, rate limiting, funnel completion analytics,
  claim-pack generation and existing continuation destinations without changing
  their contracts or payloads.
- Preserve selected values when moving details → preview → details.
- Changing category clears only the existing issue-type field as today.
- Loading, validation and server-error states remain deterministic and accessible.
- Existing authenticated-member continuation precedence remains unchanged.

## Test-first implementation boundary

Expected presentation-only files, refined to respect the 150-line rule:

- `apps/web/src/app/[locale]/components/home/free-start-intake-shell/index.tsx`
- focused components under `free-start-intake-shell/**`
- `apps/web/src/messages/{sq,en,sr,mk}/freeStart.json`
- focused unit, translation and existing public-entry E2E tests

Grandfathered files above 150 lines that are touched must be decomposed. No new
production file may exceed 150 lines.

Tests must be written failing first and prove:

1. category handoff opens the correct details state without asking twice;
2. direct-entry category fallback remains available;
3. all existing fields, issue choices, outcomes and validation remain unchanged;
4. preview faithfully displays the entered values and supports correction;
5. completion renders the existing claim pack and explicit no-save/no-case copy;
6. no persistence, upload, identity, contact or new network contract is introduced;
7. SQ/EN/SR/MK key parity and equivalent trust meaning;
8. keyboard order, focus/error announcement, visible focus and 44px targets;
9. 320/360/375/390/430px, landscape, 200% zoom and expanded text spacing;
10. useful JavaScript-off category fallback and JavaScript-on regression proof;
11. Chromium plus proportionate Firefox/WebKit evidence;
12. prior vehicle, injury, property and flight journeys remain unchanged.

## Core Albanian copy intent

Human copy review may improve naturalness without changing these meanings:

| Meaning           | SQ intent                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Eyebrow           | `ORGANIZONI RASTIN`                                                                        |
| Heading           | `Mblidhni faktet kryesore në një vend.`                                                    |
| Reassurance       | `Nuk duhet ta mbani gjithë situatën në mendje. Plotësoni vetëm atë që dini tani.`          |
| Selected category | `Po vazhdoni për:`                                                                         |
| Preview action    | `Shikoni përmbledhjen`                                                                     |
| Finish action     | `Krijoni përmbledhjen time`                                                                |
| No-save boundary  | `Kjo përmbledhje është e përkohshme. Nuk është ruajtur dhe nuk është hapur ende një rast.` |

## Accessibility, responsive and localization contract

- Minimum 16px field/control text and 44×44 CSS-pixel interactive targets.
- Every field has a persistent visible label; placeholders are examples only.
- Validation errors use `role=alert`, receive focus once and identify the missing
  work without color-only meaning.
- One visible state heading, deterministic keyboard order and clearly visible
  focus in normal and forced-colors modes.
- No horizontal overflow, clipped labels or overlapping controls at the required
  mobile widths, landscape or 200% zoom.
- Long Serbian/Macedonian strings wrap without shrinking below readable size.
- Reduced-motion and expanded text spacing remain usable.
- SQ/EN/SR/MK keys remain complete and equivalent; German is a separate candidate.

## Explicit exclusions

- `apps/web/src/proxy.ts`, routes, auth/session, tenancy and providers;
- database, schema, RLS, migrations, durable drafts or case creation;
- server-action, rate-limit, idempotency, analytics or claim-pack contract changes;
- billing, Paddle, pricing, fees or membership entitlement changes;
- flight intake or commercial flight activation;
- German, sales-channel landing pages and attribution;
- member, agent, staff or admin dashboard redesign;
- deployment, Vercel and production aliases;
- resumption, reset, cleanup or overwrite of `IDA-UI01b`.

## Mandatory verification

- focused unit and translation contract tests;
- focused host-matrix E2E for selected-category handoff and direct fallback;
- real JavaScript-on/off browser evidence;
- mobile, landscape, 200% zoom, text-spacing and accessibility inspection;
- Chromium, Firefox and WebKit where locally available;
- `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`;
- current-head CI, security, Sonar/reviewer and unresolved-thread disposition;
- no Vercel deployment or production alias change.

## AI OS, repo authority and reviewer disposition

AI OS refresh `eda94105089da9d27e9cc78d071883f8eb3fc3a6993418d16064510e0eb1c304`
and state observation `c66360071024892cf050a9acd392f1e4d1817d0a9f101ba246b2740ac875a9c8`
report Interdomestik authority current, no active slice and runtime not authorized
before this promotion. Brain remains stale and integrity reports drift; neither
condition changes product authority.

The canonical repo was clean and synced at `871b8cf3e` before promotion. The
worktree-scoped resolver returned `blocked_requires_current_authority` and
`activeSlice=null`, as expected before this gate. Repo authority and AI OS do not
conflict.

The repo-scoped `interdomestik_qa`, Playwright MCP and named Fable/Claude provider
surfaces are not exposed in this runtime inventory. The implementation may use the
repository and local Playwright fallbacks, but must record the exact tooling blocker
and obtain a bounded independent current-head review through an actually available
route before merge. It must not wait indefinitely on an unavailable provider.

## Stop conditions

Stop and return to a fresh gate if implementation requires any excluded surface,
new data field, durable storage, identity/contact capture, upload, category, route,
commercial promise, analytics semantics or server contract. Stop on resolver drift,
unexplained protected-file changes, failing privacy/security gates or a real browser
regression that cannot be corrected inside this presentation boundary.
