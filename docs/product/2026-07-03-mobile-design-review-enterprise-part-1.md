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

# Enterprise Mobile Design Review — Interdomestik IDA (pre-MOB-DG01) — Part 1

> Status: **Review input only — no implementation authority, no scope expansion, no runtime work proposed before M0→M5 closeout and MOB-DG01 promotion.** Items marked "future, not launch" are explicitly out of current scope. This review evaluates the nine-document design package as a whole.

Part 1 of [2026-07-03-mobile-design-review-enterprise.md](./2026-07-03-mobile-design-review-enterprise.md).

---

## Lens 1 — Enterprise Credibility

**Overall: credible on paper; three exposure points.**

The package's enterprise strength is structural: fee math before signature, audit-trailed ceremonies, staff-gated escalations, consent records, erasure-aware rendering. These are the things a diligence reviewer actually checks, and they're contractual, not aspirational.

Exposure points:

1. **The warmth can tip into consumer-cute.** Warm off-white + amber + rounded cards is one bad execution decision away from "friendly fintech toy." The counterweight is the Artifact card rank — if the Claim Pack and signed-agreement PDFs look like documents a lawyer would file (real document typography, dense headers, reference numbers), the whole product reads serious. If they look like styled screenshots, nothing else will save it. The PDF templates are therefore credibility-critical, and they don't exist yet (see missing artifacts).
2. **No regulatory surface.** Enterprise-serious European apps carry an imprint: legal entity, registration number, supervisory context, complaint path. `T-407` puts entity+law in fee footers, but the package has no Account-level "Legal & company information" content spec. It's a content page, not a feature — specify it now, ship it with the member shell. A diaspora buyer in Germany _will_ look for an Impressum-equivalent; its absence is disqualifying in that market's trust grammar.
3. **"We'll take it from here" needs a German-market legal read.** In sq/mk the promise reads protective. In de, sweeping service promises from a non-lawyer entity brush against legal-services regulation sensitivities (RDG-adjacent perception). Add the promise line and its de rendering to the L5 review explicitly — wording, not concept, is the fix.

Bureaucratic risk (the opposite failure) is well-defended: one-sentence statuses, GOV.UK question pattern, no forms with optional fields. Aggression risk is defended by silence discipline and no-scene-selling. The remaining aggression vector is the _timeline_: "We chased them — 2nd reminder" entries must stay factual; if ops copy drifts into combative ("We demanded…"), enterprise partners reading a shared case file will wince. Add timeline verbs to the copy-review checklist.

## Lens 2 — Consumer Trust (the 30-second test)

**Stressed member:** passes on design — HN-1 is one tap away, four buttons, offline, local emergency number visible. The single weakest first-30-seconds element is **brand unfamiliarity**: "Interdomestik IDA" means nothing to a first-time user standing beside a dented car. MH-C leads with the promise, but the physical-anchor footer (address, phone, real company) is below the fold. Move one trust anchor above the fold on MH-C: the hotline number itself, visible without scrolling. A phone number a stressed person could call instead is the deepest reassurance this market understands — and it costs one line.

**Older parent:** 17pt stress body, 88pt targets, full-sentence buttons all pass. Two gaps: (a) pictogram comprehension is assumed, not tested — run a 10-person sq/mk comprehension check on the four situation pictograms before Figma finalizes them (a cheap Step-0 task); (b) the launcher should tolerate "call me instead" behavior — the hotline pill on every HN screen covers it, keep it sacred.

**Diaspora buyer:** Trip Mode + bilingual EAS + de locale is the right kit. The trust risk is **over-promising offline**: "Even airplane mode can't stop it" is charming until an OS evicts the pack at a Serbian border crossing. The integrity re-check at "road-ready" is specified — make its failure state a designed screen (re-download prompt with size and time), not a toast. A broken promise with a graceful recovery is survivable; a silent one isn't.

**Manipulation audit:** the package is clean — with one exception to remove. The dossier's concession line for repeat free users ("Third time here — membership would have covered all of these") is guilt-adjacent scorekeeping and contradicts the equal-dignity principle. Cut it entirely; the CP-3 fork does the honest work. Repeat pack generation is a _success_ signal (word-of-mouth utility), not a leak to plug.

**Overpromise audit:** "You're in time" (flagged in dossier §9, mitigation stands); "Confirmed within 1 business day" (ship-gate staffing check stands); eligibility bands with reasons (sound). No further findings.

## Lens 3 — Sponsor / Partner / Agent Confidence

What each audience actually inspects, and where the package stands:

**Company/diaspora-association sponsor:** cares about (a) member privacy proof — negative-test enforcement is specified and is a genuine differentiator; put it in words a sponsor can read ("Sponsors technically cannot access individual cases — verified by automated tests every release") in the sponsor agreement pack; (b) activation smoothness for a roster; (c) the monthly aggregate report. The report is manual-email for the first 5 groups (right call), but its **template design** is a proof point that costs a day and signals operational maturity — prepare it now (design artifact, no runtime).

**Partner lawyer:** touches the product through case-scoped invites (desktop) and the **signed-pack PDF**. The PDF is their entire impression of IDA's seriousness: reference numbers, signature evidence block (method, timestamp, policy versions), document manifest, paginated exhibits. This is the same PDF-template artifact as Lens 1 — double-billed importance.

**Agent network:** cares about activation speed and commission legibility. AG-1..3 preview is adequately specified under OMG gating. One confidence addition that costs nothing: the sale-confirmation screen states what the member sees next ("Welcome SMS sent — they can open their card now"), because agents live or die by not being called back with "nothing arrived."

**Missing for this lens (prepare-now, no runtime):** a one-page "operational maturity" fact sheet for sponsor/partner conversations — SLAs, privacy enforcement, audit trail, complaint path — assembled from claims the ship-gate actually enforces. Sales will improvise one anyway; better it quotes the real gates.

## Lens 4 — Mobile Craft Quality

| Dimension           | Verdict                                     | Finding                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thumb reach         | **Strong**                                  | Bottom-60% contract + redline page in Figma brief. No change.                                                                                                                                                                                                                                                                                                                                            |
| Motion restraint    | **Strong**                                  | Three sanctioned moments; zero-animation Help Now. No change.                                                                                                                                                                                                                                                                                                                                            |
| Perceived speed     | **Strong**                                  | No-spinner rule, exact-layout skeletons, the sanctioned 3s pack beat.                                                                                                                                                                                                                                                                                                                                    |
| Empty/loading/error | **Gap**                                     | States are specified per-screen but there is no **unified error taxonomy** (offline vs. server vs. stale vs. permission). Without it, five engineers will ship five error dialects. One-pager needed: 4 error classes × pattern × copy key namespace.                                                                                                                                                    |
| Dynamic type        | **Gap (small)**                             | 135% variants required only for HN-1/CP-1/MH-A/FM-1 in the Figma brief. Add AC-1..4 — the ceremony is exactly where older members increase text size, and a broken signature screen at 135% is a trust catastrophe.                                                                                                                                                                                      |
| Accessibility       | **Gap (small)**                             | VoiceOver/TalkBack pass is a ship-gate line, but no **screen-reader flow scripts** exist (what the HN car path should _sound_ like, in order). Script the top 3 flows before build; retrofitted SR order is always worse.                                                                                                                                                                                |
| Offline behavior    | **Strong for MOB-01; undefined for MOB-02** | Help Now offline is exemplary. But a member tapping "Upload" or "Approve" while offline has no defined pattern. Rule to adopt at MOB-DG03 (not new scope — a constraint): member-surface writes when offline are **explicitly rejected with a retry affordance** ("You're offline — we'll hold this and remind you"), never silently queued; silent queues on legal/consent actions are an audit hazard. |
| Camera UX           | **Strong**                                  | Permission-denied fallback, low-light state, file-picker fallback flagged in red-team. Test matrix on real low-end devices remains an execution duty.                                                                                                                                                                                                                                                    |
| Bottom sheets       | **Strong**                                  | Single-level stack, sheet-vs-screen rule. No change.                                                                                                                                                                                                                                                                                                                                                     |
| Document artifacts  | **Strongest idea, weakest artifact**        | Wallet-grade treatment is specified everywhere, but no actual PDF/artifact template is designed. This is the #1 missing artifact (Lenses 1–3 all converge on it).                                                                                                                                                                                                                                        |
| PWA/install moments | **Adequate**                                | Value-first install contract is right; the PWA-vs-store memo remains a named missing decision with a business owner.                                                                                                                                                                                                                                                                                     |

## Lens 5 — Commercial Viability

**Converts well:** the CP-3 fork (motivation + information peak); Trip Mode → seasonal membership line; the shareable artifacts (pack, bilingual EAS) as zero-CAC distribution; later, VONESA eligibility (the proven wedge pattern in this category).

**Too generous?** No. The letter template in the free pack is the only candidate, and the existing measurement rule (gate it only if pack→member <3% at 90 days) is the correct governance — generosity with a tripwire, not faith.

**Too cautious — one real finding:** membership is _pushed_ in only three places (correct) but its _availability_ is under-designed. A €20/year product should be buyable in two taps by someone already convinced — the Account tab's Membership page must be a complete, self-serve purchase path from day one of the member shell (it's already in the IA; this review marks it as conversion-critical, not settings filler). Convinced users failing to find the buy button is avoidable revenue loss. Additionally the 30-day money-back guarantee — a paid trust asset — appears nowhere in the designed surfaces; add it to CP-3 and the Membership page (copy, not scope).

**Trust-first choices that cost short-term conversion and are worth it:** equal-dignity fork (lower immediate take-rate, higher pack-sharing and return intent); no scene-selling (loses the desperation purchase, wins the family recommendation — in a market that runs on family recommendation); silence discipline (fewer re-engagement conversions, dramatically lower uninstall/annoyance); staff-gated recovery offers (slower recovery revenue, but every recovery client arrives pre-trusting, which shows up in ceremony conversion >85% and disputes ≈0). The measurement plan already instruments each of these trade-offs; hold the line when a growth review inevitably challenges them.

---

## Top 10 Enterprise/Mobile Improvements (all within existing scope)

1. **Design the PDF/artifact templates** (Claim Pack, signed pack, bilingual EAS) to filing-grade quality — the single highest-leverage missing piece (Lenses 1, 3, 4).
2. **Specify the Account "Legal & company information" page** (imprint-equivalent: entity, registration, addresses, complaint path) — content spec now, ships with member shell.
3. **Unified error taxonomy one-pager** (4 classes × pattern × copy namespace) before any build.
4. **Add AC-1..4 at 135% Dynamic Type** to the Figma brief's required variants.
5. **Hotline number above the fold on MH-C** (one line; deepest first-30-seconds reassurance for this market).
6. **Cut the "third pack" nudge line** from the dossier's conversion notes — guilt-adjacent, contradicts equal-dignity.
7. **Offline-write rejection rule for member surfaces** (explicit hold-and-remind, never silent queue) — adopt as a MOB-DG03 constraint.
8. **Screen-reader flow scripts** for HN car path, CP read-back, FM sheet — before build, not after.
9. **Add the promise line's de rendering + timeline verbs to L5 review scope** (RDG-perception check; factual chase language).
10. **Design the sponsor monthly aggregate report template + one-page operational-maturity fact sheet** (sales artifacts quoting real gates; no runtime).

## Top 10 Things Not To Change

1. Amber scarcity (one action color, one per screen, mechanically enforced).
2. The Next Step invariant — exactly one step, one owner, one date, no silent states.
3. The equal-dignity CP-3 fork — the anti-TurboTax position is a brand asset.
4. Zero sales content in Help Now, permanently, with its zero-target metric.
5. ReviewBadge as human-presence framing (never "AI-powered", never scores).
6. The structural "recover nothing → pay nothing" line rendered by the component, not the caller.
7. Offline-first Help Now with the no-spinner absolutism.
8. The Wallet-grade Artifact card rank concept (execute it — see improvement #1 — but the idea is right).
9. Silence discipline (≤1 meaningful notification per 30 idle days) and no engagement mechanics.
10. Status-sentence catalog grammar with mandatory overdue variants — copy as a finite, reviewable system.
