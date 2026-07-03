---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-excellence-dossier.md
  - docs/product/2026-07-03-mobile-component-contracts.md
  - docs/product/2026-07-03-mobile-copy-system.md
  - docs/product/mobile-experience-blueprint.md
---

# Mobile Visual Benchmark + UX Moodboard Brief — Part 2

> Status: **Design input only — no implementation authority.** Reference material for Figma work ahead of `MOB-DG01`/`MOB-DG02`. Nothing here promotes a slice, changes a boundary, or authorizes runtime work. Where this brief and the component contracts disagree, the contracts win.

Part 2 of [2026-07-03-mobile-visual-benchmark-moodboard-brief.md](./2026-07-03-mobile-visual-benchmark-moodboard-brief.md).

## 4. Anti-Patterns (forbidden, reviewable, no exceptions without a gate note)

1. Gradients, glassmorphism, neumorphism, drop-shadow stacks.
2. Stock photography anywhere in-product (handshakes, gavels, crash scenes, smiling call centers).
3. Illustrated mascots, empty-state art, Lottie decoration.
4. Confetti/celebration animation on money or legal events.
5. Countdown timers, slashed prices, "offer ends" mechanics — anywhere, ever.
6. Asymmetric-dignity choice styling (big colorful yes / grey guilt no) — the TurboTax disease.
7. Dashboard KPI tiles, gauges, or scores on member surfaces.
8. Red as error color (red = emergency call only); error states are ink + instruction.
9. Spinners (skeleton, progress, or staged copy instead); shimmer effects on Help Now.
10. Insurance-blue (#0066CC-class) and any palette that photographs like a bank lobby.
11. Emoji in product copy; icons carrying meaning without labels.
12. Engagement mechanics: streaks, badges-for-usage, "you haven't opened the app" nudges.
13. Two amber elements on one screen (mechanical fail).
14. Decorative use of the ReviewBadge or clarity markers (they are functional, placed by rule, not filler).
15. Marketing hero sections, testimonial carousels, or trust-logo strips inside the product (marketing site material).

---

## 5. Figma Creative Brief (hand to the designer as-is)

**Project:** Interdomestik IDA mobile — visual system + first six flows.
**Read first:** this brief; the excellence dossier §3 (screen specs) and §6; component contracts (props/states are fixed — design within them); copy system (real strings come from catalogs; design with realistic sq/mk lengths, ~15% longer than en).

**The product in one line:** after an accident, this app is the competent person who takes over — free help first, honest fee math always, a human behind every judgment.

**Feel targets:** calm institution, warm execution. Benchmarks: Wise (money honesty), GOV.UK (content discipline), Uber (status clarity), Apple Wallet (artifact value), Remitly (corridor/diaspora warmth). Hard negative: TurboTax upsell patterns, DoNotPay robot-lawyer framing, remittance promo-carnival.

**Deliverables:**

1. **Token foundation:** color roles (§2 hierarchy — name by role: `surface`, `ink`, `action`, `progress`, `emergency`, `boundary`), type scale (34/28/22/20/17/15/13, two weights, tabular numerals), spacing (4pt grid set), radius (8), hairline system, haptic-paired motion specs (150/200/250ms ease-out set).
2. **Component sheets** with full state coverage per the contracts: `ReviewBadge` (3 states), `NextStepCard` (member-action / waiting / all-quiet / overdue / skeleton), `ProgressRail`, `OwnerChip`, `ChecklistItem` (4 states), `EvidenceShotList` + camera overlay frames, `FeeMathSheet` (4 contexts), artifact card rank (Claim Pack / EAS / signed pack), bottom-sheet template, `ConsentSheet` (design ahead for MOB-03).
3. **Six flows, hi-fi:** Help Now (5), Trip Mode (4), Claim Pack (3), Member Home A/B/C (3), Next Step/Case Detail (4), Fee Math (sheet + collapsed line), Agreement Ceremony (4) — 390×844 primary artboards, plus 360×780 (small Android) and 135% Dynamic Type variants for HN-1, CP-1, MH-A, FM-1.
4. **Emergency-mode spec page:** the visible "mode shift" between MH-C and HN-1 (what drops, what grows).
5. **Redline page** for the thumb-zone contract (primary actions bottom 60%, amber placement, 44/88pt targets).

**Content rules for mocks:** use catalog-realistic copy (status sentences from the copy system §3 table; fee example €5,000 / 15% / €4,250; countries KS/MK/AL; corridor DE→KS). Never lorem ipsum — this product's design _is_ its sentences. Include one sq and one de variant artboard for HN-1 and FM-1 to prove length tolerance.

**Review criteria (what gets a design rejected):** any §4 anti-pattern; two ambers; a screen whose primary action is above the fold-line of the thumb zone; money smaller than its label; a choice screen failing the equal-dignity check; Help Now screens with any loading affordance; skeleton that shifts layout; text below 13pt; a state in the contracts without a designed frame.

**Out of scope:** marketing site, app icon/brand identity refresh, VONESA and Agent flows beyond the two preview frames in dossier §3.10–11, dark mode, tablet layouts.

**Governance note for the file:** name the Figma project "IDA Mobile — design input (pre-MOB-DG01)". These designs authorize no build; they become buildable only when the relevant slice is promoted through its design gate.
