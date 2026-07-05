---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-05
related:
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
  - docs/product/mobile-experience-blueprint.md
  - docs/product/2026-07-03-mobile-excellence-dossier.md
  - docs/product/2026-07-03-mobile-design-review-enterprise.md
  - docs/product/2026-07-03-mobile-component-contracts.md
  - docs/product/2026-07-03-mobile-copy-system.md
  - docs/product/2026-07-03-mobile-error-taxonomy.md
---

# Mobile UI/UX Review Input Package

> Status: **Step 3 preparation only.** This package creates no current
> authority, promotes no `MOB-*` slice, changes no runtime behavior, and does
> not approve any public exposure. It is a handoff checklist for product design,
> Figma, accessibility, legal-copy, and commercial reviewers.

## Purpose

Convert the existing mobile dossier into a reviewer-ready work package before
the next governed runtime decision. The goal is to make the UI/UX review
answerable without reopening the whole strategy conversation.
Use it when asking a product designer, Figma designer, accessibility reviewer,
or legal-copy reviewer to inspect the mobile lane.

## Authority Boundary

- Allowed now: Figma frames, copy review, artifact templates, accessibility
  scripts, pictogram comprehension checks, and review notes.
- Not allowed from this file: flag flips, non-dark country exposure, shipped UI,
  new routes, auth/session/tenancy changes, billing behavior, proxy changes, or
  tracker promotion.
- Runtime work still requires current authority plus the matching design gate in
  `docs/plans/current-program.md` / `docs/plans/current-tracker.md`.

## Source Pack To Give Reviewers

| Source                                                               | Why reviewer needs it                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `docs/product/mobile-experience-blueprint.md`                        | Screen inventory, IA, primary mobile flows                              |
| `docs/product/2026-07-03-mobile-excellence-dossier.md`               | Product principles, performance budgets, measurement, red-team critique |
| `docs/product/2026-07-03-mobile-design-review-enterprise.md`         | Existing enterprise UX critique and missing artifacts                   |
| `docs/product/2026-07-03-mobile-component-contracts.md`              | Component API/state contracts for design consistency                    |
| `docs/product/2026-07-03-mobile-copy-system.md`                      | Tone, boundary copy, trust language                                     |
| `docs/product/2026-07-03-mobile-error-taxonomy.md`                   | Error-state grammar to keep flows consistent                            |
| `docs/product/2026-07-03-mobile-visual-benchmark-moodboard-brief.md` | Visual direction for calm institutional mobile UI                       |
| `docs/product/2026-07-05-mk-help-now-signature-package/README.md`    | MK country-content sign-off context                                     |

## Review Scope

Reviewers should inspect four flows first:

1. `HN-1..5`: Help Now / incident guide / emergency-number surface.
2. `TM-1..4`: Trip Mode / road-ready download / offline recovery state.
3. `CP-1..3`: Claim Pack read-back, equal-dignity fork, share/download.
4. `FM-1` and `AC-1..4`: Fee Math Sheet and Agreement Ceremony states.

Do not spend review time on agent mobile, VONESA runtime, or member vault
implementation details unless they expose a defect in the component contracts.

## Required Figma Frames

The first Figma pass is useful only if it includes these states.

| Flow               | Required frames                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Help Now           | default, country detected, offline, stale pack, emergency-number hotfix, dark country placeholder |
| Scene guide        | car accident, medical/injury, property/home, flight disruption, permission denied                 |
| Evidence coach     | camera allowed, camera denied, low light, saved locally, clear/delete confirmation                |
| Trip Mode          | download ready, downloading, verified road-ready, pack stale/needs refresh, storage unavailable   |
| Claim Pack         | read-back, deadlines, documents needed, free-pack path, handle-it path                            |
| Fee Math Sheet     | three recovery amounts, zero recovery, member discount, expert-cost-on-loss edge                  |
| Agreement Ceremony | service agreement, POA/e-sign, signature error, 135% dynamic type                                 |

## Artifact Templates

Design these before any runtime gate tries to rely on them:

- Claim Pack PDF: filing-grade typography, reference number, dated source lines,
  document checklist, and "initial assessment, human-reviewed before final" copy.
- Bilingual EAS artifact: aligned field pairs, country/version line, print-safe
  margins, no decorative treatment that weakens legal seriousness.
- Signed-pack PDF: signature evidence block, timestamp, method, policy versions,
  document manifest, and paginated exhibits.
- Sponsor monthly aggregate report: aggregate-only metrics, no member/case
  detail, statement that sponsor case access is technically blocked.
- Operational-maturity fact sheet: SLA claims, privacy enforcement, audit trail,
  complaint path, and which release gates prove each claim.

## Accessibility Review Inputs

The reviewer must receive screen-reader scripts, not only images.

Minimum scripts:

- Help Now car path: first focus, emergency number, situation choices, offline
  state, and exit path.
- Claim Pack read-back: basis, deadline, document list, free-pack fork, handle-it
  fork.
- Fee Math Sheet: recovered amount, fee amount, member discount, user receives,
  "recover nothing, pay nothing" line.
- Agreement Ceremony: document title, fee summary, signature action, error state,
  completion state.

Acceptance: each script states reading order, control name, state announcement,
and keyboard/focus expectation.

## Reviewer Questions

Ask reviewers to answer these exactly:

1. Does any frame make a stressed roadside user think Help Now is broken,
   unavailable, or selling to them?
2. Are emergency numbers, country labels, and "verified for" dates visible
   enough without feeling like marketing?
3. Does any automated or preliminary output look final before human review?
4. Does the Fee Math Sheet make the user's net amount clearer than the platform
   fee?
5. Is the expert-cost-on-loss edge visually impossible to miss once Memo 1 is
   signed?
6. Does the handler model copy remain honest if Memo 2 chooses "case team"
   instead of a named person?
7. Do dark-country and stale-pack states read as intentionally unavailable, not
   as a product failure?
8. Are the PDF/artifact templates serious enough for a lawyer, insurer, or
   partner to file or forward?
9. Do 135% dynamic-type variants preserve the signature and fee hierarchy?
10. Are all sales prompts absent from Help Now and limited to approved fork
    moments?

## Output Expected From Reviewers

Each reviewer returns one dated note with:

- reviewed source list, missing inputs, and blocking findings by severity;
- non-blocking improvements plus states or frames that need redesign;
- exact copy strings that need legal/language review;
- explicit statement that no runtime authority is being granted.

## Done Definition For Step 3

Step 3 is complete when this package is merged and assigned to the design
reviewers. The actual Figma frames, accessibility scripts, and artifact template
files are follow-on design deliverables; they authorize no runtime work.
