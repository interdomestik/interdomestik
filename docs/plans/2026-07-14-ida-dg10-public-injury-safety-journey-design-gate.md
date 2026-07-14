---
title: IDA-DG10 Public Injury Safety Journey Design Gate
date: 2026-07-14
status: complete
authority: current_authority
runtime_authorized: true
promoted_slice: IDA-UI01d
risk_tier: 3
owner: platform + product + design + privacy + qa
---

# IDA-DG10 Public Injury Safety Journey Design Gate

## Promotion decision

Promote exactly one Tier 3 slice: `IDA-UI01d`, an anonymous client-only injury
safety/orientation journey opened from the existing `Jam lënduar` hero action. The
risk tier is conservative because the topic is health-adjacent even though this
slice forbids health-data collection, persistence and transmission.

`IDA-UI01b` remains frozen. Property, flight, German, channel landing pages and every
protected surface remain unpromoted.

## User and business outcome

A person who is hurt should immediately understand whether to seek urgent local
help, what universally safe information to preserve, and how to continue without
being asked for a diagnosis or identity. Interdomestik earns trust first and offers
an explicit organizational/commercial continuation only after a useful safe result.

## Exact journey

1. The existing injury hero action emits one route-local intent and moves focus to
   the existing Free Start region.
2. Ask: `A jeni tani në rrezik, keni nevojë për ndihmë urgjente, ose nuk jeni të
sigurt?` Answers: `Po`, `Jo`, `Nuk jam i sigurt`.
3. `Po` or `Nuk jam i sigurt` shows a fail-closed static result: contact local
   emergency services; mention `112` only as the EU emergency number. No sales CTA.
4. `Jo` asks the incident source: traffic, workplace, fall/premises,
   product/equipment, suspected treatment issue, assault/other danger, unsure.
5. Suspected treatment and assault routes show explicit specialist/safety referral
   limits and no Interdomestik handling or recovery promise.
6. Other non-urgent routes ask incident country and usual country of residence as
   distinct, ephemeral user-confirmed fields. No passport/citizenship field.
7. Show a universal evidence/action result. It must not give diagnosis, liability,
   compensation, coverage, limitation or country-law conclusions.
8. Only then offer a new explicit action that starts the established Free Start
   intake with category `injury`. No triage answer is carried. Explain that this is
   a new data-intake step in which the user chooses what to submit.

Traffic injuries stay in this tree. An optional ordinary link may let the person
also open the vehicle journey, but no state crosses between trees.

## Data, privacy and trust contract

- Journey state exists only in component memory for the current render.
- No local/session storage, cookie, URL/query value, history state, analytics event,
  provider state, server action, fetch or network request may receive an answer.
- Do not ask for name, contact, identity of the injured person, body part, diagnosis,
  treatment, medical record, symptoms, employer identity or narrative.
- Country answers are orientation-only and are discarded on reset/navigation.
- The handoff carries only a fresh user-confirmed `injury` category, never answers.
- Existing downstream intake/action/privacy behavior is not changed or broadened.
- Copy must not claim 24/7 human availability, legal representation, eligibility,
  compensation, response time or guaranteed outcome.

## JavaScript, failure and reset

With JavaScript disabled the already server-rendered ordinary `injury` category link
and Free Start fallback remain visible and usable. The slice does not duplicate the
dynamic tree server-side. Unsupported/missing translations fail to the existing
locale contract; unsupported country combinations receive generic cross-border
orientation, never invented rules. Changing hero intent, locale or reset clears all
answers and restores the first question. Back/forward navigation must not resurrect
answers from storage/history.

## Accessibility, responsive and localization contract

- Equivalent SQ/EN/SR/MK keys and decision meaning; human copy review before merge.
- One visible `h2`/question, real buttons/links, deterministic keyboard order, visible
  focus and a focused/announced stage heading after transitions.
- Minimum 44×44 CSS-pixel targets, no color-only state, semantic status text.
- No horizontal overflow or clipped/overlapped controls at 360/375/390/430 CSS px,
  landscape and 200% zoom; long Serbian/Macedonian copy wraps naturally.
- Reduced-motion and forced-colors behavior remains usable.
- Urgent outcomes put safety copy before every other control and omit commercial CTA.

## Test-first implementation boundary

Expected narrow files, refined only to respect the 150-line rule:

- `apps/web/src/app/[locale]/components/public-entry-intent.ts`
- `apps/web/src/app/[locale]/components/public-entry-actions.tsx` or an extracted
  injury action component so the grandfathered file does not grow
- `apps/web/src/app/[locale]/components/home/free-start-intake-shell.tsx`
- new focused `injury-safety-journey*.tsx` components beside the vehicle journey
- focused unit tests beside those components/contracts
- localized message files for `sq`, `en`, `sr`, `mk`
- focused existing public-entry E2E specs only

No new file may exceed 150 lines. No broad shared-token or layout refactor.

Tests are written failing first and prove:

1. hero one-shot injury intent and deterministic reset;
2. urgent/unsure fail-closed outcome with no sales CTA;
3. all source branches, treatment/assault referral boundaries and traffic continuity;
4. separate incident/residence roles and generic diaspora signal;
5. no diagnosis/body part/treatment/identity/narrative prompts;
6. no storage/history/network/analytics/provider egress;
7. fresh explicit `injury` handoff only after the free result;
8. SQ/EN/SR/MK parity and no-JS ordinary fallback;
9. keyboard/focus/screen-reader, 44px targets, mobile/landscape/200% zoom;
10. Chromium plus proportionate Firefox/WebKit proof.

## Mandatory verification and evidence

- focused unit/contract tests and focused host-matrix E2E;
- real JavaScript-on/off browser evidence;
- 360/390 mobile, landscape and 200% zoom inspection;
- `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`;
- current-head CI, Sonar, security, reviewer and unresolved-thread evidence;
- no Vercel deployment or production alias change.

## Review disposition

AI OS was refreshed after `IDA-UI01c` closeout: its state adapter aligned with repo
authority (`activeSlice=none`, runtime unauthorized), while Brain retrieval remained
stale and was not used as authority. Sonnet 4.6 returned `ACCEPT WITH CONDITIONS`.
All conditions are binding above: traffic continuity; treatment/assault limits;
explicit no-JS behavior; static unsure orientation; separate incident/residence
countries; commercial CTA after the result; lawful-only referral fees; and exact
privacy/mobile/localization tests. The only adjusted suggestion is no-JS: the safe
ordinary intake fallback is preserved instead of creating a parallel server tree.

The first Gemini 3.1 Pro Preview route returned `REVISE` only because the prompt
named the wrong `product-guidelines.md` path; it made no design criticism and wrote
no repository file. The corrected read-only route reviewed the root guideline and
both gates, returned `ACCEPT` with no blocker or correction, and specifically
confirmed safety-before-sales, no PHI/PII collection, referral boundaries, one active
slice, protected exclusions and the ordinary no-JavaScript fallback.

## Protected exclusions and stop conditions

Do not change `apps/web/src/proxy.ts`, routes, auth/session, tenancy, database/schema/
RLS, billing/Paddle, claims/CRM writers, upload/storage, analytics/provider semantics,
dashboards, production aliases/deploy, README, AGENTS or architecture authority.

Stop and return to current authority if implementation requires durable health data,
a new route/API/server action, country-law logic, changing the existing downstream
submission contract, medical-specialist handling claims, referral-fee authority, or
any protected surface.

## Rollback

Remove the injury intent/dynamic components and localization keys, restoring the
ordinary existing injury category link. No migration, data cleanup or route rollback
is required because the slice owns no durable state.
