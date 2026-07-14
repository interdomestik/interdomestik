---
plan_role: input
status: active
source_of_truth: false
slice: IDA-DG08
proposed_implementation_slice: IDA-UI01c
owner: platform + product + design + privacy + qa
date: 2026-07-14
last_reviewed: 2026-07-14
---

# IDA-DG08 — Dynamic Accident Safety Journey Design Gate

> Status: accepted current-authority design gate. Arben approved the dynamic tree,
> first-slice exclusions, and implementation continuation on 2026-07-14. This gate
> promotes only `IDA-UI01c`; `IDA-UI01b` remains frozen and is not resumed,
> replaced, or closed by this decision.

## Decision sought

Approve a need-led, dynamically branching public vehicle-accident journey that
starts with safety, avoids a false fixed step count, and shows only the next useful
question or action.

If this design is later accepted as canonical current authority, the gate proposes
exactly one Tier 3 implementation slice, `IDA-UI01c`, limited to anonymous,
ephemeral safety orientation. Durable injury storage, country-rule engine work,
medical intake, and protected architecture remain separate and unpromoted.

## Authority and advisory reconciliation

| Source                                                               | Evidence                                                                                                                                                              | Disposition                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Repo resolver after PR `#1346`                                       | `blocked_requires_current_authority`, `activeSlice=null`                                                                                                              | Binding; runtime is not authorized.                         |
| `IDA-DG06` / `IDA-UI01b`                                             | The selected-intent slice is preserved but frozen after the no-JavaScript stop condition.                                                                             | Binding; do not resume implicitly.                          |
| `IDA-DG07` / `IDA-SH01`                                              | The no-JavaScript page shell is closed; a fresh current-authority decision is required.                                                                               | Binding prerequisite satisfied, not a UI promotion.         |
| M0–M5 services overlay                                               | Help Now is the priority free-zone incident guide; `injury_present` is a hard stop, followed by vehicle, agreement, foreign-plate, and country-rule checks.           | Binding architecture input.                                 |
| `P39-ASSIST-02`                                                      | `IncidentScenePack` supports PII-free checklist and escalation output but does not decide EAS versus police.                                                          | Reuse the contract; do not overclaim its capability.        |
| Current signed Help Now content                                      | Only the MK content pack is publicly accepted; other country packs remain dark.                                                                                       | Do not expose unsigned country-specific conclusions.        |
| AI OS refresh receipt `dd49425f...`; state observation `352becf1...` | Interdomestik authority current, no active slice, runtime not authorized; Brain current.                                                                              | Advisory pre-promotion state aligned with repo authority.   |
| Arben product decision                                               | Approved the dynamic three-branch journey, rejected the fixed `Hapi 1 nga 4` model, and authorized continuation with the tree and implementation slice on 2026-07-14. | Controlling product/design decision within repo boundaries. |

## Bounded review and reconciliation

| Route                                                                | Result                                                                                                      | Reconciliation                                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Sonnet 4.6 through the bounded CLI wrapper (`120461 ms`)      | `REVISE`; two blockers and four conditions                                                                  | Accepted. Branch C now has an unconditional precautionary referral; the absent save-later promise is testable; emergency/police wording is fail-closed; transient injury state is client-only; focus and live-region criteria are measurable. |
| Gemini 3.1 Pro Preview through the bounded CLI wrapper (`163274 ms`) | `ACCEPT WITH CONDITIONS`                                                                                    | Accepted. No-egress, fail-closed, and final-copy controls remain mandatory. Gemini did not identify Sonnet's more precise blockers, so the stricter Sonnet findings control.                                                                  |
| Official EU emergency guidance                                       | `112` routes callers to the appropriate ambulance, fire, or police service under the national organization. | The gate does not invent a universal separate-police rule. It directs the visitor to local emergency services and operator instructions; signed country packs may add verified police procedure.                                              |
| Fable 5                                                              | `skipped`                                                                                                   | Access is not verified in the current runtime; no waiting or implied approval.                                                                                                                                                                |
| Claude Opus 4.8 escalation                                           | `skipped`                                                                                                   | User permitted escalation, but no unresolved reviewer disagreement remains after the stricter Sonnet corrections.                                                                                                                             |

This review is sufficient for the universal, non-medical, non-jurisdiction-specific
orientation copy in `IDA-UI01c`. Any country-specific legal conclusion still requires
the separately signed country-pack process and remains outside this slice.

## Research basis

Large motor insurers and mobility organizations converge on the same safety-first
sequence but usually present it as a long checklist or claim form:

- Progressive: injury check, vehicle movement, police, information/photos, claim;
- GEICO: injury, scene safety, police, information, vehicle movement/tow, claim;
- ADAC: secure scene, first aid, police triggers, evidence, accident report;
- Allianz, Aviva, Zurich, and UNIQA: incident, injury, third-party, damage,
  police-reference, and evidence collection.

Primary references:

- <https://www.progressive.com/answers/what-to-do-after-car-accident/>
- <https://www.geico.com/living/help-i-just-got-into-a-car-accident/>
- <https://www.adac.de/rund-ums-fahrzeug/unfall-schaden-panne/unfall/was-tun-nach-unfall/>
- <https://www.uniqa.at/versicherung/carpediem/checkliste_verkehrsunfall.html>
- <https://www.aviva.co.uk/help-and-support/claims/motor-insurance/>
- <https://www.allianz.co.uk/insurance/car-insurance/existing-customers/claim.html>
- <https://europa.eu/youreurope/citizens/vehicles/insurance/accident/index_en.htm>

Interdomestik should retain the useful sequence while replacing the long checklist
with one calm, context-aware next action. The EU's official Your Europe guidance
also confirms that an accident abroad starts from the law of the country where the
accident happened and separately requires vehicle-registration and insurer details.

## Locked experience principles

1. Start with `A është dikush i lënduar?` because safety changes every later action.
2. Treat `Nuk jam i sigurt` as a safety answer, never as permission to continue down
   the ordinary material-damage path.
3. Do not show `Hapi 1 nga 4`; the number of steps is unknown until the branch is
   known.
4. Use stage labels such as `Siguria së pari`, `Kontrolloni veturën`, `Rregullat e
vendit`, and `Ruani provat`.
5. Show one primary question or action at a time; keep prior answers available via a
   quiet `Ndrysho` control.
6. Give immediate relief before asking for claim details, account creation, payment,
   membership, or document upload.
7. Fail closed when a country rule, safety fact, or user answer is missing or
   uncertain.

## Emotional trust contract

The page must create reassurance without implying guaranteed coverage,
compensation, legal success, medical safety, or 24/7 human availability. Trust comes
from four visible qualities:

1. **Presence:** `Nuk duhet ta përballoni vetëm.` acknowledges the visitor before
   asking for facts.
2. **Competence:** questions follow the real safety and cross-border decision order;
   verified country guidance identifies its country and review posture.
3. **Control:** `Pa llogari. Pa pagesë. Ju vendosni kur dërgohen të dhënat.` remains
   visible without competing with the primary action.
4. **Honesty:** unknown, unsupported, or unsigned situations say so plainly and
   route to human support rather than presenting a guessed answer.

The visual expression remains premium and restrained: midnight navy authority,
warm ivory calm, measured teal direction, editorial serif only for the human
question, highly legible sans-serif for actions, generous whitespace, flat linework,
and no stock trauma imagery, decorative reassurance badge, gradient, glass,
gratuitous shadow, or claims-success symbolism.

Commercial confidence may promise a clear next step and continuity. It must not use
`garantojmë`, `kompensim i garantuar`, `fitoni`, `jemi gjithmonë online`, or another
outcome/service-availability overclaim.

## Diaspora and cross-border contract

Diaspora is a first-class user context, not a nationality field and not a decorative
marketing badge. A visitor may live in Kosovo, travel through Italy, drive a vehicle
registered in Germany, carry a North Macedonian passport, and face an Italian
counterparty insurer. Those facts have different purposes and must not be collapsed
into one `country` value.

The journey must reuse the existing Green Card jurisdiction roles:

1. `incident_country` — where the accident happened; this drives the immediate
   scene/procedure rule lookup;
2. `vehicle_registration_country` — where the visitor's vehicle is registered;
3. `insurer_or_counterparty_country` — the insurer or other vehicle's country when
   known.

Residence and preferred language support communication, later claims-representative
or compensation-body routing, and commercial continuity. They do not replace the
incident country. Passport/citizenship is not required for immediate Help Now and
must not be requested in this slice.

The public experience should carry a calm, visible diaspora signal:

> **Jashtë vendit? Jemi me ju.**
> Zgjidhni vendin ku ndodhi aksidenti; pastaj ju pyesim vetëm për dokumentet që
> ndryshojnë rrugën tuaj.

The signal must not claim that signed legal content or direct support exists in every
country. Unsupported or unsigned country combinations fail closed to universal
safety guidance and human support.

## Dynamic journey model

### Entry contract

The visitor selects `Aksident me veturë` from the approved help-first hero. The
existing one-shot, allowlisted, route-local selected-intent handoff remains the
proposed entry mechanism. Direct anchor visits, invalid input, and JavaScript-off
navigation retain the ordinary Free Start category fallback.

### Branch A — someone is injured

Answer: `Po, dikush është lënduar`.

The journey stops ordinary claim preparation and shows a safety outcome:

1. move away from immediate danger only when safe;
2. contact local emergency services and follow the operator's instructions;
3. show separate police procedure only when a currently signed country pack supports
   it; otherwise do not invent a country-specific reporting conclusion;
4. continue documentation only after the situation is safe;
5. offer `Ruaje dhe vazhdo më vonë` only when an authorized persistence contract
   exists; the first UI slice must not imply that it already exists.

This branch does not ask who was injured, diagnose the injury, request treatment
details, collect medical documents, or recommend a medical/legal outcome.

### Branch B — material damage only

Answer: `Jo, vetëm dëm material`.

The journey continues through conditional safety and documentation checks:

1. **Vehicle safety:** `A mund të lëvizet vetura pa rrezik?`
   - `Po` continues.
   - `Jo` or `Nuk jam i sigurt` shows safe-scene and roadside/police guidance.
   - wheel, steering, or brake concern is always treated as unsafe/uncertain.
2. **Incident country:** ask `Në cilin shtet ndodhi aksidenti?` Locale, residence,
   tenant host, GPS, nationality, or passport must not silently decide the answer.
   A detected country may be offered only as a user-confirmed suggestion.
3. **Cross-border context:** when the vehicle or counterparty may be foreign, ask
   where the visitor's vehicle is registered and, if known, the insurer or other
   vehicle's country. Derive the cross-border state from these jurisdiction roles,
   never from citizenship.
4. **Official-documentation triggers:** check disagreement, refusal to exchange
   details, foreign plate or missing insurance proof, third-party/public property,
   hit-and-run, and another signed country-pack hard stop.
5. **Evidence action:** when safe, guide photos of the scene, vehicles and plates;
   other-party insurance/Green Card details; date, time and location; witness details;
   and police/EAS reference only when applicable.
6. **Continuation:** offer `Organizo të dhënat e rastit` into the existing Free Start
   details journey without repeating the vehicle category.

No branch may output `EAS_ALLOWED` merely because no hard-stop checkbox was selected.
That conclusion requires a versioned, source-backed, currently signed country rule.

### Branch C — uncertain injury

Answer: `Nuk jam i sigurt`.

The journey follows a precautionary outcome:

1. treat the situation as a possible injury;
2. recommend immediate professional or emergency assessment;
3. do not suggest EAS or the ordinary material-only path;
4. allow the visitor to revise the answer after the situation is clarified.

### Cross-branch fail-closed rules

- Unknown or unsupported incident country never produces a country-specific legal
  conclusion.
- A dark, unsigned, stale, conflicting, or low-confidence rule pack routes to
  generic safety guidance plus human review/support.
- Unsafe or uncertain vehicle condition never recommends driving or moving it.
- Injury or uncertain injury never proceeds directly to EAS guidance.
- Missing JavaScript never hides the page or prevents access to the ordinary category
  fallback.

## Proposed first implementation boundary — `IDA-UI01c`

The proposed slice is a single presentation/workflow slice, not the full SVC-06
country-rule program. It is classified Tier 3 because the route temporarily handles
an injury signal and incident-country context even though neither may leave the
browser or persist.

### In scope

- the approved premium selected-vehicle composition;
- removal of the fixed `Hapi 1 nga 4` copy;
- the injury `yes / material only / unsure` branch;
- the material-only vehicle-safety branch;
- universal safety outcomes and generic evidence actions;
- the visible `Jashtë vendit? Jemi me ju.` diaspora/cross-border reassurance;
- route-local, user-confirmed incident, vehicle-registration, and
  insurer/counterparty country roles where the selected branch needs them;
- one-shot route-local state only;
- SQ, EN, SR, and MK copy using the existing supported locale set;
- keyboard, focus, screen-reader, reduced-motion, mobile, landscape, and 200% zoom
  behavior;
- explicit unsupported/unsigned-country fallback without EAS eligibility claims.

### Not in scope

- durable storage of injury, safety, location, or evidence answers;
- database, schema, migration, RLS, consent-event, retention, DSR, or audit work;
- medical details, injury category, diagnosis, treatment, medical documents, or AI;
- an EAS-versus-police country-rule engine or new legal-rule content;
- exposing KS, AL, DE, or another dark country pack as signed/accepted;
- German as a new application locale;
- passport, citizenship, ethnicity, or nationality collection;
- silent country derivation from locale, host, residence, IP, or GPS;
- uploads, claim creation, CRM/handoff creation, analytics of individual answers,
  cookies, URL/query state, local/session storage, or third-party provider state;
- changes to proxy, canonical routes, auth/session, tenancy, billing/Paddle, deployment,
  production aliases, dashboards, README, AGENTS, or architecture authority.

## Health-data and persistence boundary

The first implementation may use the injury answer only as transient route-local
orientation state. It must not persist or transmit the answer.

The injury branch renders client-side only. No Server Component, server action,
route handler, middleware, edge function, or cacheable response may receive, render,
log, or derive from the visitor's injury answer.

A later Tier 3 gate is required before durable storage. That gate must identify the
authoritative case/session store, Article 6 basis and Article 9 condition, explicit
consent posture where relied upon, event-versus-person semantics, third-party injury
handling, retention and deletion, DSR/correction, access roles, tenant/RLS proof,
audit, analytics/log exclusion, and rollback.

The preferred eventual event-scoped value is conceptually
`injury_involved = yes | no | unknown`; it must not be modeled as
`current_user_is_injured` without evidence identifying the data subject.

## Interaction and accessibility contract

- Mobile body, question, and action copy remains at least 16 CSS pixels.
- Primary response rows are at least 64 CSS pixels high where space permits and
  never below 44 by 44 CSS pixels.
- The entire response row is the interactive target.
- A visible focus indicator meets WCAG 2.2 SC 2.4.11 minimum non-text contrast of
  3:1; SC 2.4.13 enhanced focus appearance is the target.
- Question changes are announced through a labelled region without duplicative live
  announcements. Ordinary progression uses `aria-live="polite"`; an assertive live
  region is allowed only for an immediate-danger safety outcome.
- Keyboard activation moves focus once to the new question heading; pointer/touch
  does not force focus movement.
- Touch activation follows platform assistive-technology focus conventions when an
  active AT mode requires transfer; otherwise it does not move focus.
- Back/change returns to the previous decision without silently preserving an
  incompatible downstream answer.
- Browser back does not leak answers into URL/history or restore unsafe stale advice.
- At 200% zoom, actions stack, text reflows, and no horizontal scrolling occurs at
  320, 375, or 390 CSS pixels.

## Test-first evidence plan

### Focused state proof

1. `yes`, `material_only`, and `unsure` enter distinct allowlisted outcomes.
2. `unsure` always follows the precautionary path.
3. unsafe or uncertain vehicle state cannot reach ordinary evidence/EAS guidance.
4. changing an upstream answer clears incompatible downstream state.
5. invalid intent and direct anchor entry show the category fallback.
6. no selected answer enters URL, query, cookie, local/session storage,
   `window.history.state`, referrer, visible DOM `data-*` attributes, analytics, log,
   Sentry context, network request, server component, or server-action payload.
7. incident country, vehicle registration country, and insurer/counterparty country
   remain distinct and cannot overwrite one another.
8. passport, citizenship, locale, host, or residence cannot determine the incident
   country.
9. cross-border state is derived only from user-confirmed jurisdiction-role values.
   Changing `incident_country` clears both downstream country roles and derived
   cross-border state; changing `vehicle_registration_country` clears only
   `insurer_or_counterparty_country` and derived cross-border state.
10. `Ruaje dhe vazhdo më vonë` is absent from the DOM in every `IDA-UI01c` branch
    and authentication state.

### Browser matrix

- widths: 320, 375, 390, 768, 1024, 1440 and 844x390 landscape;
- zoom: 200%;
- input: keyboard, pointer, and touch-sized targets;
- modes: JavaScript on and off;
- locales: SQ, EN, SR, MK with longest natural strings;
- sessions: anonymous settled, authenticated settled, and pending-to-authenticated
  settlement clearing transient state;
- browsers: Chromium gate plus proportionate WebKit/Firefox smoke evidence.
- color preference: system light and dark mode without browser-forced contrast loss.

### Mandatory repo gates after authorized implementation

- focused unit/component tests;
- focused browser tests;
- `pnpm pr:verify`;
- `pnpm security:guard`;
- `pnpm e2e:gate`.

## Stop conditions

Stop and return to current authority if implementation would require:

- durable injury or health-data storage;
- a new consent writer, database field, schema, RLS policy, or member/case record;
- country-specific EAS/police conclusions without accepted rule metadata;
- proxy, route, auth/session, tenancy, billing, or deployment changes;
- German locale enablement;
- upload, AI, CRM, claim, handoff, analytics-answer, or third-party-provider work;
- a second active slice or implicit resumption of `IDA-UI01b`.

## Promotion checklist

Promotion disposition for `IDA-UI01c`:

1. Complete — Arben approved the exact dynamic tree, exclusions, and implementation continuation.
2. Complete — Sonnet and Gemini accepted the corrected transient-state/no-egress boundary.
3. Complete for universal safety-only copy — product-owner approval and official-source reconciliation are recorded; country-specific legal conclusions remain excluded.
4. Complete — the stricter independent design/accessibility findings are reconciled above.
5. Required in the same promotion commit — canonical `current-program.md` and `current-tracker.md` promote exactly one slice.
6. Required before runtime edits — resolver output must name exactly `IDA-UI01c`.
