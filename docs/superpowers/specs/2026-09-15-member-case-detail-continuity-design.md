# Member Case Detail Continuity Design

Date: 2026-09-15  
Status: owner-approved design; implementation pending  
Base: `06d90f570d8757764a9fac8124ee924bd3b8aa1f`  
Owner: Sol/high  
Final review: fresh independent Astra/high

## Outcome

Continue the case-first member workspace into the mounted member claim detail page. A member who
opens a case can identify it, understand recorded progress, distinguish progress from the next
action, move directly among existing evidence, public history and messaging, and return to the
member case workspace.

The owner approved Option A, confidence-first continuity. This is a presentation and native-
navigation slice over established contracts, not a new dashboard or case workflow.

## Evidence and decisions

Checked 2026-09-15:

- [AirHelp contact and tracking](https://www.airhelp.com/en/contact-us/) publicly directs customers
  to one claim-status area and asks them to use the claim reference when contacting support. Adopt
  recognizable case identity and contextual support. Reject copied wording, branding and unverified
  authenticated behavior.
- [Allianz Claim Centre](https://www.allianz-assistance.co.uk/help-and-advice/claim-centre.html)
  publicly combines online submit/track with human support. Adopt visible digital continuity plus a
  human fallback. Reject its policy taxonomy and any timing promise.
- [WCAG 2.2 bypass blocks](https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html) names
  links to page areas, landmarks and section headings as efficient navigation techniques. Adopt a
  labelled list of native anchors and structural targets. Do not claim full WCAG conformance.
- [Next.js Link](https://nextjs.org/docs/app/api-reference/components/link) retains anchor semantics
  and hash navigation in the installed Next.js 16.3.3 stack. Use it without new client navigation
  state.

The #1776 Apple, Google and WCAG brief remains applicable: use readable hierarchy, selective
emphasis, solid content surfaces, visible focus and 320 CSS-pixel reflow. Broader loyalty, claims,
insurance and subscription signals were sent to the chief architect for later program choices;
they do not widen this slice.

## Mounted authority and validated gap

`apps/web/src/app/[locale]/(app)/member/claims/[id]/page.tsx` mounts
`MemberClaimDetailOpsPage`. `MemberClaimDetailV2Page` is not mounted and stays dormant.

The mounted page already provides the required progress summary, Case Companion next step, SLA and
trust status, recovery decision, matter allowance, case description, consent, document upload,
ordered public timeline and external-only messaging. It lacks:

1. a clear return to the case-first member workspace;
2. a labelled in-page path among progress, evidence, history and messages;
3. the approved case-first identity hierarchy from the member workspace.

On narrow screens, history currently follows the complete main column. The new anchors make every
section reachable without hiding or rebuilding content.

## Design

### Identity and return

Place a locale-aware native link to `/member` before the case heading. Present a localized case
context label, the existing title, exact ID and current status as one bounded header surface. Keep
upload and message actions available with their existing policies and behavior.

### Section navigation

Render a labelled `nav` containing a list of locale-aware native anchors in this order:

1. Progress
2. Evidence
3. History
4. Messages

Freeze the public fragments as `#member-claim-detail-progress`, `#member-claim-detail-evidence`,
`#member-claim-detail-history` and the existing `#member-claim-detail-messaging`. Progress targets a
structural wrapper that begins with the recorded progress card and includes the separate Case
Companion next-step card after it. Each target is a section or landmark named by its existing heading
through `aria-labelledby`, and carries a `scroll-mt-*` offset that keeps the target visible below the
shell. Links wrap or scroll safely at 320 CSS pixels and expose a visible focus indicator. They do
not activate tabs, hide content or store navigation state.

### Information hierarchy

Keep recorded progress before the existing Case Companion next step. This distinguishes “what has
happened” from “who acts next.” Preserve all existing cards and conditional rendering. History stays
a desktop supporting rail and remains reachable on narrow layouts. Evidence and messages stay in
the main reading column. Use the current Crystal palette and semantic tokens; reserve depth for the
header/navigation layer and keep reading cards solid.

### Human support

Retain the existing claim-context support link and member messaging. Do not add a chatbot, handler
identity, service promise or automated decision language. `MessagingPanel` remains
`allowInternal={false}`.

## Boundaries

In scope:

- the mounted member detail presentation;
- one mandatory cohesive extracted header/navigation component at
  `apps/web/src/features/member/claims/components/MemberClaimDetailHeader.tsx`, with focused tests at
  `apps/web/src/features/member/claims/components/MemberClaimDetailHeader.test.tsx`;
- four `claims.json` locale catalogs;
- focused component and mounted browser contracts;
- canonical program/tracker status and exact capacity metadata required by the bounded diff.

Out of scope:

- `apps/web/src/proxy.ts`, canonical route changes or redirects;
- auth/session, tenant/RLS, query, DTO, schema or database changes;
- document lifecycle, consent meaning, upload implementation or visibility changes;
- claim, recovery, money, legal or billing writers;
- T-411, new next-step logic, new timeline events, invented ETAs or missing-document requirements;
- membership pricing/onboarding redesign, deployment or broad UI token changes.

## Error and state behavior

The slice adds no data fetch or mutation. Existing not-found, auth redirect, action disabled state,
upload/consent behavior, messaging errors and empty timeline/document states remain authoritative.
Hash navigation degrades to ordinary document reading if enhanced navigation is unavailable. The
message action keeps the existing target-focus behavior. When `prefers-reduced-motion: reduce`
matches it uses `scrollIntoView({ behavior: 'auto', block: 'start' })`; otherwise it preserves the
existing smooth scroll. Native section links add no scripted animation.

## Test contract

Focused proof must cover:

- logical `/member` return destination through the locale-aware Link in unit proof, plus the rendered
  same-locale destination such as `/en/member` in mounted browser proof;
- labelled navigation with four descriptive anchors and exact matching target IDs
  `member-claim-detail-progress`, `member-claim-detail-evidence`,
  `member-claim-detail-history` and `member-claim-detail-messaging`;
- one visible progress summary and one Case Companion next step in that order;
- unchanged case ID, localized status, dates, timeline order, notes, SLA/trust/recovery/allowance data,
  case description and conditional rendering;
- both existing upload triggers and unchanged consent/document behavior;
- member messaging with `allowInternal={false}`, retained header message focus, smooth scrolling by
  default and `auto` scrolling under reduced motion;
- SQ/MK/EN/SR catalog parity and no new timing, outcome or document promise;
- native keyboard activation, visible focus, 320/390/768/1440 reflow, 200% text, long ID/labels, dark
  mode and reduced motion in the actual mounted page;
- affected unit, gate, golden and smoke expectations plus the browser-corpus fingerprint resolver if
  the E2E corpus changes.

Required final evidence remains one source/config/environment-matched `pnpm pr:verify`, separate
`pnpm security:guard`, protected current-head review and checks, expected-head merge and exact-main
health. The included E2E gate must not be rerun for identical inputs.

## Capacity and implementation planning

The existing `MemberClaimDetailOpsPage.tsx` is above the executable 300-line review boundary. It must
not grow. Extract `MemberClaimDetailHeader.tsx` and reduce the mounted page while preserving behavior.
The parent retains translation of tracking/status values, action derivation, the messaging ref and
the message callback; the extracted presentation receives the already-derived upload/message
actions and callbacks. Add focused tests in `MemberClaimDetailHeader.test.tsx` instead of expanding
the already large page test indiscriminately.

Before implementation, freeze the complete changed path set and exact bounded source, test,
message/config, documentation and capacity-metadata allowances. Count new files and the budget
self-change. Use no deleted-byte credit, reserve, guard relaxation or unrelated donor. If current
authority does not cover the exact figures, obtain one consolidated owner approval before product
edits. The implementation plan must name populated fixtures covering timeline, notes, SLA, recovery
and allowance plus an absent-condition fixture, and make progress-before-next-step and target-order
DOM assertions explicit. Do not treat the current golden spec's claim-absent skip as sufficient
proof.

## Review sequence

1. Freeze this design, public contract, base identity and forbidden scope.
2. Ask Claude Sonnet 5 for bounded header/navigation implementation advice.
3. Ask Gemini for disjoint counterexamples and test proposals.
4. Integrate only supported suggestions and run focused failure/success evidence.
5. Run a fresh independent Astra/high read-only final review.
6. Consolidate blocking corrections, freeze source/config/environment and run the final required
   proof once.
