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
---

# Interdomestik IDA — Mobile Excellence Dossier — Part 5

> Status: **Design/product preparation only — no implementation authorized.** M0→M5 is not fully closed (final `T-503` closeout outstanding; `activeSlice=null / blocked_requires_current_authority`). This dossier proposes no changes to proxy, routing, auth, session, tenancy, billing provider, VONESA runtime, SVC, CQRS, or tracker authority. Everything here is consumable by design gates (`MOB-DG01` onward) after M0→M5 closeout and fresh current-authority resolution.

Part 5 of [2026-07-03-mobile-excellence-dossier.md](./2026-07-03-mobile-excellence-dossier.md).

## 10. Final Execution Package

**Recommended first three promoted slices after M0→M5 closeout** (unchanged from the execution sequence, now with proof obligations):

**1. `MOB-01` — Help Now + Trip Mode (gate: MOB-DG01, packet ready).**
Must prove: the §7 free-surface budgets in CI; airplane-mode functionality; zero-PII and SW-allowlist guard tests; clarity-marker-only copy; funnel events live; ≥1 country (KS) shipped with L2 sign-off, others dark; bundle local-only guard.
Legal inputs needed: **L2 (KS at minimum — start today)**; L2 transit countries for Trip Mode corridors.

**2. `MOB-05a` — Fee Math Sheet, display layer (gate: MOB-DG02).**
Must prove: math delegates to `c02` (zero arithmetic in component, unit-tested against calculator fixtures); "recover nothing → pay nothing" structurally unremovable; T-407 entity/law footer present in every context; works offline; `fee_sheet_viewed` instrumentation; L5-reviewed keys or reviewed-draft placeholders with a copy-swap blocker recorded before public exposure.
Legal inputs needed: **L5** (start now; also resolves the §9 stacking/VAT questions); the **expert-cost-on-lost-case business decision** (§9 — decide before this gate, the sheet's promise line depends on it).

**3. `MOB-02` — Case companion / Next Step read model (gate: MOB-DG03).**
Must prove: outbox-only read model (no writer reads — architectural test); every post-T-503 transition-matrix cell has a status sentence in sq/mk/en (catalog completeness check in CI); exactly-one-next-step invariant as a rendered-output test; overdue variants fire from state, not staff memory; `T-104h` erased rendering; §7 member-surface budgets; notification permission choreography.
Legal inputs needed: expectation-date phrasing review (L5 lineage); `g09` ops-SLA reconciliation (the §9 "teeth" requirement — every "we do X by {date}" backed by an ops commitment).

**Design artifacts still missing (produce before the respective gates; none require implementation):**

1. Hi-fi screen mocks for §3 flows (Figma), starting HN-1..5, CP-1..3, FM-1 — needed for MOB-DG01/DG02 review and visual-regression baselines.
2. Country content source dossiers (KS/MK/AL + transit): the researched raw content L2 reviewers sign — the actual long pole.
3. Post-T-503 transition-matrix → status-sentence catalog spreadsheet (every cell × 3 locales) — feeds MOB-02's completeness check.
4. Bilingual EAS asset (official field semantics, de+sq / de+mk pairing) for L2 review.
5. Notification choreography spec (prompt timing, fallback channels, cold-render contract) — one page, feeds MOB-DG03.
6. PWA-vs-store decision memo (§2 audit gives the UX contract either way; the distribution decision needs a business owner and a date).
7. Fee "total-cost worked example" design for AC-2 (resolves §9 stacking critique) — feeds MOB-DG02/DG05.
8. Handler-model ops decision (named humans vs. case team, §9#1) — one paragraph from ops, but it changes copy keys everywhere.

**Can be prepared now without implementation (no authority needed):** everything in the artifact list above; L1/L2/L3/L5 legal intake (templates ready); sq/mk/de translation of Help Now content; contract fixtures for the four MOB-01 components (design-tool level); the §7 budget numbers wired into gate-packet language; the §8 event dictionary reviewed by whoever owns analytics.

**Must wait for authority:** any code including the SW config and CI budget checks themselves; schema work (consent records); message-key files in the repo; store/PWA packaging; any VONESA or agent surface beyond the previews in §3.10–3.11; and — restated once more — every runtime slice, which enters work only through fresh current-authority resolution and its recorded design gate.

---

_Dossier thesis: the blueprint's trust machinery is sound; what this dossier adds is the enforcement layer — budgets that make speed contractual, copy that survives adversarial reading, conversion that never leans on stress, and a red-team list whose top item is not a design question at all but a business one: decide what "no win, no fee" means when an expert has been paid. Answer that, sign off KS content, and MOB-01 is ready the week the tracker unblocks._
