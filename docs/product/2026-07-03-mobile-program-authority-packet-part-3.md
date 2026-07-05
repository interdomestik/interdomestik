---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/mobile-experience-blueprint.md
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/plans/architecture-finalization-program-2026-05-29.md
  - docs/plans/vonesa-architecture-integration-2026-05-30.md
  - docs/plans/2026-07-02-obr-dg40-t503-controlled-continuation-authority.md
---

# Mobile Program Authority Packet (Design/Current-Authority Input) — Part 3

> Status: **Input document — design authority only.** This packet defines the governed design intent for the mobile commercial experience. It creates **no execution authority** and promotes **no slice**: every `MOB-*` item below enters the active queue only through a fresh current-authority resolution and a recorded design gate in `docs/plans/current-program.md` / `docs/plans/current-tracker.md`. If this packet conflicts with those documents, they win.

> Post-MOB-01 reconciliation (2026-07-05): this companion part is historical design input. `MOB-01` completed as a dark-pack implementation in PR `#1296` with PR `#1297` accessibility follow-up; the packet checklist and launch gates below are retained as original input, not current authority. Current repo authority expects `blocked_requires_current_authority` / `activeSlice=null` until a later gate promotes one next action.

Part 3 of [2026-07-03-mobile-program-authority-packet.md](./2026-07-03-mobile-program-authority-packet.md).

## 6. Legal / Compliance Inputs to Start Collecting Now

These do not require any promotion and are the long poles; start immediately, in this priority order:

1. **Per-country POA / e-signature validity matrix** (KS/MK/AL + diaspora counterparty jurisdictions DE/CH/AT). Blocks the Agreement Ceremony (MOB-05 signature layer) and the VONESA POA fallback. Deliverable: per-country table — accepted signature forms, notarization requirements, print-and-sign fallback conditions.
2. **Help Now country content sign-off**: emergency numbers, police-vs-EAS thresholds, Green Card guidance, per country and per transit corridor. Blocks MOB-01 launch quality (not its gate). Deliverable: reviewed content pack per country with a named reviewer and date.
3. **GDPR Art. 9 DPIA** for medical/injury paths (consent records, reviewer access logging, retention). Blocks injury intake and MOB-03 medical uploads.
4. **Cession/assignment wording per airline jurisdiction** for VONESA, including the case-level POA fallback trigger. Blocks any public eligibility check under WS-F.
5. **Fee-display wording review** ("example" vs. "estimate"; claims-management regulation exposure per market) + cooling-off/withdrawal terms per country. Blocks MOB-05 display copy finalization (component can be built gate-first with placeholder-reviewed copy).
6. **Paddle cross-border tax confirmation** for gift membership (payer DE/CH, beneficiary XK/MK/AL). Blocks MOB-07 gift flow design closure.
7. **Agent cash-sale reconciliation policy.** Blocks MOB-06 design closure under OMG.

---

## 7. Commit Readiness Checklist (for this packet itself)

- [ ] Front matter conforms to `planning-governance-policy.md` (`plan_role: input`, `source_of_truth: false`, visible `> Status:` banner). ✅ in this revision.
- [ ] No sentence in the packet claims execution authority, promotes a slice, or contradicts `activeSlice=null / blocked_requires_current_authority`. ✅ MOB-01 is phrased as a `MOB-DG01` candidate only.
- [ ] Repo-state paragraph matches tracker reality at commit time (T-002b complete; final T-503 closeout outstanding). **Re-verify on the day of commit.**
- [ ] Boundaries §4 verbatim-covers: proxy.ts, routing/auth/session/tenancy, Paddle-only, VONESA/SVC/CQRS/UI gating, README/AGENTS/architecture docs.
- [ ] No changes in this commit outside `docs/product/` (this file + `mobile-experience-blueprint.md`).
- [ ] Commit message marks it as design input, e.g. `docs(product): add mobile program authority packet (design input, no promotion)`.
- [ ] After commit: reference the packet at the next current-authority resolution; do not edit `current-program.md`/`current-tracker.md` from this thread.

---

## 8. Mobile Commercial Launch Ship-Gate Checklist

Product gates (from the blueprint, made binding):

- [ ] Every case state renders exactly one Next Step with owner and date; no internal status codes visible anywhere.
- [ ] Help Now reachable in one tap from every member screen; car-accident guide works offline.
- [ ] First useful output <30s from cold start, no account, no server-side PII before explicit handoff; any local evidence bundle is clearable and marked stored-on-device-only.
- [ ] Every automated output carries the `ReviewBadge`; bands + reasons only, never bare scores; no output presented as final legal/medical/expert/financial decision.
- [ ] Fee Math Sheet rendered before every signature; "recover nothing → pay nothing" at every agreement moment; entity + governing law disclosed per `T-407`.
- [ ] Consent sheet precedes every medical question/upload; revocation works and is audit-logged; DPIA signed off before injury path is public.
- [ ] POA/agreement full text one tap from every summary; signed packs land in vault with method/timestamp; per-country e-sign validity matrix approved by counsel.
- [ ] Sponsor admins and gift payers have no route, API, or export exposing individual case data (negative tests exist).
- [ ] Escalations (expert/court/lawyer) appear only as staff-proposed cards after their recorded prerequisites (`s08`/`s09`); none self-serve.
- [ ] All member-facing copy is full localized sentences in sq/mk/en (+de for diaspora surfaces); i18n integrity guardrail green.
- [ ] Accessibility: ≥17pt body in stress flows, ≥44pt targets, VoiceOver/TalkBack pass on Help Now, intake, and agreement flows; contrast AA.
- [ ] Notification discipline: deep-links land on Next Step; ≤1 meaningful notification per 30 idle days.

Platform gates (standing repo discipline, restated for the launch decision):

- [ ] M0→M5 closed in the canonical tracker, including final `T-503` authority/evidence/destructive `claims.status` removal.
- [ ] Every shipped `MOB-*` slice has its recorded design-gate promotion and tracker closeout.
- [ ] `pr:verify`, `security:guard`, `e2e:gate`, Pilot Gate, SonarCloud, CodeQL green on every MOB-* merge; tenant-leak harness and modularity guard pass.
- [ ] Phase C boundaries verified untouched: `proxy.ts` diff-clean, canonical routes unchanged, Paddle sole billing provider, clarity markers intact.
- [ ] Funnel instrumentation (`c06` lineage) live for free→account→member conversion before paid acquisition starts.
- [ ] 24h-review promise validated against actual staffing or softened to "1 business day" before public launch.
- [ ] Rollback path documented for each shipped MOB-* surface (content packs are config-off; no schema rollbacks required by design).

---

_Relationship to authority: this packet is an `input`. Promotion of any `MOB-*` slice requires a fresh current-authority resolution and a recorded design gate. If this packet conflicts with `current-program.md` or the architecture-finalization tracker, those documents win._
