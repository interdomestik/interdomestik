---
title: IDA-DG11 Public Property Safety Journey Design Gate
date: 2026-07-14
status: complete
authority: current_authority
runtime_authorized: true
promoted_slice: IDA-UI01e
risk_tier: 3
owner: platform + product + design + privacy + qa
---

# IDA-DG11 Public Property Safety Journey Design Gate

## Promotion decision

Promote one Tier 3 slice: `IDA-UI01e`, an anonymous, client-only property
safety and evidence-orientation journey opened from the existing `Kam dëm në pronë`
hero action. No runtime starts until this gate is merged and the worktree-scoped
resolver returns exactly `IDA-UI01e` as the sole active slice.

The risk tier is conservative because fire, smoke, gas, electricity, contaminated
water, structural instability and unsafe entry can create immediate danger even
though the proposed journey stores or transmits no answer.

`IDA-UI01b` remains frozen. Flight, German, channel landing pages and every protected
surface remain unpromoted.

## User and business outcome

A person facing property damage should first know whether to leave the area and seek
local help, then receive a short, useful list of safe actions and evidence without
having to understand insurance or legal terminology. Interdomestik earns trust by
giving the free result before offering a fresh property-data organization intake.

The commercial continuation is not a claim-coverage or recovery promise. It starts
the existing Free Start intake only after the person explicitly chooses it.

## Exact journey

1. The existing property hero link keeps its ordinary `#free-start-intake` fallback.
   With JavaScript available, activation emits one route-local `property` intent and
   moves focus to the existing Free Start region.
2. Ask: “A ka ende rrezik aktiv, ose nuk jeni të sigurt nëse prona është e sigurt për
   t’u përdorur?” Answers: `Po`, `Jo`, `Nuk jam i sigurt`.
3. `Po` and `Nuk jam i sigurt` show a fail-closed result before every other control:
   move away from danger; contact the appropriate local emergency, utility or
   qualified safety service; re-enter or restore utilities only when local experts
   say it is safe. The copy says “Nëse ndodheni në BE, mund të telefononi falas në
   112”; it makes no claim about `112` outside the EU. No sales CTA.
4. `Jo` asks what happened: water/leak/flood; fire/smoke; storm/natural event;
   theft/attempted theft/vandalism; product/appliance/equipment; other; unsure.
5. Ask separately whether the damage involves a neighbour, tenant or another person:
   `Po`, `Jo`, `Nuk jam i sigurt`. This fact may add a generic contact/evidence note;
   it never determines fault or liability.
6. Ask the person's role: owner, tenant, business user, acting for someone else with
   authority, or unsure. This is orientation context only and does not prove
   ownership, authority, policy status, liability or eligibility.
7. Ask the country where the property is located and the person's usual country of
   residence as distinct, ephemeral, user-confirmed values. Do not ask passport,
   citizenship, insurer country or a party identity.
8. Show one free result with safety-qualified actions and evidence. It includes the
   relevant contact path (insurer, landlord/property manager, police for theft or
   vandalism, or another responsible party) without claiming that any party must pay.
9. Only then show a new explicit action, “Organizo të dhënat e dëmit tim”, which
   starts the established Free Start intake with a fresh user-confirmed `property`
   category. No journey answer crosses the handoff. Explain that a new intake is
   starting and the user chooses what to submit.

## Free result contract

The result is concise and conditional. It must:

- put personal safety and prevention of further harm before evidence preservation;
- recommend photographs or video of affected areas and items only when safe;
- suggest an inventory of damaged or stolen items, dates, receipts, estimates,
  serial numbers and relevant messages when available;
- retain receipts for necessary emergency measures or temporary accommodation;
- suggest timely notice to the relevant insurer, landlord, property manager, police
  or responsible party according to the user's situation;
- for water, fire/smoke or product/equipment situations, mention the relevant utility,
  seller, manufacturer or qualified service only as a possible contact; never name a
  country-specific product-liability, recall, repair or utility regime;
- tell the user not to delay urgent safety work or keep contaminated/dangerous items
  merely to preserve evidence;
- distinguish temporary damage-limitation work from permanent repair, without
  requiring insurer approval or promising reimbursement;
- show a neutral cross-border/diaspora note whenever property and residence countries
  differ, for every country pair, while stating that country, policy and contract
  rules still require separate review and without assuming why the countries differ.

When role is `unsure` or the person is acting for someone else with authority, the
result presents insurer, property owner/manager and police as parallel possible
contacts and does not choose one or imply that authority has been proven. Result
branching on damage type, third-party involvement and role is permitted; country
values affect only the neutral cross-border note and generic contact framing.

The result must not decide coverage, causation, liability, ownership, authority,
repair method, compensation, limitation period, governing law or forum. It must not
say that Interdomestik handles the matter, represents the person or will recover money.

## Data, privacy and trust contract

- Journey state exists only in component memory for the current render.
- No local/session storage, cookie, URL/query value, history state, analytics event,
  provider state, server action, fetch or network request may receive an answer.
- Do not ask for name, contact, address, exact location, policy number, landlord or
  neighbour identity, ownership document, property value, damage value, narrative,
  photograph, document or free text.
- Country values and role/type answers are discarded on reset, locale change,
  navigation or a fresh hero activation.
- The handoff carries only a fresh user-confirmed `property` category.
- Existing downstream intake, action, privacy and analytics behavior is unchanged.
- Copy must not claim round-the-clock human availability, emergency dispatch, legal
  representation, eligibility, coverage, response time or guaranteed outcome.

## JavaScript, failure and reset

With JavaScript disabled, the server-rendered property category link and existing
Free Start fallback remain visible and usable. The dynamic tree is not duplicated on
the server. The existing server-rendered hero support panel remains visible and says
that a person in immediate danger must contact local emergency services before using
the intake. Changing hero intent or an in-journey reset clears every answer and
returns focus to the first property question. A locale navigation discards the
journey and returns through the ordinary localized page entry; back/forward browser
navigation must not restore answers.

Unsupported or missing translations fail through the existing locale contract.
Unknown type, role or country combinations receive the generic safe result, never an
invented rule. If safety becomes uncertain at any point, the copy returns priority to
local emergency or qualified services before organization or sales.

## Accessibility, responsive and localization contract

- Equivalent SQ/EN/SR/MK keys and decision meaning; human copy review before merge.
- One visible question heading, real buttons/links/selects, deterministic keyboard
  order, visible focus and focused/announced stage heading after transitions.
- Minimum 44×44 CSS-pixel targets, no color-only meaning and semantic status text.
- No horizontal overflow or clipped/overlapped controls at 360/375/390/430 CSS px,
  landscape and 200% zoom; long Serbian/Macedonian copy wraps naturally.
- Reduced-motion, forced-colors and text-spacing behavior remains usable.
- Urgent/unsure outcomes put safety before every control and omit commercial CTA.

## Test-first implementation boundary

Expected narrow files, refined only to respect the 150-line rule:

- `apps/web/src/app/[locale]/components/home/public-entry-intent.ts`
- `apps/web/src/app/[locale]/components/home/public-situation-actions.tsx` through an
  extracted property action so the existing file does not grow
- `apps/web/src/app/[locale]/components/home/free-start-intake-shell.tsx`
- new focused `property-safety-journey*.tsx` components beside the existing journeys
- focused unit/contract tests and existing public-entry E2E specs
- localized message files for `sq`, `en`, `sr`, `mk`

No new file may exceed 150 lines. No shared-token, route, intake or layout refactor.

Tests are written failing first and prove:

1. one-shot property intent, focus transfer and deterministic reset;
2. urgent/unsure fail-closed outcome with EU-qualified `112` and no sales CTA;
3. all damage-type and role branches, including generic unsure handling;
4. the separate third-party question without a fault or liability conclusion;
5. distinct property/residence countries and the all-pairs conditional diaspora note;
6. safety-qualified evidence, police/insurer/landlord/manager/utility/seller contact wording and no
   coverage, liability, ownership, repair or compensation conclusion;
7. no identity/address/policy/value/narrative/upload prompts and no answer egress;
8. fresh explicit `property` handoff only after the free result;
9. SQ/EN/SR/MK parity and the ordinary no-JavaScript fallback plus static safety note;
10. keyboard/focus/screen-reader, 44px targets, mobile/landscape/200% zoom/text spacing;
11. Chromium plus proportionate Firefox/WebKit evidence.

## Core copy review contract

The implementation may receive human linguistic corrections without changing the
decision meaning. These strings define the pre-promotion core contract:

| Meaning                | SQ                                                                                         | EN                                                                                      | SR                                                                                                   | MK                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| First safety question  | A ka ende rrezik aktiv, ose nuk jeni të sigurt nëse prona është e sigurt për t'u përdorur? | Is there still an active danger, or are you unsure whether the property is safe to use? | Da li i dalje postoji neposredna opasnost ili niste sigurni da li je imovina bezbedna za korišćenje? | Дали сè уште постои непосредна опасност или не сте сигурни дали имотот е безбеден за користење? |
| EU emergency qualifier | Nëse ndodheni në BE, mund të telefononi falas në 112.                                      | If you are in the EU, you can call 112 free of charge.                                  | Ako ste u EU, možete besplatno pozvati 112.                                                          | Ако сте во ЕУ, можете бесплатно да се јавите на 112.                                            |
| Fresh intake action    | Organizo të dhënat e dëmit tim                                                             | Organize my damage information                                                          | Organizujte podatke o mojoj šteti                                                                    | Организирајте ги податоците за мојата штета                                                     |

## Mandatory verification and evidence

- focused unit/contract and host-matrix E2E proof;
- real JavaScript-on/off browser evidence;
- 360/390 mobile, landscape, text-spacing and 200% zoom inspection;
- `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`;
- current-head CI, Sonar, security, reviewer and unresolved-thread evidence;
- no Vercel deployment or production alias change.

## Advisory and research disposition

AI OS refresh `bc7f7dd4acaec492270f950da30e9dbc13947d705e55897290ebd230a59518b5`
and state observation `13216d3eea9b772509a91cba7d31321dd50ca1726b7ab07817a2bff7e641806f`
align with repo authority: `activeSlice=none`, runtime not authorized. Brain remains
stale and integrity reports drift, so Brain retrieval is not used as authority.

The repo-scoped `interdomestik_qa` MCP is configured but is not exposed in this
runtime tool inventory; bounded repository inspection used read-only local commands.
The worktree-scoped resolver returns the expected `blocked_requires_current_authority`
and `activeSlice=null` before this candidate promotion.

Commercial operator and public-safety research supports the order without importing
provider promises: AXA asks what happened, damage/item lists, photographs, receipts
and police references; Allianz separates emergency response and requires a police
reference for theft; Aviva distinguishes unsafe emergencies from ordinary claims and
asks for photographs, receipts, quotes and policy context. GOV.UK puts safe re-entry
and qualified utility checks before flood documentation. These sources do not decide
Interdomestik coverage, law or response time.

Claude Sonnet 4.6 completed a bounded adversarial review in `75646 ms` and returned
`REVISE`. Its structural corrections were reconciled: third-party involvement is a
separate fact, every cross-border pair triggers neutral copy, unsure role has a
generic parallel-contact result, type/role branching is distinguished from forbidden
country-law logic, product/equipment wording is regime-neutral, core copy is fixed in
all four locales, and the existing static no-JavaScript emergency note is now an
explicit contract. The suggestion to assert `112` availability outside the EU was
rejected because the cited EU authority supports the EU qualifier only; the copy is
instead explicitly conditional on being in the EU. The suggestion to move role after
both countries was rejected because country values do not select law or eligibility,
while role is the fact that safely determines the generic contact path.

The bounded post-remediation Sonnet 4.6 review completed in `147730 ms` with no
residual blocker and `ACCEPT WITH CONDITIONS`. Its useful hardening point is now
binding: acting for someone else uses the same parallel-contact result as an unsure
role and never implies proven authority. Its only stated acceptance condition claimed
that the SQ core-copy table contained `faras`; repository inspection shows the cell
already contains the correct `falas`, matching the journey text, so no copy change was
required. The final gate therefore has no open review condition.

## Protected exclusions and stop conditions

Do not change `apps/web/src/proxy.ts`, routes, auth/session, tenancy, database/schema/
RLS, billing/Paddle, claim/CRM writers, upload/storage, analytics/provider semantics,
dashboards, production aliases/deploy, README, AGENTS or architecture authority.

Stop and return to current authority if implementation requires durable journey data,
an address or identity, file collection, a new route/API/server action, country-law or
coverage logic, altering the downstream submission contract, repair/vendor dispatch,
referral-fee authority, live insurer integration or any protected surface.

Result branching on damage type, third-party involvement and role is allowed.
Country values may only select the neutral cross-border note and may not apply
country-specific law, coverage, police, utility, product or limitation rules.

## Rollback

Remove the property intent/dynamic components and localization keys, restoring the
ordinary property category link. No migration, data cleanup or route rollback is
required because the slice owns no durable state.

## Sources

- [AXA UK — make a home insurance claim](https://www.axa.co.uk/home-insurance/existing-customers/make-a-claim/)
- [Allianz UK — make a home insurance claim](https://www.allianz.co.uk/insurance/home-insurance/existing-customers/claim.html)
- [Allianz UK — escape of water claims guide](https://www.allianz.co.uk/content/dam/onemarketing/azuk/allianzcouk/allianz-home-insurance/claim-guides/0042392-2025-Allianz%20Claims%20escape%20of%20water%20guide%20Final%20-%202.pdf)
- [Aviva — make a home insurance claim](https://www.aviva.co.uk/help-and-support/claims/home-insurance/)
- [GOV.UK — what to do after a flood](https://www.gov.uk/after-flood)
- [EU — 112 emergency number](https://digital-strategy.ec.europa.eu/en/policies/112)
