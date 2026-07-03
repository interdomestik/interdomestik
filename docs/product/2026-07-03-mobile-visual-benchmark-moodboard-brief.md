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

# Mobile Visual Benchmark + UX Moodboard Brief

> Status: **Design input only — no implementation authority.** Reference material for Figma work ahead of `MOB-DG01`/`MOB-DG02`. Nothing here promotes a slice, changes a boundary, or authorizes runtime work. Where this brief and the component contracts disagree, the contracts win.

**The one-line art direction:** _Wise's fee honesty + GOV.UK's content discipline + an emergency app's decision clarity, wearing the calm ink-navy of a firm you'd trust with your grandmother's case._

---

## 1. Reference Products & Patterns (borrow / avoid)

**1. Wise (fee transparency — the gold standard).**
Borrow: the fee breakdown shown _before_ commitment as a vertical arithmetic receipt (amount → fee → you receive), mid-market-rate honesty framing ("what others charge" one tap deep, not in your face), money as the biggest type on screen. This is the direct model for `FeeMathSheet`.
Avoid: the playful lime-green brand energy — right for casual money transfers, wrong for a crash on the E-75.

**2. GOV.UK / NHS design system (content discipline).**
Borrow: one thing per page, questions as page titles ("Is anyone hurt?"), full-sentence buttons, no decoration where information works harder, and one obvious start entry. The Help Now flow is structurally a GOV.UK service in a navy coat.
Avoid: the deliberate visual austerity — on a consumer trust product it reads as budget cuts; IDA needs warmth GOV.UK refuses on principle.

**3. Uber (trip status = case status).**
Borrow: the single status sentence with a live expectation ("Your driver arrives in 3 min") — the strongest consumer training ever done for "who has the ball + when." `NextStepCard` is this pattern applied to a claim. Also: the quiet confidence of showing work happening without asking for engagement.
Avoid: map-centricity, surge-style urgency colors, rating prompts after every interaction.

**4. EmergencyPlus / Echo112-class emergency apps.**
Borrow: giant single-purpose buttons that work with wet hands and 5% battery, emergency numbers with country auto-detection, zero onboarding before utility, high-contrast one-column layouts. HN-1/HN-2 sit in this lineage.
Avoid: the utilitarian ugliness — these apps look like fire extinguishers; IDA's emergency mode should feel like a competent hand on the shoulder, not an alarm panel.

**5. TurboTax (interview flow + read-back).**
Borrow: one-question-per-screen interviews that make dread feel finishable; the "here's what we found" read-back that converts data entry into perceived expertise; progress statements in human language. CP-1 is a direct descendant.
Avoid — emphatically: the dark-pattern upsell machinery (fake "free" paths, guilt screens, upgrade ambushes). IDA's CP-3 fork with equal-dignity options is the explicit counter-design; any push toward "improving conversion" with asymmetric styling gets rejected in review.

**6. Remitly / diaspora remittance apps.**
Borrow: the corridor as a first-class object ("Germany → Kosovo" as the header of the experience), delivery promises with dates ("arrives Tuesday"), bilingual comfort without siloing either language, trust signals through local specificity (bank names, pickup locations the user's family recognizes). Trip Mode's corridor setup and the gift-membership flow (future) are remittance patterns.
Avoid: promo-rate carnival (countdown timers, slashed prices, referral confetti) — the exact aesthetic that makes Balkan users suspect a scam.

**7. AirHelp / Flightright (claims eligibility).**
Borrow: the 30-second eligibility check as an acquisition wedge; band-plus-amount results ("You could be owed €400"); flight-number-first minimal input. VN-1/VN-2 preview follows this.
Avoid: the over-promising result framing (amounts presented as near-certain), aggressive email cadence after a check, and burying the fee until deep in the flow — IDA shows fee math _at_ the agreement screen, which is a differentiator worth designing loudly.

**8. Monzo (plain-language money states).**
Borrow: notification copy that sounds like a person; the feed of small honest receipts; error states that explain instead of apologize.
Avoid: emoji-forward tone and hot-coral branding energy; also avoid its engagement-loop instincts (streaks, summaries) — IDA is an app you should _not_ need weekly.

**9. Apple Wallet (the offline artifact).**
Borrow: the document-as-card mental model — a boarding pass is trusted _because_ it looks final, lives offline, and glances well. The Claim Pack, bilingual EAS, and Green Card checklist should feel Wallet-grade: crisp, bordered, obviously save-able, obviously yours. This is the single most important visual reference for making free outputs feel valuable.
Avoid: skeuomorphic textures; the pass metaphor's rigidity for multi-page documents.

**10. Genius Scan / PhotoMath-class camera guidance.**
Borrow: ghost overlays and edge-detection affordances that make "photograph this correctly" a game a shaking hand can win; auto-advance on capture; the reassuring shutter-to-thumbnail confirmation beat. EC-2's camera coach lives here.
Avoid: feature-creep toolbars (filters, crop modes) inside the guided flow — one shot type, one overlay, next.

**11. DoNotPay (cautionary reference).**
Borrow: the instant-document-generation moment — the feeling of walking away with a real artifact after two minutes.
Avoid: everything else — the "robot lawyer" framing is the anti-IDA. Automation presented as the lawyer destroys exactly the trust the `ReviewBadge` pattern builds; IDA's machine drafts, humans stand behind. This reference exists so the team can point at what we are not.

**12. Deutsche Bahn Navigator / DB disruption handling (expectation management under failure).**
Borrow: the disruption pattern — when things go wrong, show the new plan, not an apology ("Delayed → new connection at 14:32"). The overdue-insurer state in `NextStepCard` ("They missed the deadline. We escalated on {date}") is DB's re-plan pattern applied to counterparties.
Avoid: information density that requires commuter expertise; IDA members are one-time users of their claim, never power users.

---

## 2. Visual Principles for Interdomestik

_(Consolidates dossier §6 into designer-operational rules; tokens to be formalized in Figma.)_

**Typography.** One humanist sans (Inter-class), two weights (Regular, SemiBold). Scale: 34/28 display (rare), 22 section, 20 status-hero (the `NextStepCard` sentence — the brand's true logotype), 17 body-stress, 15 body, 13 metadata floor. Line-height 1.45. Numbers in money contexts: tabular lining figures, SemiBold, one size step above surrounding text — money is always the loudest thing in its container (Wise rule). Dynamic Type to 135% without breakage on stress flows.

**Spacing.** 4pt grid. Component padding 16; card gap 12; section gap 24; screen margins 16/20. One rule that creates the calm: **generous above, tight within** — sections breathe (24+), elements inside a card pack efficiently (8/12). Crowded sections read as panic; scattered card innards read as emptiness.

**Motion.** 150–250ms, ease-out, opacity+transform only. Motion = state change, never ornament. The three sanctioned moments: sheet-up (bottom sheets), tick-confirm (checklist, 150ms scale + haptic), card-transition (progress rail stage advance). Zero animation inside Help Now except tick-confirm. Full `prefers-reduced-motion` support. No parallax, no scroll-triggered theatre, no Lottie mascots.

**Color hierarchy.** Ink navy base (#0F1B2D family) / warm off-white surface (#FAF8F5 family) / **amber = act now, one per screen, mechanically enforced** / signal green = progress & "nothing needed" / red = emergency calls only (HN-2), never errors / muted slate = metadata, ReviewBadge, boundaries. The palette's job: the app should look _mostly handled_ — amber scarcity is the product promise rendered chromatically.

**Emergency-mode treatment (HN-1–4).** Chrome drops to a close affordance; contrast to AAA; type up one step; targets ≥88pt on decisions; single column; the four situation pictograms are the only large graphics in the app (48pt, 2px stroke, same language as icons). The mode switch should be _felt_ — entering Help Now visibly sheds everything nonessential, like staff clearing a desk.

**Forms.** Interview pattern (TurboTax/GOV.UK): one question per screen in flows, question as the title, full-sentence option buttons over radio+label ("No one is hurt → continue"), native pickers, inline validation on blur (never on keystroke), errors as instructions ("Enter the date of the accident — it's on the police report") never as blame. No multi-column forms anywhere on mobile. Optional fields don't exist — if it's optional, cut it or defer it.

**Cards.** 1px hairline border, 8pt radius, flat (no drop shadows — hairlines + surface contrast do the separation). Three card ranks: **Hero** (NextStepCard: 20pt status sentence, full-bleed-ish, one action), **Standard** (list items, documents), **Artifact** (Claim Pack, EAS, Green Card checklist — Wallet-grade: slightly heavier border, document-like inner margins, explicit save/share affordances, looks printable). Artifact cards are the free layer's trust currency; give them disproportionate design attention.

**Bottom sheets.** The default container for everything transactional: Fee Math, consent, filters, item actions. Grabber handle, 24pt handle zone, sheet titles in-sheet (context survives), never full-screen unless content genuinely fills it (then it's a screen, not a sheet). Sheets stack max one level. The sheet is IDA's "let's look at this together" gesture — modals interrupt, sheets consult.

---

## 3. Screen-Level Visual Direction (the six flows Figma starts with)

**Help Now (HN-1/2).** Reference blend: EmergencyPlus buttons × GOV.UK question titles. Navy header band with country + offline chip; four situation buttons as full-width rows (pictogram left, label 22pt, chevron none — the row _is_ the button), warm-white ground. HN-2: the red `tel:` button is the only red the user may ever see — full-width, 88pt, number visible on the button. Everything else monochrome ink. No imagery, no illustration, no map.

**Trip Mode (TM-2/3).** Remitly corridor pattern: "DE → KS" as a route header with flag chips and transit dots (reusing `ProgressRail` visual language). Pack list as standard cards with per-country verified-date lines and download states. The downloaded state deserves ceremony-lite: pack card gains a subtle filled check and the "works in airplane mode" line — the moment the app proves it will show up.

**Claim Pack (CP-2).** Apple Wallet artifact treatment: the pack preview renders as a bordered document card stack (cover + pages), paper-white on the warm ground so it reads as _a thing_, not a screen. SemiBold document title, generated date, page dots. Save/Share as the amber action; the fork buttons below in equal visual weight (TurboTax counter-design — audit this screen specifically for asymmetric-dignity violations).

**Next Step (MH-A/CD-1).** Uber status pattern: `ProgressRail` compact on top (5 dots, hairline connectors), the 20pt status sentence as the visual center of the entire product, `OwnerChip` beneath (icon + label, slate), then either the single amber action or the green "Nothing needed from you" state. Overdue variant: sentence swaps per catalog, rail dot gains an ink outline — **no red**, escalation is business-as-usual, which is precisely the trust message.

**Fee Math Sheet (FM-1).** Wise receipt, verticalized: preset amount chips on top, then the arithmetic column — recovered (17pt) → success fee with tier label (17pt, slate) → hairline → **you receive (28pt SemiBold, ink)**. The structural "Recover nothing → pay nothing." line sits below in a bordered quiet box (not a warning box — a promise box; same hairline language as artifact cards). Entity/governing-law footer in 13pt slate. No icons, no illustration: arithmetic _is_ the design.

**Agreement Ceremony (AC-1–4).** The visual register shifts formal-calm: margins widen (20→24), pace slows (one concept per screen), the handler photo appears (real photo, 48pt circle, name + role). AC-3's signature area: paper-white panel, hairline border, generous whitespace — signing should feel like a clean desk, not a checkout. AC-4 confirmation borrows the artifact treatment: the signed pack renders as a Wallet-grade card dropping into the Vault (the one sanctioned card-transition moment). No confetti — the emotional payoff is the next-step sentence already set: "We file with {insurer} by {date}."

---

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
