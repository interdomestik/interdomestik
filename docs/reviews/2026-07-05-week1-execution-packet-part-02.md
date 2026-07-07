---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
  - docs/reviews/2026-07-05-target-state-enterprise-readiness-audit.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md
  - docs/reviews/2026-07-07-human-dispatch-message-pack-albanian.md
  - docs/plans/2026-07-03-t503-drop-claim-status-closeout.md
  - docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md
  - docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md
  - docs/product/2026-07-05-mk-help-now-signature-package/README.md
  - docs/product/2026-07-06-mk-reviewer-appointment-intake.md
  - docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/product/2026-07-06-business-memo-signature-intake.md
---

# Week-1 Execution Packet — ENT-A01 … ENT-A06 - Part 2

> Status: Non-authoritative support document.

Back to index: [2026-07-05-week1-execution-packet.md](./2026-07-05-week1-execution-packet.md)

## §4 Detail — MK L2 Sign-Off Workflow

1. **Named owner:** Arben Lila accountable; **MK reviewer appointed by 2026-07-08** (licensed North Macedonia lawyer preferred; alternatively MK ops lead + counsel countersign). Gazmend is the working MK ops/UIUX reviewer candidate; he can close only rows his role/qualification honestly covers. The appointment is recorded in `docs/product/2026-07-06-mk-reviewer-appointment-intake.md`, the reviewer return is guided by `docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md`, and the final appointment is also recorded at the top of the sign-off sheet.
2. **Authoritative sources (the reviewer verifies against, and cites — draft list, reviewer may substitute better):** official North Macedonia police or emergency publications; applicable road-traffic, obligations, and motor-liability insurance sources; the official insurance/Green Card or border-insurance source for North Macedonia; official EAS or accident-statement guidance; and the current roadside-assistance source. Each sign-off row cites source + retrieval date. No shipping on memory.
3. **Reviewer/signatory:** the appointed MK reviewer signs each matrix row individually; the full-pack signature closes the sheet. Corrections are made in the dossier _before_ signature — a signed sheet with pending edits is invalid.
4. **Pack hash binding:** on completion of corrections, the content pack is frozen; compute the manifest hash (same mechanism the shipped pack manifest uses, SHA-256); write it into the sheet's `Pack version/hash` field; **any subsequent content change invalidates the sheet** (re-open, re-sign the affected rows, re-hash).
5. **Emergency-number hotfix path:** the B6 runbook (ENT-A05) is the out-of-cycle path — severity-1 corrections deploy first, re-sign within 48h; the sheet gains a hotfix annex row (change, date, re-signature). The ≤12-month validity cycle stands for routine review; emergency numbers and Green Card status are explicitly exempt from waiting for the cycle.
6. **Non-dark eligibility (all four, none waivable):** (a) sheet complete — all 8 rows signed, dated, sourced; (b) deployed pack manifest hash equals the signed hash; (c) B6 runbook exercised (ENT-A05 done); (d) B7 alert coverage live (ENT-A06 done). Only then may the MOB-01b gate packet cite the pack as exposure-eligible — and the flag flip itself still requires the MOB-01b promotion (§5).

---

## §5 — Authority Boundary Confirmation

**May start immediately (docs/ops, Gate=none, no promotion needed):** ENT-A01 through A14 and A16–A18 as specified — verification records, signatures, runbooks, alert-catalog entries, registers, threat models, checklists, reviews, legal intake, translations, Figma. Also: _drafting_ the MOB-01b gate packet (a document, like the MOB-DG01 packet was).

**Cannot start without CA+DG:** any runtime change — the MOB-01b flag flip itself (even though it's "just config," it changes public exposure and is register-gated as CA+DG), MOB-05a/02/03/05b code, the imprint page's shipped form, `actor_role_on_session` extensions, boundary lint, anything touching schema/RLS/routing/auth/session/tenancy/billing/proxy.

**MOB-01b status: nominated only.** It is _ready for a gate packet to be drafted now_ (all design inputs exist; entry criteria defined), but it has no authority. Drafting the packet this week is recommended so the gate can run same-day once A01/A04/A05/A06 clear.

**Exact artifact required before any runtime implementation:** a merged revision of `docs/plans/current-program.md` (Rev 90 or later) plus the matching `current-tracker.md` row, recording a fresh current-authority resolution from the `activeSlice=null / blocked_requires_current_authority` state and the design-gate decision (proposed ID: `MOB-DG01B`) that promotes exactly `MOB-01b` with its scope and entry-criteria evidence linked. Per the planning-governance policy, nothing else — including this packet, the register, or the audit — constitutes authority.

---

## §6 — Critical-Path Summary (as of 2026-07-05)

**This week (by 2026-07-12):** ENT-A01 executed and dispositioned (the single most important action in the program — see §1); MK reviewer appointed (A04 subtask); A14 placeholder copy review done; both memos circulated for signature; A06 synthetic-alert test run; MOB-01b gate packet drafted (docs-only).

**Next 14 days (by 2026-07-19):** memos signed (A02/A03); A06 closed; A05 runbook written + staging exercise; MK package corrections in review; L5 (A17) and L1 (A18) intake letters sent; A09 findings register + A10 tm10 started.

**Next 30 days (by 2026-08-04):** L2-MK signed and hash-bound (A04); fresh current-authority resolution + `MOB-DG01B` run; **MOB-01b live in MK** (A15) — inside the August corridor window; KPI dashboard on real events (A16); A07 rota + ack test; A08 DPA register; A11 RC checklist; A12 first reconciliation report; A13 CODEOWNERS rule.

**Blocks paid launch (Stage 1):** A01 verdict CLOSED · L2 for every exposed country · Memo 1 + L5-reviewed fee lines · B4 review-SLA validation · B5 imprint page · B6 exercised · B7 live · first reconciliation report · refund E2E · KPI dashboard · RC checklist in use. _(Register rows: A01–A06, A11, A12, A16, B01–B03, B10.)_

**Blocks enterprise scale (Stage 2):** consolidated tenant-isolation proof + role-session coverage on all four surfaces (B07/B08) · pen test passed, highs closed (C04/C05) · DPA register + retention + DSR rehearsal (A08/B09/C08) · DPIA for any medical scope (B17) · L1 + ceremony live (C02/C03) · load test with SLO headroom (C06) · 10 runbooks + game day (B12/B14) · status page + notice procedure (B12) · sponsor privacy negative-tests in kit (C09) · succession note + two-approval rule (A13/B19) · clean monthly reconciliation routine (B10/B15).

**The two dates most worth defending:** 2026-07-26 (L2-MK — the August corridor pivots on it) and 2026-09-05 (ENT-B13 OBR successor — every promotion after 2026-09-10 depends on it).
