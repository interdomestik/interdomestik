---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-program-authority-packet.md
  - docs/product/2026-07-03-mobile-component-contracts.md
  - docs/i18n.md
---

# Mobile Copy System & Localization Rules

> Status: **Design input — no implementation authorized.** Defines the voice, grammar, key architecture, and localization rules for all MOB-* surfaces. Binding on promoted slices through their design gates.

## 1. Voice

**"We'll take it from here."** First-person plural, active verbs, present tense. No passive insurance-speak, no exclamation marks, no urgency theatrics. The register is a competent triage nurse: calm, specific, on your side.

Five rules that decide 90% of cases:

1. **Promise the next action and its date, never the outcome.** "We chase them Tuesday" — never "you will be compensated."
2. **Name humans at review points.** "Ana, your handler" / "a certified doctor reviews this" — limitations rendered as the presence of humans, not the absence of guarantees.
3. **One sentence per status.** If a status needs two sentences, the second is the expectation date.
4. **Numbers get context.** Never a bare amount, score, or percentage: "€400 under EC261," "success fee 15% — you receive €4,250."
5. **Clarity markers are quoted, not written.** Product copy never invents boundary language; it references the reviewed marker catalog (`c03`/`s10`, extended only via legal review L5).

Banned vocabulary on member surfaces: _guarantee(d), final decision, automatically approved, case strength, score, instant payout, risk-free, submit_ (use "send"), _pursuant to, herein,_ internal status codes, and any concatenated fragment.

## 2. Message Key Architecture

Namespaces (extends the existing `messages/*.json` structure; new keys only, no re-keying of existing surfaces):

```
helpNow.*          MOB-01: scene guides, evidence coach, trip mode
  helpNow.scene.{car|injury|property}.*
  helpNow.eas.*                       (bilingual pairs, see §5)
  helpNow.trip.*
case.status.*      MOB-02: status sentences (see grammar §3)
case.nextStep.*    MOB-02: action labels, expectation lines
case.timeline.*    MOB-02: member-visible event catalog sentences
vault.consent.*    MOB-03: consent sheet statements per subject/party
fees.*             MOB-05a: fee math lines (legal-reviewed keys flagged)
markers.*          clarity-marker catalog (READ-ONLY for product; changes only via L5 legal review)
review.*           ReviewBadge reviewer labels
```

Key rules: every key holds a **complete sentence or complete label** — no fragments assembled in code; ICU MessageFormat for plurals/dates/amounts; keys consumed by `ReviewBadge`, `FeeMathSheet`, and `ConsentSheet` are marked `@legal-reviewed` in a comment and fail the i18n guardrail if edited without a paired review reference.

## 3. Status-Sentence Grammar (the `case.status.*` catalog)

Every case status sentence follows one grammar:

**[What happened / where it is] + [who has it] + [date expectation].**

Template: `{actor} {action} {object} on|by {date}` — realized as one localized sentence per (stage, owner) pair in the post-`T-503` transition matrix. The catalog is finite and enumerable: one key per matrix cell, e.g.

| Matrix cell (stage · owner)       | en example                                                             |
| --------------------------------- | ---------------------------------------------------------------------- |
| `verification · interdomestik`    | "We're verifying your documents — done by {date}."                     |
| `assessment · interdomestik`      | "Our experts are assessing the damage. You'll hear from us by {date}." |
| `negotiation · insurer`           | "{insurer} has your file. They have until {date} to respond."          |
| `negotiation · insurer · overdue` | "{insurer} missed their deadline. We escalated on {date}."             |
| `awaiting_member`                 | "We need one thing from you: {item}."                                  |
| `resolved · payout`               | "Recovered: {amount}. Your payout of {net} is on its way."             |
| any · awaiting-date               | "…we'll confirm the date within {n} days." (explicit, never silent)    |

Rules: no cell may be released without a sentence in every launch locale; overdue variants are part of the catalog (the escalation promise is copy, not improvisation); dates render via ICU date skeletons, localized; if a slice adds a stage, it adds the full sentence row set in the same PR or fails the gate.

## 4. Localization Rules

1. **Locales:** `sq`, `mk`, `en` required for all MOB-* namespaces; `de` required for `helpNow.*` (incl. Trip Mode) and any diaspora-facing acquisition surface; `de` optional elsewhere until MOB-07b.
2. **Full-sentence integrity:** the existing i18n guardrail extends to new namespaces — no concatenation, no `+` joins of message parts, no English fallback leaking on required-locale surfaces (guardrail treats missing required-locale keys as failures, not warnings).
3. **Stress-flow readability:** `helpNow.*` and `case.status.*` strings target a reading level a shaken non-lawyer handles one-handed: ≤ 90 characters per sentence where the grammar allows, no subordinate-clause chains in sq/mk (translation reviews check this, not just accuracy).
4. **Legal-text separation:** full agreement/policy texts are documents, not message keys — linked, versioned, per-country; only their one-line summaries live in the catalog (and those are `@legal-reviewed`).
5. **Names and currency:** member-facing money uses the case's currency with locale formatting, never floats; handler names render as given by staff records, never transliterated.
6. **RTL:** not required for launch locales; do not spend layout budget on it.

## 5. Bilingual EAS Rendering (Trip Mode)

The European Accident Statement renders as **one component with paired keys**: `helpNow.eas.{section}.{field}` resolves a `{primary, secondary}` locale pair (de+sq or de+mk), displayed side-by-side per field — never two full-form copies stacked. Field labels are the official EAS field semantics; translations reviewed under L2 sign-off (the sheet includes the bilingual EAS check). Offline pack includes both locales of the pair by definition.

## 6. Notification Copy

Notifications follow the status-sentence grammar with a hard length budget (≤ 120 chars body): sentence + deep link to the Next Step card. One notification per state change that matters to the member; silence discipline (≤1 meaningful notification per 30 idle days) is enforced by the notification slice, but the copy catalog only contains keys for member-meaningful events — internal transitions have no notification keys at all, making over-notification structurally hard.

## 7. Copy Review Workflow

New/changed keys in `markers.*`, `fees.*`, `vault.consent.*`, or any `@legal-reviewed` key → require an L5-lineage legal review reference in the PR. All other member-facing keys → product-copy review against §1 rules (checklist in PR template when MOB slices activate). Translation PRs → native-speaker review recorded per locale. The i18n integrity guardrail remains the mechanical gate; this workflow is the editorial gate on top.
