---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-05
related:
  - docs/product/2026-07-05-mobile-uiux-storyboard-package.md
  - docs/product/2026-07-05-mobile-uiux-storyboard-frame-inventory.md
  - docs/product/2026-07-05-mobile-uiux-review-input-package.md
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
---

# Mobile UI/UX Static Storyboard Board Contract

> Status: **static board contract only.** This is not an implemented UI, a
> browser prototype, an exported Figma/PDF board, a Figma approval, or runtime
> authority. It defines the board humans must create and review before any UI
> package is installed.

## Board Contract

Create a print/PDF board or Figma page named:
`MOB Step 3 Storyboard - Pre-Implementation`.

Use this layout:

| Column       | Content                                                    |
| ------------ | ---------------------------------------------------------- |
| Flow lane    | One horizontal lane per row below                          |
| Frame cards  | One card per frame ID from the frame inventory             |
| State badge  | `default`, `risk`, `offline`, `decision`, `artifact`       |
| Footer strip | data dependency, unresolved decision, reviewer mark        |
| Review mark  | `pass`, `pass_with_changes`, `blocker`, or `missing_frame` |

## Frame Card Template

Every card must use the same structure:

```text
[Frame ID] [State badge]
Primary user question
Main screen hierarchy
Trust / legal / data boundary
Reviewer mark: _____
Notes: _____________
```

## Board Lanes

| Lane | Frame IDs                 | Reviewer focus                                  |
| ---- | ------------------------- | ----------------------------------------------- |
| HN   | `HN-1` to `HN-6`          | Help Now clarity, country trust, no upsell      |
| IG   | `IG-1` to `IG-5`          | Crisis choices, safety boundaries, permissions  |
| EC   | `EC-1` to `EC-5`          | Evidence custody, camera fallback, deletion     |
| TM   | `TM-1` to `TM-6`          | Offline readiness, stale packs, integrity fail  |
| CP   | `CP-1` to `CP-5`          | Claim basis, deadlines, equal-dignity fork      |
| FM   | `FM-1` to `FM-4C`         | Net outcome, loss edge, Memo 1 variants         |
| HM   | `HM-1A`, `HM-1B`, `HM-1C` | Handler promise honesty, Memo 2 variants        |
| AC   | `AC-1` to `AC-4`          | Signing hierarchy, errors, 135% dynamic type    |
| PDF  | `PDF-1`, `PDF-2`, `PDF-3` | Filing seriousness and sponsor privacy boundary |

## Must-Show Global Elements

Each mobile frame must reserve space for:

- country and verified-date line;
- emergency-first instruction where relevant;
- human-review boundary for preliminary outputs;
- no-sales area for Help Now and crisis states;
- signed/unsigned decision marker for Memo 1 and Memo 2 variants;
- accessible action labels, not icon-only controls;
- footer note: `Review grants no runtime authority`.

## Reviewer Pass

Reviewers inspect the board in this order:

1. Scan all `HN` and `IG` frames for crisis trust failures.
2. Scan `EC` and `TM` for privacy, offline, stale-pack, and integrity failures.
3. Scan `CP`, `FM`, and `AC` for legal/final-output overclaim.
4. Scan `HM` for handler-promise mismatch.
5. Scan `PDF` for professional seriousness and privacy.
6. Mark any missing frame ID as `missing_frame`.

## Human Output Form

Each reviewer returns one note using this format:

| Field                 | Value                                      |
| --------------------- | ------------------------------------------ |
| Reviewer              | `TBD`                                      |
| Role / qualification  | `TBD`                                      |
| Board reviewed        | `TBD`                                      |
| Date                  | `TBD`                                      |
| Missing frames        | `TBD`                                      |
| Blockers              | `TBD`                                      |
| Copy needing review   | `TBD`                                      |
| Accessibility concern | `TBD`                                      |
| Runtime authority     | `This review grants no runtime authority.` |

## Completion Rule

The static board is ready only after every frame ID in
`docs/product/2026-07-05-mobile-uiux-storyboard-frame-inventory.md` exists in a
Figma/PDF/exported board and every card includes a reviewer-mark field that is
still unfilled.

Step 3 is still not complete until dated human findings are returned and stored.
