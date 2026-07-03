---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/mobile-experience-blueprint.md
  - docs/product/2026-07-03-mobile-program-authority-packet.md
  - docs/product/2026-07-03-mob-dg01-help-now-trip-mode-gate-packet.md
  - docs/product/2026-07-03-mobile-component-contracts.md
  - docs/product/2026-07-03-mobile-legal-compliance-input-templates.md
  - docs/product/2026-07-03-mob-execution-sequence.md
  - docs/product/2026-07-03-mobile-copy-system.md
  - docs/product/2026-07-03-mobile-excellence-dossier.md
  - docs/product/2026-07-03-mobile-visual-benchmark-moodboard-brief.md
---

# Enterprise Mobile Design Review — Interdomestik IDA (pre-MOB-DG01) — Part 2

> Status: **Review input only — no implementation authority, no scope expansion, no runtime work proposed before M0→M5 closeout and MOB-DG01 promotion.** Items marked "future, not launch" are explicitly out of current scope. This review evaluates the nine-document design package as a whole.

Part 2 of [2026-07-03-mobile-design-review-enterprise.md](./2026-07-03-mobile-design-review-enterprise.md).

## 10 Details That Would Make It Feel Premium

1. Tabular SemiBold numerals one size up for every money figure — everywhere, no exceptions.
2. The haptic-paired checklist tick (150ms) — completion you can feel with the phone at your side.
3. Hairline borders + surface contrast instead of shadows — flat, printed, certain.
4. "Verified for {country} · {month yyyy}" lines on guidance — dated competence.
5. Timestamp chips on evidence photos ("14:32 · saved on your phone").
6. Consistent 48pt circle handler photos with real, identically-cropped portraits (or none at all — see verdict).
7. Document inner margins on Artifact cards that mimic A4 proportions — subliminal "this prints."
8. The staged claim-pack progress copy ("Checking Kosovo deadlines…") — 3 seconds of visible diligence.
9. Overdue states in ink outline, never red — escalation as routine competence.
10. Side-by-side bilingual EAS with perfectly aligned field pairs — the screenshot that sells the app in a family group chat.

## 10 Details That Would Make It Feel Cheap or Untrustworthy

1. Shimmer skeletons or any spinner (an apology in motion).
2. Struck-through prices and promo mechanics anywhere near the fee sheet.
3. Stock photos — one handshake image undoes the entire trust architecture.
4. "AI-powered" as a feature label.
5. Emoji in product copy; icons without labels.
6. Low-res, inconsistently cropped, or obviously-stock handler photos (worse than no photos).
7. English strings leaking into sq/mk/de surfaces.
8. A wrong emergency number (fatal, not cosmetic — this is why L2 exists).
9. Toast notifications for legally meaningful events (consent, signature, revocation deserve screens).
10. Two amber elements on one screen — instant visual panic, instant review fail.

---

## Board-Level Verdict: **NEARLY READY**

**Ready:** the design _system_ — IA, component contracts, copy grammar, trust architecture, performance budgets, governance discipline. This package is unusually complete for a pre-gate program; the contracts-first approach means MOB-DG01 can promote against fixed design APIs rather than mood. The thinking is done.

**Not yet ready, in order of criticality:**

1. **Two business decisions gate the money surfaces:** what "no win, no fee" means when an expert was paid on a lost case (blocks MOB-05a's promise line), and the handler model (named humans vs. case team — changes copy keys and two flows). Both are paragraphs from leadership, not design work — but nothing money-adjacent should be promoted until they're written down.
2. **The artifact layer is a concept without a template.** Claim Pack / signed pack / EAS PDF design is the convergence point of enterprise credibility, partner confidence, and consumer value — and it's unbuilt. One design sprint.
3. **KS content dossier + L2 sign-off** — the long pole for shipping MOB-01 non-dark; entirely startable today, entirely outside the tracker.
4. **Hi-fi Figma work has not begun**; the moodboard brief is hand-off ready, so this is calendar, not uncertainty.

None of these touch repo authority: M0→M5 closeout and MOB-DG01 remain the only gates to build. Verdict rationale: a program is "ready" when the remaining work is execution with known shape. Items 2–4 are exactly that; item 1 is the only unknown-shape risk, and it's a decision, not a discovery.

## Missing Artifacts Before MOB-DG01 (consolidated, all preparable now, none requiring authority)

1. PDF/artifact templates (Claim Pack, bilingual EAS; signed-pack template can trail to MOB-DG05).
2. KS country content dossier → L2 sign-off (then MK/AL/transit).
3. Figma hi-fi for HN-1..5, TM-1..4, EC-1..3, CP-1..3 per the moodboard brief (MOB-DG01 flows first).
4. Unified error taxonomy one-pager.
5. Screen-reader flow scripts (HN car path minimum).
6. Pictogram comprehension check (10 users, sq/mk, one afternoon).
7. Account "Legal & company information" content spec.
8. Sponsor aggregate-report template + operational-maturity fact sheet (Lens-3 sales artifacts).
9. The two business-decision memos (expert-cost-on-loss; handler model).
10. PWA-vs-store decision memo with a named owner and date.

_(Already listed in the dossier and still open: transition-matrix→sentence catalog spreadsheet — needed at MOB-DG03, not DG01; notification choreography spec — same.)_
