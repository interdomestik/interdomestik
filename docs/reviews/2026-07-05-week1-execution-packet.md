---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
  - docs/reviews/2026-07-05-target-state-enterprise-readiness-audit.md
  - docs/plans/2026-07-03-t503-drop-claim-status-closeout.md
  - docs/product/2026-07-05-mk-help-now-signature-package/README.md
  - docs/product/2026-07-03-business-decision-memos.md
---

# Week-1 Execution Packet — ENT-A01 … ENT-A06

> Status: **Execution input — docs/ops work only.** Every item in this packet is Gate=`none` except where noted; nothing here starts runtime implementation. Owner naming note: Arben Lila is the accountable owner of record for every item until he delegates by name — the packet marks where an external appointment (counsel, reviewer) is itself the first task. §5 states the authority boundary precisely.

---

## 1. ENT-A01 — B2: Staging RBAC/Role-Marker Residual Check

- **Owner:** Arben Lila (accountable + executing; PLAT).
- **Evidence file to update:** `docs/plans/2026-07-05-b2-staging-rbac-residual-check.md`.
- **Target:** 2026-07-10.
- **Reviewer:** none required (verification record, not a change) — but link it from the register row and the next current-authority resolution.
- **Blocker if not completed:** every launch-track decision (audit stop-condition 6); ENT-A15 stays `blocked`.

### What is being checked (the residual, precisely)

From `2026-07-03-t503-drop-claim-status-closeout.md`: after the T-503 merge (main SHA `45cc038b`), CD run `28699456479` passed build/deploy-staging, but **`e2e-staging` failed twice** — attempt 1 (job `85115834639`): **P0.1 role-marker failures on agent and staff staging routes after successful login**; attempt 2 (job `85116379208`): **P0.1 agent marker missing + P0.3 role-add failure**. Rev 89 classifies this as deployment-smoke residual: a launch/live-operationality blocker **only if it reproduces on current main/staging** — several PRs have merged since (`#1287`–`#1298`), so it may already be healed or may be a real staging RBAC defect.

### Procedure

**Environment:** the staging deployment of current `main` (redeploy first if staging is behind main — the check is meaningless against a stale deploy). Record the deployed SHA in the evidence file.

**Roles/sessions tested:** (1) agent login → `/agent`; (2) staff login → `/staff`; (3) the P0.3 role-add flow (the admin/role-grant path the failing spec exercises); (4) member and admin as controls (they passed before — confirm they still do).

**Pass/fail signal:** the canonical page-ready **role markers** on `/agent` and `/staff` after authenticated navigation — the same contractual markers the P0.1 staging specs assert. Residual **reproduced** = marker absent/timeout after successful login on current staging. Residual **closed** = both attempts green.

**Steps:**

1. Confirm staging is on current main; redeploy via the CD workflow if not. Record run URL + SHA.
2. Re-run the failing lane: re-run the `e2e-staging` job on the latest CD run (GitHub → Actions → CD → re-run job), or `gh run rerun <run-id> --job e2e-staging` if job-level rerun is available.
3. Run it twice (the original failed differently on attempts 1 and 2 — flake vs. defect is part of the question).
4. If red: pull the Playwright report artifact; capture the failing spec names, marker selectors, screenshots/traces from the report; note whether failures match the original signature (agent/staff P0.1, P0.3 role-add) or differ.
5. Optional local corroboration if CI results are ambiguous: run the staging-targeted P0 specs from `apps/web` against the staging URL with staging auth state (the repo's staging e2e lane configuration), and attach output.

**Evidence captured in the record:** deployed SHA + CD run URLs; both re-run job URLs with pass/fail; on failure — spec names, marker assertions, screenshots/trace refs, and the signature comparison; on success — the two green job links. Close with one of two dated verdicts:

- **CLOSED:** "Residual not reproduced on `main@{sha}`, two consecutive green `e2e-staging` runs ({job URLs})." → register row A01 → `done(path)`; A15 unblocks (pending A04/A05/A06).
- **REPRODUCED:** "Residual reproduced ({signature})." → launch track halted per stop-condition 6; the fix becomes the next current-authority candidate (architecture lane, not MOB); register A01 → `blocked(fix-slice)`.

### Acceptance criteria

Two same-day `e2e-staging` executions against current-main staging, both dispositioned; the evidence file exists with URLs (not screenshots of URLs); a one-line verdict usable verbatim by the next current-authority resolution.

---

## 2. ENT-A02 — Sign Memo 1 (Expert-Cost-on-Loss)

- **Owner:** Arben Lila (decider, as managing director). Consulted: counsel (when L5 owner appointed), finance (Arben acting until delegated).
- **Evidence file:** completed decision block inside `docs/product/2026-07-03-business-decision-memos.md` (Memo 1) **plus** a dated decision note `docs/product/2026-07-XX-memo1-decision.md` (one paragraph: option, cap, rationale).
- **Engineering:** none.
- **Acceptance criteria:** option box checked (A/B/C), cap amount if A/C, signature + date; the "finance to quantify" cost estimate filled with at least a defensible range; decision note committed.
- **Reviewer:** counsel reads the chosen option's wording implications before L5 kickoff (ENT-A17) — the decision itself needs no reviewer.
- **Target:** 2026-07-17. **Blocker if missed:** MOB-05a (ENT-B01) cannot enter its gate; the Fee Math Sheet promise line stays unbuildable.

## 3. ENT-A03 — Sign Memo 2 (Handler Model)

- **Owner:** Arben Lila (as ops lead of record; delegate to the actual claims-ops lead if distinct).
- **Evidence file:** completed decision block in Memo 2 + `docs/product/2026-07-XX-memo2-decision.md`.
- **Engineering:** none. Input needed: an honest one-line answer to "can we guarantee stable assignment ≥90% today?" — if the answer requires thought, the answer is no, which is exactly what option C is for.
- **Acceptance criteria:** option checked (recommended: C), stability threshold defined if C, signed + dated.
- **Reviewer:** product/design (affects MOB-02/ceremony Figma layouts).
- **Target:** 2026-07-17. **Blocker if missed:** MOB-02 design work (Figma sprint scope) proceeds two-tracked or stalls.

## 4. ENT-A04 — L2 MK Content Sign-Off (workflow defined in §4 below)

- **Owner:** Arben Lila (accountable); **executing reviewer: a licensed North Macedonia lawyer or the MK operations lead with counsel access — appointing this person by name is the day-1 subtask** (target for appointment: 2026-07-08).
- **Evidence file:** completed MK signature package introduced by PR `#1301`, with returned signed PDFs preserved and a content-pack hash recorded before any non-dark exposure.
- **Target:** 2026-07-26. **Blocker if missed:** MOB-01b unreachable; August corridor at risk; the fallback (MOB-05a first) activates per the audit §5.

## 5. ENT-A05 — B6: Content-Pack Hotfix Runbook

- **Owner:** Arben Lila (OPS of record); executing: whoever runs staging deploys today.
- **Evidence file:** `docs/manual/runbook-content-pack-hotfix.md` (or the repo's runbook home) + an exercise record appended to it.
- **Engineering involved:** one staging exercise — publish a deliberately-corrected test pack version, verify: manifest version bump propagates, stale SW cache revalidates (stale-while-revalidate path), dark-flag flip works both directions. Commands: the pack manifest/flag mechanism shipped in PR `#1296` — exercise via the same config change process that MOB-01 used, on staging only.
- **Acceptance criteria:** runbook states trigger conditions (wrong emergency number = severity 1), exact steps, expected propagation time, verification step, and rollback (re-darken); exercise record shows measured propagation time on staging.
- **Reviewer:** platform engineer who merged `#1296`.
- **Target:** 2026-07-20. **Blocker if missed:** non-dark launch blocked (launch blocker B6) even with L2 signed.

## 6. ENT-A06 — B7: Alert Coverage for `/help-now`

- **Owner:** Arben Lila (PLAT of record).
- **Evidence file:** new entry in the `ent-alert*` catalog lineage: `docs/plans/ent-alert15-help-now-public-surface-alert-coverage-2026-07-XX.md`.
- **Engineering involved:** confirm Sentry (d07 lineage) captures `/:locale/help-now` route errors and SW registration/caching failures; add provider alert rules per the `ent-alert11` provider-catalog contract; fire one synthetic test error from staging Help Now and confirm it alerts.
- **Checks:** synthetic error appears in Sentry with route tag; alert rule fires; (post-A07) the on-call ack path works.
- **Acceptance criteria:** catalog doc lists the covered failure modes (route error, SW install fail, cache-guard violation, funnel-event pipeline failure), the provider rules, and the synthetic-test evidence link.
- **Reviewer:** whoever owns the existing Sentry alert catalog entries.
- **Target:** 2026-07-15. **Blocker if missed:** non-dark launch blocked (B7) — a silently broken emergency surface is worse than none.

---

## §4 Detail — MK L2 Sign-Off Workflow

1. **Named owner:** Arben Lila accountable; **MK reviewer appointed by 2026-07-08** (licensed North Macedonia lawyer preferred; alternatively MK ops lead + counsel countersign). The appointment is recorded at the top of the sign-off sheet.
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
