---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
---

# Interdomestik IDA — Mobile Experience Blueprint — Part 1

> Status: **Design input — no implementation authority.**

Part 1 of [mobile-experience-blueprint.md](./mobile-experience-blueprint.md).

**Status:** Proposal for commercial launch (post M0–M5)
**Author role:** Mobile product design / UX architecture / service design
**Date:** 2026-07-03

---

## 1. Product Diagnosis

The current product is a web dashboard organized by internal structure (member / agent / staff / admin route groups, a services catalog page, a claims list). That works for a pilot. It fails commercially on mobile for three reasons:

**1. It sells a taxonomy, not a moment.** Eleven services presented as eleven cards forces the user to self-diagnose ("Is my problem a Legal Basis Pre-check or a Procedure Guide?"). Nobody who just had a car crash knows — or should need to know — the difference. The service catalog is Interdomestik's org chart, not the user's mental model. Users arrive in exactly three states: _something just happened_ (adrenaline, one-handed phone use, roadside), _I have an ongoing problem_ (a claim in flight, checking status), or _I'm evaluating whether this is worth €20/year_ (skeptical browsing). The IA must be built around these three states.

**2. The dashboard pattern is wrong for the median user.** A dashboard assumes recurring engagement with varied data. A member touches this app perhaps 4–10 times a year, in bursts around an incident. The right pattern is a **case companion**: one clear "here's where you are, here's the single next step" surface, not KPI tiles.

**3. Trust is asserted, not demonstrated.** Legal-service apps win trust by showing competence fast: a useful checklist in 30 seconds, a claim pack you can hold, a named human reviewing your file. The current pilot buries the first useful output behind registration. Meanwhile the legal boundaries (not an insurer, not final decisions) risk being handled as disclaimer walls — which reads as evasion. Boundaries should be woven into confident language ("a human expert reviews this before anything is final" is a _feature_, not a warning).

**What's right and must be kept:** the shared case/document/timeline/event spine, the role model, the free→member→professional-recovery ladder, and VONESA on the same spine. The redesign is about presentation and flow, not the domain model.

---

## 2. Service Taxonomy Recommendation

**Decision: collapse the 11 services into 4 member-facing missions plus 1 vertical. The 11 services survive as internal capabilities and case stages — never as a browsing catalog.**

| Mission (user-facing)                                | Absorbs these canonical services                                                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Help Now** — "Something just happened"             | #6 Incident Scene Guide (Police vs EAS, Green Card, evidence preservation)                                                                                                                   |
| **Start a Claim** — "I want compensation"            | #1 Legal Basis Pre-check, #2 Procedure Guide, #3 Injury Pre-check, #4 Vehicle/Material Damage Review — all become _steps inside intake_, auto-selected by incident type                      |
| **My Cases** — "Where do I stand?"                   | #5 Invalidity Coefficient Review, #7 Professional Expertise, #9 Court Path, #10 Legal Representation — all become _stages and escalations on the case timeline_, surfaced only when relevant |
| **Membership** — "What do I get, what does it cost?" | #8 Member Discounts / Success-Fee Benefit — becomes transparent fee math shown at every agreement moment, plus a benefits page                                                               |
| **Flight Delay (VONESA)** — first-class vertical     | #11 Passenger Rights, with its own entry point and 3-minute flow, on the shared case spine                                                                                                   |

Rules this taxonomy enforces:

- A pre-check is never a product the user "opens." It's a step the intake wizard runs for them based on what happened. The user experiences it as "we checked your basis — looks workable, here's why."
- Experts, court, and legal representation are never menu items. They appear as **proposed next steps on a live case** ("We recommend an independent vehicle expert. Cost: covered under your plan / €X, approve?"). This is both better UX and safer legally: escalation paths only appear after the prerequisites (rejection, low offer, review) the business rules require.
- Invalidity Coefficient Review appears only inside injury cases for members, framed as "request a human specialist review" — a form plus a named-reviewer promise, not an automated tool.
- Discounts/success-fee is not a service; it is **pricing honesty as a UI pattern** (the Fee Math Sheet, §11) rendered before every signature.

---

## 3. Mobile Information Architecture

```
ROOT (state-aware)
│
├── Home (Free or Member variant — see §6)
│
├── Help Now  ★ always reachable: center tab + lock-screen widget + deep link
│   ├── Car accident → scene guide (Police vs EAS decision, photos, Green Card)
│   ├── Injury → immediate steps + evidence
│   ├── Property/other damage → evidence + report guidance
│   └── Flight problem → jumps into VONESA
│
├── Cases
│   ├── Case list (usually 1) → Case Detail
│   │   ├── Next Step card (always exactly one)
│   │   ├── Timeline (member-visible events only)
│   │   ├── Documents (case-scoped view of Vault)
│   │   ├── People (your case handler, experts, lawyer when active)
│   │   └── Agreements & fees (signed docs, fee math, ledger)
│   └── + Start a claim (intake wizard)
│
├── Vault (documents & evidence, cross-case)
│   ├── By case / by type (ID, vehicle, medical, correspondence)
│   ├── Consent boundaries visible per item (esp. medical)
│   └── Camera-first "Add evidence" with guided shot lists
│
└── Account
    ├── Membership & plan (incl. family/household seats)
    ├── Benefits & fee rules (success-fee explainer)
    ├── Sponsored-by badge (if group seat)
    ├── Language, notifications, privacy, data export/delete
    └── Help & contact (real humans, hours, callback)
```

VONESA lives as a prominent Home entry + Help Now branch, not a sixth tab. Its cases appear in Cases like any other — same spine, specialized intake and ledger.

---

## 4. Navigation Model

**Decision: 5-slot bottom tab bar with an elevated center action.**

`Home · Cases · [HELP NOW] · Vault · Account`

- **Help Now is the center slot**, visually elevated (pill/FAB style, amber), always one thumb-tap away. This is the single most important navigation decision: it makes the app's promise physical. Competitors bury emergency guidance in content pages.
- No hamburger menu. Everything reachable in ≤2 taps from a tab root.
- Free (unauthenticated) users get the same shell with Cases/Vault in "preview" state — visible, explained, locked behind account creation only where PII genuinely starts (this converts better than hiding).
- Push notifications deep-link straight to the Next Step card, never to a list.

---
