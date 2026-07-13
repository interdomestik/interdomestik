---
plan_role: design_gate
status: review_draft
source_of_truth: false
slice: IDA-DG04
owner: platform + product + design + qa
date: 2026-07-13
---

# IDA-DG04 — Public Entry Portal Design Gate

## Decision sought

Authorize one future Tier 2 implementation slice: a presentation-only public entry portal
that helps a visitor choose the right path without changing access, routing, membership,
claims, billing, or tenant behavior. This document is a design proposal, not runtime authority.

## Why this matters

The public surface currently has to serve three materially different intentions. A person in
North Macedonia needs immediate local guidance; a person in the diaspora often buys protection
for a family member or an upcoming journey; an existing member needs a fast, personal route back
to their active work. One generic marketing hero makes all three paths less clear.

## Product decision

Use a single neutral public shell with a short choice at the top. Do not create three separate
sites, host-derived branding, or detached sales funnels.

| Entry                      | Visitor sees first                              | Primary action                 | Business role                                                                  |
| -------------------------- | ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| **Në Maqedoninë e Veriut** | “Ke pasur aksident ose ke nevojë për orientim?” | `Merr udhëzimin`               | Free Help Now funnel; converts only after clear value.                         |
| **Diaspora**               | “Mbro familjen dhe udhëtimin, edhe nga larg.”   | `Shiko mbrojtjen për familjen` | Gift/remote membership route; payer and beneficiary remain distinct.           |
| **Jam anëtar**             | “Vazhdo nga hapi yt i radhës.”                  | `Hyr në llogari`               | Returns to the existing member portal; never competes with an active case CTA. |

The visitor can change their choice at any time. The selection is an in-page presentation state,
not an identity, entitlement, country decision, or persistent profile field.

## Experience structure

1. **Trust bar:** neutral Interdomestik identity, language control, member sign-in.
2. **Hero:** one direct Albanian promise: guidance, evidence, and professional help; never a
   compensation guarantee or legal outcome promise.
3. **Three-entry selector:** labelled cards or tabs with a short practical explanation and one
   real CTA each. It must be keyboard accessible and work at 375 px.
4. **Chosen-path proof:** three concrete next steps, the documents a visitor may need, and a
   protective disclosure where the service is advisory or needs human review.
5. **Service map:** Help Now, accident procedure, material damage, injury support, professional
   expertise, legal representation, and flight-delay help. Cards are links only when a real,
   authorized destination exists.
6. **Membership value:** shown after free value, not as the first or only answer. Diaspora copy
   explains payer/beneficiary separation without implying automatic coverage.
7. **Trust and conversion footer:** contacts, legal/privacy links, and a measured membership CTA.

## Commercial, sales, marketing, and finance boundary

The public portal is a conversion surface, not an operations console.

- Marketing may measure anonymous, consented funnel steps such as entry choice and CTA completion.
- Sales attribution, partner codes, membership orders, commissions, contracts, finance approvals,
  and board reporting remain out of scope. They belong to the future OMG program and its gated
  role/tenant model.
- No sales partner, finance user, or board member gains document, claim, or member access through
  this slice.
- A future reporting read model may consume approved, aggregate events; this portal must not
  directly write financial or attribution records.

## Design system

The generic “vibrant app-store” recommendation was rejected because this is a trust, assistance,
and legal-adjacent product. The proposed direction is **calm premium utility**:

- deep evergreen/ink as the trust foundation, warm off-white surfaces, a restrained mint accent;
- a high-legibility variable sans serif already present in the product or its approved token set;
- one strong action per viewport, generous but not wasteful spacing, real imagery only where it
  clarifies a service; no decorative stock trauma imagery;
- rounded surfaces with modest elevation, clear borders, no glassmorphism, no emoji icons;
- 44 px minimum touch targets, visible focus, `prefers-reduced-motion`, WCAG AA contrast, and
  375 / 768 / 1024 / 1440 px responsive proof.

## Existing behavior to preserve

- `apps/web/src/proxy.ts` is read-only.
- Canonical `/member`, `/agent`, `/staff`, and `/admin` routes stay unchanged.
- Public shell is neutral; tenant branding continues to resolve from session context, never host.
- Current member hero resolver states, `*-page-ready` markers, locales, authentication, Paddle,
  claims, documents, consent, and support flows remain their current authority.
- Member CTA returns to the existing sign-in/member flow. It does not introduce an alternate
  account, authentication, or onboarding route.

## Candidate implementation scope (after approval)

- One existing public/front-door surface and its route-local components only.
- Presentation, localized SQ/MK/EN copy, accessible selector, and real existing destinations.
- Focused unit/render tests plus Playwright proof at small mobile and desktop widths.
- No new backend calls, data model, database migration, RLS, auth/session changes, analytics
  provider, storage, payment behavior, host routing, or new canonical route.

## Acceptance evidence

| Criterion                                          | Durable proof                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| A visitor can distinguish the three paths          | Render tests assert labels, selected state, and CTA hrefs.           |
| Every CTA is truthful and operable                 | Link/button tests plus browser keyboard proof; no dead cards.        |
| Existing member work remains primary after sign-in | Existing member hero resolver and dashboard tests remain green.      |
| No tenant/route leakage                            | Existing neutral-public-shell and route gate evidence remains green. |
| Mobile is usable                                   | Playwright screenshots/interaction at 375 px and 390 px.             |
| Copy remains protective                            | i18n/forbidden-claims checks and manual copy review.                 |

## Risk and mitigations

| Risk                                           | Mitigation                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| A broad redesign delays the pilot              | Limit the first slice to one front-door surface and existing destinations. |
| Diaspora copy implies eligibility or coverage  | Use eligibility language and human-review disclosure; no outcome claims.   |
| Membership pressure harms urgent Help Now use  | Lead with free immediate guidance; membership comes after path value.      |
| UI creates a shadow sales system               | No attribution, commissions, orders, or finance writes.                    |
| Decorative cards look clickable but do nothing | Every interactive surface has a real destination; otherwise it is static.  |

## Explicit non-goals

- Three separate portals, country-host routing, or a commercial dashboard.
- New user accounts, role changes, sales/finance/partner access, or shared evidence storage.
- A pricing/purchase redesign, legal advice automation, claim outcome scoring, or legal guarantees.
- Replacing the established member dashboard, Help Now workflow, or mobile program.

## Review and promotion path

1. Get bounded independent design critique (Opus because the user explicitly requested it).
2. Incorporate only relevant findings and publish a reviewer disposition.
3. Obtain explicit user approval of the final gate.
4. Update canonical current authority to name exactly one implementation slice.
5. Only then implement on this branch, test, preview, and open a PR.

Until step 4, this branch contains design work only.
