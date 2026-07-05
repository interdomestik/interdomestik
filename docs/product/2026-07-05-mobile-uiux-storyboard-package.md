---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-05
related:
  - docs/product/2026-07-05-mobile-uiux-static-storyboard-board.md
  - docs/product/2026-07-05-mobile-uiux-storyboard-frame-inventory.md
  - docs/product/2026-07-05-mobile-uiux-review-input-package.md
  - docs/product/mobile-experience-blueprint.md
  - docs/product/2026-07-03-mobile-excellence-dossier.md
  - docs/product/2026-07-03-mobile-component-contracts.md
  - docs/product/2026-07-03-mobile-copy-system.md
  - docs/product/2026-07-03-mobile-error-taxonomy.md
  - docs/product/2026-07-05-memo1-expert-cost-on-loss-decision-record.md
  - docs/product/2026-07-05-memo2-handler-model-decision-record.md
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
---

# Mobile UI/UX Storyboard Package

> Status: **Figma/storyboard preparation only.** This package installs no UI
> package, ships no prototype, promotes no `MOB-*` slice, and grants no runtime
> authority. It exists so human reviewers can inspect the intended mobile
> experience before implementation.

## Why This Comes First

A human cannot review implemented UI behavior before the UI package exists.
They can still review the most expensive UX decisions before engineering starts:
flow order, trust hierarchy, crisis-state copy, legal/commercial boundaries,
accessibility intent, and whether unresolved business decisions require visible
variants.

Use this package and the static board companion to create a Figma board or
equivalent storyboard. Do not use either as proof that the app works in a
browser.

## Reviewer Boundary

Reviewers may approve, reject, or annotate:

- frame sequence and information hierarchy;
- copy clarity for Help Now, Trip Mode, Claim Pack, Fee Math, and Agreement
  Ceremony;
- dark-country, stale-pack, offline, camera-denied, and signature-error states;
- accessibility reading order, focus order, and dynamic-type resilience;
- artifact seriousness for PDFs and partner-facing documents.

Reviewers cannot approve:

- shipped UI, routing, auth, session, tenancy, or billing behavior;
- non-dark country exposure;
- emergency-number correctness without signed country evidence;
- fee promises before Memo 1 is signed;
- handler promises before Memo 2 is signed;
- `MOB-01b`, `MOB-05a`, or `MOB-02` promotion.

## Board Setup

Create one Figma page named `MOB Step 3 Storyboard - Pre-Implementation`.

| Board rule       | Requirement                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| Device frames    | `390 x 844` primary, `360 x 800` compact, plus one `135%` dynamic-type lane |
| Layout grouping  | One horizontal row per flow; one vertical column per state                  |
| Annotation style | Short side notes for intent, data dependency, and unresolved decision       |
| Visual tone      | Calm institutional, not sales-led; Help Now must feel operational           |
| Variant handling | Show unsigned Memo 1 and Memo 2 options as separate frames, not hidden text |

## Storyboard Rows

| Row | Flow                     | Purpose                                                                 |
| --- | ------------------------ | ----------------------------------------------------------------------- |
| 1   | Help Now entry           | Prove a stressed user can get country-specific guidance without upsell  |
| 2   | Incident guide           | Prove crisis choices are scannable, non-legalistic, and recoverable     |
| 3   | Trip Mode                | Prove offline preparedness, pack freshness, and integrity failure copy  |
| 4   | Evidence Coach           | Prove camera permission, local-save, and delete choices are trustworthy |
| 5   | Claim Pack read-back     | Prove the user understands basis, deadline, documents, and next fork    |
| 6   | Fee Math Sheet           | Prove member net outcome is clearer than platform fee                   |
| 7   | Handler / member support | Prove the support promise matches the unsigned handler decision         |
| 8   | Agreement Ceremony       | Prove signing hierarchy survives errors and 135% type                   |
| 9   | Artifact templates       | Prove PDFs look serious enough for lawyers, insurers, and partners      |

## Required Frames

Use `docs/product/2026-07-05-mobile-uiux-storyboard-frame-inventory.md` as the
frame-level checklist. The Figma board is incomplete if any listed frame ID is
missing.

## Copy Constraints

- Help Now copy must never sell handling services.
- Dark-country copy must say the country is not yet available, not that the app
  is broken.
- Stale-pack copy must block or qualify unsafe guidance instead of hiding risk.
- Claim Pack copy must say initial assessment / human review where applicable.
- Fee Math copy must put the user's net amount before the platform fee.
- Handler copy must match Memo 2 exactly; if Memo 2 is unsigned, all three
  variants remain visible in the board.
- Signature copy must not bury loss-side expert/court-cost exposure.

## Accessibility Script Deliverables

Create one text script per flow row. Each script must include:

- first focus target;
- reading order;
- control name and state announcement;
- error-state announcement;
- keyboard/focus recovery path;
- what changes in the `135%` dynamic-type lane.

Minimum scripts: Help Now car accident, Trip Mode stale pack, Evidence Coach
camera denied, Claim Pack read-back, Fee Math option B, Agreement Ceremony
signature error.

## Human Review Procedure

1. Reviewer reads the input package and this storyboard package.
2. Designer creates the Figma page with every frame ID in the inventory.
3. Reviewer marks each frame `pass`, `pass_with_changes`, or `blocker`.
4. Reviewer records blocking findings with frame ID, issue, risk, and required
   change.
5. Product-design owner updates the review input package with a dated link to
   the returned notes.
6. No runtime work starts until a later current-authority/design-gate record
   explicitly cites the accepted storyboard evidence.

## Output Required From Reviewers

Each reviewer returns a dated note containing:

- Figma file/page name or exported PDF name reviewed;
- frames reviewed and frames missing;
- blockers by frame ID;
- copy strings requiring legal/language approval;
- accessibility issues by script;
- one explicit sentence: "This review grants no runtime authority."

## Step 3 Done Definition

Step 3 becomes reviewable when this package and the existing review input package
are merged. Step 3 becomes complete only after human reviewers return dated
findings for the storyboard/Figma board.

Completion does not install the UI package, prove browser behavior, or unblock
runtime exposure. It only reduces product-design uncertainty before `MOB-01b`,
`MOB-05a`, or `MOB-02` gate work.
