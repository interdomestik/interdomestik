---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-program-authority-packet.md
  - docs/product/2026-07-03-mob-dg01-help-now-trip-mode-gate-packet.md
  - docs/product/2026-07-03-mobile-component-contracts.md
  - docs/product/2026-07-03-mobile-legal-compliance-input-templates.md
  - docs/product/2026-07-03-mobile-copy-system.md
---

# Post-M0→M5 MOB-* Execution Sequence (and UI/UX Package Index)

> Status: **Proposed sequence — input only.** Every step below still requires its own fresh current-authority resolution and design gate at execution time. Repo state at authoring: `T-002b` complete; final `T-503` closeout is the remaining M0→M5 blocker; `activeSlice=null / blocked_requires_current_authority`. Nothing here is authorized.

## Package Index (the post-M0→M5 UI/UX execution package)

1. `2026-07-03-mobile-program-authority-packet.md` — program authority input (objectives, slice map, boundaries, ship gates)
2. `2026-07-03-mob-dg01-help-now-trip-mode-gate-packet.md` — prepared MOB-DG01 gate packet (deliverable 1)
3. `2026-07-03-mobile-component-contracts.md` — UX primitive contracts (deliverable 2)
4. `2026-07-03-mobile-legal-compliance-input-templates.md` — legal/compliance intake templates L1–L7 (deliverable 3)
5. this file — execution sequence (deliverable 4)
6. `2026-07-03-mobile-copy-system.md` — copy system + localization rules (deliverable 5)
7. `mobile-experience-blueprint.md` — full UX rationale (background)

## Standing Constraints (repeated because they bind every step)

No `apps/web/src/proxy.ts` changes; no routing/auth/session/tenancy refactor; Paddle-only billing; no runtime VONESA/SVC/CQRS/UI work unless separately promoted; no README/AGENTS/architecture-doc changes without explicit authorization; clarity markers contractual; standing DoD gates on every merge.

## Sequence

**Step 0 — now, parallel to T-503 endgame (no promotion needed):**
Start legal templates **L1** (POA/e-sign matrix) and **L2** (country content sign-off, KS first) immediately — they are the program's long poles. Translate Help Now content (sq/mk/de). Finalize consent-sheet UX review (feeds L3 DPIA). None of this is runtime work.

**Step 1 — M0→M5 closeout:**
Final `T-503` controlled-continuation evidence lands under OBR-DG40; direct destructive `claims.status` removal remains stopped until a later current-authority gate records final qualifying production release-cycle or explicitly approved equivalent evidence. _(Architecture track — not this program's work; the mobile program waits for M0→M5 completion.)_

**Step 2 — fresh current-authority resolution:**
From `activeSlice=null`, register the `MOB-*` namespace; schedule `MOB-DG01`.

**Step 3 — `MOB-DG01` → `MOB-01` (Help Now + Trip Mode):**
Run the prepared gate packet. Build per its scope. Entry criteria: gate preconditions checklist in the packet (incl. ≥1 country L2 sign-off). Exit: acceptance criteria + evidence contract met; tracker closeout. Components delivered: `ReviewBadge`, `EvidenceShotList`, `ChecklistItem` (content variant), `TripModePack`.

**Step 4 — `MOB-DG02` → `MOB-05a` (Fee Math Sheet, display layer only):**
Smallest money-adjacent slice; prerequisites all merged (`c02`, `T-407`, `c04`). Entry: L5 wording review at least in "reviewed draft" state (component may build against placeholder-reviewed keys; final copy swap before public exposure). Components: `FeeMathSheet`. No writers, no signatures.

**Step 5 — `MOB-DG03` → `MOB-02` (case companion / Next Step read model):**
Entry criteria: post-`T-503` status authority is the only stage source; outbox-only read model per Rev 22 constitution; `g09` SLA reality check on expectation-date copy. Components: `NextStepCard`, `OwnerChip`, `ProgressRail`, `TimelineEvent`, `ProposalCard` (render-only). This is the largest single UX step; consider splitting read-model (5a) and notification deep-links (5b) at the gate.

**Step 6 — `MOB-DG04` → `MOB-03` (vault + consent sheets):**
Entry criteria: L3 DPIA signed for medical scope (car/property document paths may proceed on a partial gate if the DPIA lags — the gate decides the split); consent-record additive migration approved; `ent-tm03/04/05` threat models re-checked against final design. Components: `ConsentSheet`, `ChecklistItem` (document variant).

**Step 7 — `MOB-DG05` → `MOB-05b` (Agreement Ceremony, signature layer):**
Entry criteria: **L1 matrix complete for at least KS/MK/AL**; MOB-03 consent records live; `s08`/`s09` gate integration verified. Components: `SignaturePad`; `ProposalCard` gains approve affordance. This completes the professional-recovery mobile path.

**Step 8 — externally gated programs (their own authority, not this sequence):**

- **WS-F / FLIGHT-*** (VONESA mobile): requires WS-F reauthorization; entry also needs L4 cession wording. Inherits `EligibilityBand`, `LedgerRow`, `FeeMathSheet`, and the finished UX contracts from this package.
- **OMG / MOB-06** (agent companion): requires OMG reauthorization; entry also needs L7 cash policy.
- **MOB-07b** (gift membership): needs L6 tax confirmation + its own gate; Trip Mode content already shipped in Step 3.

**Commercial launch decision:** after Step 7 (Steps 3–7 shipped = the full member mobile spine), run the launch ship-gate checklist in the authority packet §8. WS-F and OMG enhance but do not block member launch.

## Sequencing Rationale

Value-first and risk-last: Step 3 is zero server-side PII, no account, and no upload while still funding the funnel; Step 4 is pricing clarity with no writers; Step 5 is read-only over a settled status authority; Step 6 introduces consent-scoped writes; Step 7 introduces signatures — the highest-stakes step lands when every input (legal matrix, consent records, staff gates) already exists. Each step delivers its components as reusable contracts so later steps compose instead of rebuild.

## Timing Note

The OBR selection rule expires **2026-09-10**. Steps 3–4 are the only ones plausibly inside that window; re-validate selection criteria for later steps against whatever authority succeeds it. The August diaspora corridor is only reachable if Step 3 completes by early August — which depends on T-503 closeout timing plus L2 sign-off speed; if missed, retarget Trip Mode marketing to the winter holiday corridor (no scope change).
