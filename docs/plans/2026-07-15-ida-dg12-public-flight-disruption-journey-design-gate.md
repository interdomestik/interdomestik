---
title: IDA-DG12 Public Flight Disruption Journey Design Gate
date: 2026-07-15
status: complete
authority: current_authority
runtime_authorized: true
promoted_slice: IDA-UI01f
risk_tier: 3
owner: platform + product + design + legal + privacy + qa
---

# IDA-DG12 Public Flight Disruption Journey Design Gate

## Promotion decision

Promote one Tier 3 slice: `IDA-UI01f`, an anonymous, client-only flight-disruption
orientation journey opened from the existing flight row in the public hero. No runtime
starts until this gate is merged and the worktree-scoped resolver returns exactly
`IDA-UI01f` as the sole active slice.

This promotion activates free orientation, not flight-claim handling. The canonical
commercial matrix still marks flight delay as later phase, and Free Start accepts only
vehicle, property and injury. `IDA-UI01f` therefore must not submit, preselect or imply a
flight claim, membership benefit, success-fee lane, representation or compensation
service.

`IDA-UI01b` remains frozen. German, channel landing pages, flight commercial activation
and every protected surface remain unpromoted.

## User and trust outcome

A traveller facing disruption should quickly know what to do now, which official party
to contact first and what to preserve without having to understand airline terminology.
The journey should reduce panic at the airport and remain useful after travel.

Interdomestik earns trust through a free, honest result. This slice does not convert the
traveller into a flight claim because the repository does not authorize that product.
Any later commercial flight lane requires separate product, legal, fee, data and current-
authority decisions.

## Exact journey

1. Replace the non-interactive `Së shpejti` treatment with a real flight-orientation
   action. With JavaScript, activation emits one route-local `flight` intent and focuses
   the journey. Without JavaScript, its ordinary anchor opens a localized static flight
   checklist and scope notice; it must not fall into the three-category Free Start form.
2. Ask: “A jeni ende në aeroport ose duke u përpjekur ta vazhdoni udhëtimin?” Answers:
   `Po`, `Jo`, `Nuk jam i sigurt`.
3. `Po` and `Nuk jam i sigurt` immediately show an inline priority note before the next
   question: check the operating airline's official app/display/desk; ask what assistance
   and written options are available. If the airline cannot or will not assist, document
   what was requested and keep itemized receipts for necessary, reasonable arrangements
   made by the traveller. A medical or safety emergency always routes to airport/local
   emergency assistance first.
4. Ask what happened: delay; cancellation or significant schedule change; denied boarding or
   overbooking; missed connection or diversion; delayed/lost/damaged baggage; required
   disability or reduced-mobility assistance was not respected; other or unsure.
5. For a missed connection, ask whether all affected flights were on one reservation:
   `Po`, `Jo`, `Nuk jam i sigurt`. The answer changes only the checklist wording and
   never decides rights or eligibility.
6. For baggage, ask whether the traveller has reported it to the airline or airport and
   received a report/reference such as a PIR: `Po`, `Jo`, `Nuk jam i sigurt`. `Jo` and
   uncertainty prioritize prompt reporting and checking the carrier's official deadline.
7. For every other disruption, ask whether the operating airline has supplied a written
   notice, reason or choice: `Po`, `Jo`, `Nuk jam i sigurt`. `Jo` and uncertainty add a
   request-for-writing step but do not characterize the cause. This question does not
   apply to the disability or reduced-mobility branch, which shows the health-and-safety-
   first result immediately.
8. Show one free result tailored only by current/travel-complete state, disruption type
   and the applicable conditional answer. It provides actions and evidence before any
   boundary note.
9. The result links to the official Your Europe air-passenger-rights page as neutral
   further reading and states that the operating airline should normally be contacted
   first. It does not link to or rank claim agencies.
10. The result states clearly that Interdomestik flight-claim handling is not active in
    the current offer and that no case or data was created. There is no sales, membership,
    intake, upload, WhatsApp, phone or compensation CTA in this slice.

## Free result contract

The result must be concise, calm and action-first. It must:

- distinguish “help while still travelling” from “prepare a written follow-up”;
- identify the operating airline's official channel as the first path and distinguish it
  from a ticket seller, travel agency or claim agency without deciding responsibility;
- suggest saving the booking confirmation, boarding passes, airline messages, actual
  departure/arrival information, written reason or notice, offered choices and itemized
  receipts when available;
- for delay/cancellation/denied boarding/diversion, ask for written assistance,
  re-routing/refund choices or rights information without choosing an option for the user;
- for a missed connection, preserve both flight records and the single-reservation fact;
  separate tickets receive cautious wording and no automatic-rights conclusion;
- for baggage, prioritize prompt official reporting, the baggage tag and the PIR/report
  reference, then receipts and an item list; warn that relevant official deadlines can be
  short and time-sensitive and that the traveller should act promptly;
- for disability or reduced-mobility assistance, prioritize the airline/airport
  assistance desk and local emergency help when health or safety is at risk;
- explain that compensation, reimbursement and care are different questions and that
  one may exist without the others;
- tell a traveller to contact the operating airline first and, if unresolved, consult the
  official passenger-rights or appropriate enforcement/consumer route;
- include a neutral diaspora/cross-border note: route, operating carrier, booking and
  applicable rules require separate verification, regardless of citizenship or passport;
- identify the July 2026 EU passenger-rights reform as future-applying rather than use its
  not-yet-applicable procedures or deadlines.

The result must not decide eligibility, compensation amount, extraordinary circumstances,
fault, liability, applicable law, forum, limitation, reimbursement, re-routing choice,
booking responsibility, passenger status or whether a flight was legally cancelled.

## Legal transition boundary

The Council announced final clearance of revised EU air-passenger rules on 13 July 2026,
but states that the update enters into force only after Official Journal publication and
applies after the stated transition period. `IDA-UI01f` must not operationalize those
future procedures, response periods, rerouting caps or new rights.

The current UI therefore shows no euro amount, delay-hour eligibility threshold, fixed
claim deadline or “you qualify” statement. It may say that rights can depend on the route,
operating carrier, timing, booking structure and cause, and direct the traveller to the
current official source. Any future rule-engine or fixed entitlement copy requires fresh
legal evidence and separate authority.

## Data, privacy and trust contract

- Journey state exists only in component memory for the current render.
- No local/session storage, cookie, URL/query value, history state, analytics event,
  provider state, server action, fetch or network request may receive an answer.
- Do not ask for name, contact, booking reference, flight number, exact airport, route,
  date/time, airline, citizenship, passport, address, disability/diagnosis detail,
  expense amount, narrative, document, photograph or free text.
- The conditional answers are discarded on reset, locale change, navigation or fresh
  hero activation.
- No journey answer crosses into Free Start, claims, CRM, support or membership.
- Existing downstream intake, analytics, route and action behavior is unchanged.
- Copy must not claim availability, representation, claim submission, eligibility,
  response time, reimbursement, recovery, success rate or guaranteed outcome.

## JavaScript, failure and reset

With JavaScript disabled, the flight action opens a server-rendered localized static
checklist covering airline-first contact, written notices/options, receipts, baggage
reporting, urgent assistance and the inactive flight-service boundary. The static block
does not collect data and does not expose a flight intake.

The static checklist is an in-page server-rendered section in the existing home-page
structure, reached by the flight action's anchor fragment. No route or page is added.

Changing hero intent or an in-journey reset clears every answer and returns focus to the
first flight question. Locale navigation and browser back/forward must not restore
answers. Unknown states receive the generic cautious result. A provider, translation or
official-link failure must not turn into an eligibility conclusion.

## Accessibility, responsive and localization contract

- Equivalent SQ/EN/SR/MK keys and decision meaning; human copy review before merge.
- One visible question heading, real links/buttons, deterministic keyboard order, visible
  focus and focused/announced stage heading after transitions.
- Minimum 44×44 CSS-pixel targets, minimum 16-pixel control text and no color-only meaning.
- No horizontal overflow or clipped/overlapped controls at 320/360/375/390/430 CSS px,
  landscape and 200% zoom; long Serbian/Macedonian copy wraps naturally.
- Reduced-motion, forced-colors and expanded text-spacing behavior remains usable.
- The “still travelling” priority note precedes controls, while health/safety risk always
  precedes airline, evidence and scope copy.
- The external official link has a clear accessible name and does not rely on a new-tab
  icon to communicate its behavior.
- If the official link opens in a new browsing context, its accessible name states that
  behavior in text rather than only through an icon.

## Test-first implementation boundary

Expected narrow files, refined only to respect the 150-line rule:

- `apps/web/src/app/[locale]/components/home/public-entry-intent.ts`
- `apps/web/src/app/[locale]/components/home/public-situation-actions.tsx` through a new
  extracted flight action
- `apps/web/src/app/[locale]/components/home/free-start-intake-shell.tsx`
- new focused `flight-disruption-journey*.tsx` and no-JavaScript guidance components
- focused unit/contract tests and existing public-entry E2E specs
- localized message files for `sq`, `en`, `sr`, `mk`

No new file may exceed 150 lines. Shared vehicle/injury/property behavior must remain
unchanged. No route, intake, analytics, shared-token or page-layout refactor.

Tests are written failing first and prove:

1. one-shot flight intent, focus transfer and deterministic reset;
2. still-travelling priority guidance and medical/safety-first wording;
3. all seven disruption branches and generic unsure handling;
4. single-reservation conditional only for missed connections;
5. PIR/report conditional only for baggage;
6. written-notice conditional for the remaining branches;
7. action/evidence ordering, airline-first route and diaspora note;
8. no eligibility, amount, cause, law, deadline, claim-handling or representation result;
9. no identity/booking/route/health/expense/free-text/upload prompts and no answer egress;
10. no Free Start, membership, phone, WhatsApp or commercial handoff;
11. SQ/EN/SR/MK parity and useful static JavaScript-off guidance;
12. keyboard/focus/screen-reader, 44px targets, 320px and wider mobile,
    landscape/200% zoom/text spacing;
13. Chromium plus proportionate Firefox/WebKit evidence and prior-journey regression.

## Core copy review contract

Human linguistic corrections may improve naturalness without changing the decision
meaning. These SQ strings define the product intent; all four locales must remain
equivalent:

| Meaning                   | SQ core copy                                                                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First question            | A jeni ende në aeroport ose duke u përpjekur ta vazhdoni udhëtimin?                                                                                                                                                                                                    |
| Disruption question       | Çfarë problemi patët me fluturimin ose bagazhin?                                                                                                                                                                                                                       |
| Still-travelling priority | Kontrolloni kanalin zyrtar të kompanisë që e operon fluturimin dhe kërkoni opsionet me shkrim. Nëse kompania nuk mund ose nuk pranon t'ju ndihmojë, shënoni çfarë kërkuat dhe ruani faturat e detajuara për shpenzimet e nevojshme dhe të arsyeshme që i mbuloni vetë. |
| Evidence heading          | Ruani gjurmët e udhëtimit                                                                                                                                                                                                                                              |
| Official action           | Shikoni të drejtat zyrtare të pasagjerëve                                                                                                                                                                                                                              |
| Scope boundary            | Ky orientim është falas. Shërbimi i Interdomestik për ndjekjen e kërkesave të fluturimit nuk është aktiv në ofertën aktuale dhe këtu nuk u krijua asnjë rast.                                                                                                          |

## Mandatory verification and evidence

- focused unit/contract and host-matrix E2E proof;
- real JavaScript-on/off browser evidence;
- 360/390 mobile, landscape, text-spacing and 200% zoom inspection;
- `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`;
- current-head CI, Sonar, security, reviewer and unresolved-thread evidence;
- no Vercel deployment or production alias change.

## Advisory, operator and commercial-research disposition

AI OS refresh `d6bc26f00f3877bd609c214a2e70c2f808491050368c84cedfdba4981003b8ba`
and state observation `b0ef198056b77cd6d4ed6cb45bdcc9ee99524fefd5f5971e57020135738f07cf`
align with repo authority: `activeSlice=none`, runtime not authorized. Brain remains
stale and integrity reports drift, so Brain retrieval is not used as authority.

The worktree-scoped resolver returns `blocked_requires_current_authority` and
`activeSlice=null` before this candidate promotion. The repo-scoped
`interdomestik_qa` and Playwright MCP tools are not exposed in this runtime inventory;
read-only repository inspection and later local browser fallback must record that exact
tooling blocker.

Current official/operator research supports a short “what happened → what to do now →
what to preserve” model. Your Europe starts with the disruption type, directs complaints
to the operating airline first and separates care, rerouting/refund and compensation.
Lufthansa, Ryanair and easyJet prioritize live status, official self-service, rebooking or
refund choices, care and receipts. Airline baggage flows prioritize prompt reporting and
a PIR/reference. These patterns are adopted without importing any operator promise.

Commercial claim-agency patterns emphasize instant eligibility and compensation amounts,
but the Commission says travellers should contact the operating carrier first and that
claim agencies must disclose prices and authority. Those conversion patterns are rejected
for this slice because flight handling, fee, power-of-attorney and data authority do not
exist in the current repository contract.

The first bounded Claude Sonnet 4.6 route completed but its wrapper did not pass the
document through stdin; Claude explicitly reported that it could not read the gate. That
attempt is recorded as an input-contract blocker, not review evidence or approval. The
inline retry completed in `162876 ms` and returned `ACCEPT WITH CONDITIONS`. Its four
promotion conditions are reconciled here: the still-travelling note now preserves the
traveller's ability to make and document necessary reasonable arrangements when the
airline does not assist; the journey uses neutral “significant schedule change” wording;
320 CSS pixels is mandatory; and the no-JavaScript target is explicitly an existing-page
section, not a new route. Its useful reduced-mobility and new-context link clarifications
are also binding. The gate already required the July 2026 reform to be described as future-
applying in the free-result contract. Its suggestion to state that baggage deadlines are
universally short was narrowed to “relevant official deadlines can be short and time-
sensitive,” because this journey does not collect route or governing-rule facts and must
not universalize one regime.

## Protected exclusions and stop conditions

Do not change `apps/web/src/proxy.ts`, routes, auth/session, tenancy, database/schema/RLS,
billing/Paddle, claim/CRM writers, upload/storage, analytics/provider semantics,
dashboards, commercial coverage or pricing contracts, production aliases/deploy, README,
AGENTS or architecture authority.

Stop and return to current authority if implementation requires a flight claim category,
durable journey data, identity/booking/route/health data, a new route/API/server action,
an eligibility or compensation engine, flight-status integration, a carrier directory,
claim-agency referral, fee/POA authority, altering downstream submission, or any protected
surface.

## Rollback

Restore the non-interactive flight row and remove the flight intent, dynamic journey,
localized static no-JavaScript guidance and message keys. No migration, data cleanup,
route rollback or downstream correction is required because the slice owns no durable
state and creates no case.

## Sources

- [Your Europe — air passenger rights](https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm)
- [European Commission — air passenger-rights legislation and guidance](https://transport.ec.europa.eu/transport-themes/passenger-rights/air_en)
- [EU national enforcement bodies](https://transport.ec.europa.eu/transport-themes/passenger-rights/national-enforcement-bodies-neb_en)
- [Council — final clearance and application timing, 13 July 2026](https://www.consilium.europa.eu/en/press/press-releases/2026/07/13/council-gives-final-clearance-for-stronger-air-passenger-rights/)
- [European Commission — claim-agency consumer guidance](https://transport.ec.europa.eu/news-events/news/air-passenger-rights-commission-gives-guidance-consumers-role-claim-agencies-2017-03-16_en)
- [Lufthansa — flight disruptions](https://www.lufthansa.com/us/en/flight-disruptions)
- [Lufthansa — baggage irregularities](https://www.lufthansa.com/us/en/baggage-irregularities.html)
- [Ryanair — cancelled, delayed and rescheduled flights](https://help.ryanair.com/hc/en-us/categories/12488242270609-Cancelled-Delayed-and-Rescheduled-Flights)
- [Ryanair — EU261 disruption information](https://help.ryanair.com/hc/en-ie/articles/12892228445201-EU261-Flight-Disruption-Information)
- [easyJet — delays and cancellations](https://www.easyjet.com/en/help/boarding-and-flying/delays-and-cancellations)
