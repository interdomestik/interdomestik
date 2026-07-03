---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-excellence-dossier.md
  - docs/product/2026-07-03-mobile-design-review-enterprise.md
  - docs/product/2026-07-03-mobile-legal-compliance-input-templates.md
---

# Business Decision Memo Templates (pre-MOB-DG01)

> Status: **Decision templates — no implementation authority.** Two one-page memos for leadership to complete. Each decision is a paragraph of business will, but it changes copy keys, components, and legal review scope downstream — which is why both must be signed before the money-adjacent gates (MOB-DG02 for Memo 1; MOB-DG01 Figma finalization for Memo 2). Fill, date, sign, commit the completed memo alongside this template.

---

## Memo 1 — What "No Win, No Fee" Means When Expert Costs Exist

**Decider:** ___ (CEO/managing director) · **Consulted:** counsel (L5 owner), finance · **Due:** before `MOB-DG02` (Fee Math Sheet promotion) · **Status:** ☐ open

**The question.** A member's case escalates; an independent expert is engaged (cost approved via ProposalCard, e.g. €200). The recovery fails. Does the member owe the €200?

**Why it can't wait.** The Fee Math Sheet structurally renders "Recover nothing → pay nothing." If that sentence has an asterisk, the asterisk must be designed in from the first render — retrofitting an exception onto a shipped absolute promise is the single most trust-destructive move available to this product. The answer also feeds L5 (fee wording), the AC-2 total-cost example, and the ProposalCard cost framing.

**Options.**

**A — Absolute promise: Interdomestik absorbs expert/court costs on lost cases.**
UX consequences: the promise line ships as written, everywhere, no qualifiers; ProposalCard costs are framed "covered if we don't recover"; strongest possible conversion and word-of-mouth asset; AC-2 stays one screen.
Legal/commercial risk: direct cost exposure per lost escalated case (est. €150–600/case `[finance to quantify]`); creates an internal incentive to under-escalate weak-but-just cases; predictable P&L drag scaling with escalation volume — but also a powerful reason staff gates (`s08`) exist.
Mitigations: expert engagement already requires staff review; cost cap per case; expert-cost line item in success-fee pricing.

**B — Qualified promise: success fee waived on loss; approved third-party costs remain member-payable.**
UX consequences: the structural line changes product-wide to a two-part sentence ("No recovery — no fee to us. Approved expert costs are separate, and we ask before every one."); ProposalCard must show the member's worst case explicitly ("If we recover nothing, this €200 is your cost"); AC-2 gains the worst-case row; FeeMathSheet contract gains a `thirdPartyCosts` slot. Honest, heavier, colder.
Legal/commercial risk: lower cost exposure; conversion cost at the ceremony (measurable via `agreement_ceremony_abandoned`); every lost case with expert costs becomes a collections conversation with an already-disappointed member — reputational cost concentrated exactly where word-of-mouth is made.

**C — Hybrid: costs absorbed up to a cap (e.g. €300) / above cap member-approved as at-risk.**
UX consequences: promise line survives for the common case; ProposalCard shows "covered" vs "at your risk" states; most complex to explain — needs one extra sentence everywhere B needs one.
Risk: cap management overhead; edge-case disputes at the cap boundary.

**Recommended default: A**, with a per-case cost cap and quarterly review of the absorption line. Rationale: this product's entire differentiation strategy is trust arithmetic; A is the only option whose sentence fits in one breath, and the staff escalation gate already controls the exposure. If finance vetoes A, take C with the cap stated in the ProposalCard — never silently.

**What changes per answer.** A: nothing — package ships as designed. B: FeeMathSheet contract + copy system `fees.*` catalog + AC-2 spec + ProposalCard contract + L5 scope, ~2 design days + re-review. C: same surfaces as B, lighter touch + cap governance doc.

**Decision:** ☐ A ☐ B ☐ C · Cap (if A/C): €___ · Signed: ___________ · Date: ___ · Recorded in: `docs/product/` follow-up note.

---

## Memo 2 — Named Handler vs. Case Team Model

**Decider:** ___ (ops lead) · **Consulted:** product, HR/staffing · **Due:** before MOB-DG01 Figma finalization (handler presence decides two flows' layouts) · **Status:** ☐ open

**The question.** Member-facing surfaces name a specific human ("Ana, your handler," photo, reply SLA) at case handoff, ceremony, and messaging. Can operations guarantee, at launch volume: (a) stable assignment (same person across a case's life, ≥90% of cases `[ops to confirm feasible threshold]`), (b) replies within the stated SLA under that person's name, (c) coverage for leave/turnover without silent identity swaps?

**Why it can't wait.** The named human is the #2 ranked trust signal for this market (dossier §1) and the #1 detonation risk (design review, Lens 1/red-team): a named person who never answers, or whose name silently changes mid-case, is worse than no name at all. The answer changes AC-1's layout, MH-A's secondary row, message headers, and the `review.*` / handler copy keys.

**Options.**

**A — Named handler (full pattern):** photo, first name, personal reply SLA on AC-1, MH-A, messaging.
Requires: assignment stability, per-handler SLA tracking, a designed _handover moment_ when the handler genuinely changes ("Your case moved to Blerim — he has the full file," in the timeline, never silent).
Risk: staffing reality breaks the promise → concentrated trust damage; personal-name exposure of staff to frustrated members `[HR to weigh]`.

**B — Case team with named ceremony presence:** surfaces say "your Interdomestik team" with a _team_ SLA; the ceremony (AC-1) and proposals still carry the _reviewing individual's_ name (a signature-level fact, not a relationship promise).
UX consequences: MH-A "Message Ana" becomes "Message your team"; slightly colder home; ceremony keeps the human-stands-behind-this moment where it legally matters anyway.
Risk: loses the relationship warmth differentiator; generic "team" language drifts toward the insurer-speak the product defines itself against.

**C — Staged: launch with B, upgrade to A per branch when that branch demonstrates 2 consecutive months of assignment stability + SLA compliance** `[ops metrics to define]`.
UX consequences: both variants designed now (they share anatomy — name slot filled vs. team label); copy keys parameterized from day one; the upgrade is a config change, not a redesign.
Risk: two variants to maintain; mixed experience across branches during rollout (acceptable: members see one branch).

**Recommended default: C.** It keeps the launch honest against unknown ops reality, preserves the option value of the strongest trust signal, and makes the named-handler pattern something a branch _earns_ — which is also a healthy internal incentive. Design both variants in the MOB-DG01/DG03 Figma work (marginal cost: one layout variant + parameterized keys).

**What changes per answer.** A: package as designed + handover-moment screen (add to MOB-DG03 scope note). B: AC-1/MH-A/messaging copy keys + remove photo slots; handover moment unnecessary. C: both of the above prepared; per-branch flag governs (flag design is a MOB-DG03 gate note, not new authority).

**Decision:** ☐ A ☐ B ☐ C · Stability threshold (if C): ___ · Signed: ___________ · Date: ___ · Recorded in: `docs/product/` follow-up note.
