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

# Mobile Program Authority Packet (Design/Current-Authority Input)

> Status: **Input document — design authority only.** This packet defines the governed design intent for the mobile commercial experience. It creates **no execution authority** and promotes **no slice**: every `MOB-*` item below enters the active queue only through a fresh current-authority resolution and a recorded design gate in `docs/plans/current-program.md` / `docs/plans/current-tracker.md`. If this packet conflicts with those documents, they win.

**Repo state this packet is written against (2026-07-03):** `T-002b` is complete. The remaining M0→M5 blocker is the **final `T-503` authority/evidence/destructive `claims.status` removal** closeout. The canonical tracker state is **`activeSlice=null` / `blocked_requires_current_authority`** — nothing is running, and nothing here changes that.

Companion blueprint: `docs/product/mobile-experience-blueprint.md` (full UX rationale). This packet is the governance-shaped extract: objectives, slice mapping, prerequisites, boundaries, and gates.

---

## 1. Mobile Program Objective & Non-Goals

**Objective.** Make Interdomestik commercially launchable on mobile: a member-facing experience in which (a) a visitor gets useful, no-PII incident help in under 30 seconds, (b) a member always sees exactly one Next Step per case with an owner and a date, (c) every agreement moment (membership, recovery, VONESA, expert costs) renders honest fee math before signature, and (d) all of it rides the existing case/recovery/document/event spine finalized by M0→M5 — never a parallel stack.

**Success definition (commercial):** free-funnel → account conversion, account → membership conversion, case-companion NPS, and zero trust-boundary incidents (no automated output presented as final; no sponsor/payer visibility into cases).

**Non-goals (program-level):**

- No parallel mobile backend, no second API surface, no mobile-specific data model. Mobile consumes the same governed writers, read models, and outbox events as web.
- No native app-store submission decision inside this packet (PWA vs. wrapped build is decided separately, later).
- No re-litigation of the business model: Paddle-only, success-fee rules per `c02`/`T-204`/`T-408`, plans Standard/Familja.
- No changes to the role model, tenancy model, or canonical routes (`/member`, `/agent`, `/staff`, `/admin`).
- No staff/admin mobile surfaces in this program (desktop-first stands; blueprint §5).
- No new AI-facing behavior: pre-checks remain governed by the existing AI posture chain (`T-403/404/405` lineage) and the p39 design set; mobile only re-skins their outputs with the `ReviewBadge` pattern.

---

## 2. Blueprint → Governed Slice Mapping

Slice IDs are proposed under a `MOB-*` namespace so they can be registered in the canonical tracker without colliding with `T-*`, `FLIGHT-*`, `OMG-*`, or `DOM-*`.

| Slice | Blueprint area | Disposition today |
|---|---|---|
| `MOB-01` | Help Now / no-PII free funnel (offline scene guides, evidence coach, Claim Pack continuity, Trip Mode content) | **First candidate for `MOB-DG01` promotion.** Design complete; Phase-C-safe profile; **no runtime work authorized until the gate records it** |
| `MOB-02` | Mobile case companion / Next Step model | Design-only; runtime requires fresh current-authority/design-gate promotion (case/recovery spine largely in place) |
| `MOB-03` | Vault + consent sheets | Design-only; runtime requires promotion **plus** signed DPIA for medical paths |
| `MOB-04` | VONESA mobile flow | Design refinement only; runtime rides `WS-F` (`FLIGHT-00…11`), which remains unpromoted |
| `MOB-05` | Fee Math Sheet / Agreement Ceremony | Design-only; display layer is a strong early gate candidate; signature/POA layer additionally requires the legal matrix |
| `MOB-06` | Agent mobile companion | Design-only; runtime rides `OMG`, which remains unpromoted |
| `MOB-07` | Diaspora Trip Mode / gift membership | Split: Trip Mode content folds into `MOB-01` scope; gift membership design-only pending entity/tax/counsel review |

Rule: a `MOB-*` slice may only be promoted if its primary acceptance criterion satisfies the OBR selection rule (legal/entity correctness, billing/revenue correctness, claim/recovery safety, tenant/privacy safety, auditability, public trust/pricing clarity, or commercial KPI evidence). "Better UX" alone is not a selection argument; each slice states its OBR-qualifying criterion.

---

## 3. Slice Detail

### MOB-01 — Help Now / no-PII free funnel (first `MOB-DG01` candidate)

**OBR criterion:** public trust/pricing clarity + commercial KPI evidence (funnel instrumentation per `c06`).

- **Prerequisites from M0–M5:** none outstanding. Enabling work already merged: `T-108-MIN` (`ida.*` neutral no-tenant public context), `T-109` (country-host aliases), incident-country foundation (`ARCH-M1-09`/`T-102`), and the existing free-start surfaces (`t01` trust UX, `t02` claim-pack generator, `c03` hotline/disclaimers, `c06` instrumentation).
- **Status:** **Candidate only.** This packet nominates MOB-01 for `MOB-DG01`; it does not authorize implementation. Scope at the gate: content packs + offline caching + camera evidence coach + mobile-first presentation of the existing claim pack + funnel events. Zero PII, no auth, no tenancy, no billing, no schema.
- **Files/modules likely affected:** `apps/web/src/app/[locale]/(site)/**` free-start surfaces; new content-pack module under `apps/web/src/features/`; service-worker/offline caching config; `messages/*` (sq/mk/en, later de); claim-pack generator feature. **Not** `proxy.ts`, not route groups, not auth/session.
- **Risks / legal-compliance inputs:** per-country content sign-off (emergency numbers, police-vs-EAS rules, Green Card guidance); reuse of contractual clarity markers only (`c03`, `s10`) — no new disclaimer language; offline cache must never hold member-scoped data.
- **Acceptance criteria:** cold-start to first useful checklist <30s, no account; car-accident guide fully functional offline after first load; zero PII fields pre-fork; clarity markers on every guidance output; funnel events per `c06`; i18n integrity guardrail green.

### MOB-02 — Mobile case companion / Next Step model

**OBR criterion:** claim/recovery safety + public trust (kills claim-silence; makes stage semantics contractual).

- **Prerequisites:** the case/recovery boundary and lifecycle spine this slice consumes are **largely complete**: `T-201` (full), `T-208/T-208b`, `T-002b` transition invariants (complete), `s03` stage-history member tracker, `s04` SLA states. The final `T-503` closeout (destructive `claims.status` removal) should land first so the Next Step read model binds to the post-`T-503` status authority, not the legacy column.
- **Status:** **Design-only now; runtime requires fresh current-authority/design-gate promotion** (no architectural blocker expected after `T-503` closes; promotion is a governance step, not a build dependency). The read model must follow the Rev 22 constitution: outbox-only CQRS consumer, no direct writer reads.
- **Files/modules:** member claim detail + dashboard under `(app)/member`; read-model consumer on the domain-case read side; Novu deep-links; no writer changes.
- **Risks / legal inputs:** "owner + date" phrasing makes deadlines semi-contractual — counsel to approve expectation-date language; member-visible SLA statements must match `g09` enforcement reality.
- **Acceptance criteria:** every state in the post-`T-503` transition matrix maps to exactly one Next Step (owner ∈ {member, interdomestik, insurer, court}; date present or explicit "awaiting date"); no internal status codes visible; outbox-only consumption; notifications deep-link to the Next Step card; erased-subject rendering honors `T-104h` contracts.

### MOB-03 — Vault + consent sheets

**OBR criterion:** tenant/privacy safety + auditability.

- **Prerequisites:** access-tenant isolation and case-scoped grant semantics are **already in place** (`T-302/T-302b/T-305` chain complete); crypto-shredding/erasure spine complete (`T-104d/f/g/h`); controlling designs exist (`p39-dg05` consent governance; `ent-tm03/tm04/tm05` threat models). What remains is not architecture: a consent-record additive migration, the consent-sheet UI, and a **signed DPIA for GDPR Art. 9 medical paths**.
- **Status:** **Design-only now; runtime requires fresh current-authority/design-gate promotion.** Medical upload paths additionally hard-require the DPIA regardless of promotion. Recommended sequencing: finalize consent-sheet UX + legal review during the T-503 endgame so runtime is a pure build once gated.
- **Files/modules:** document upload/list features, share-pack surfaces, consent records (additive migration), camera shot-list component; storage RLS per the `sec06+` chain.
- **Risks / legal inputs:** DPIA (blocks injury intake only, not car/property); consent-revocation semantics (hide vs. delete) need legal definition; partner-lawyer access = case-scoped invites, audit-logged, consistent with ADR-05 (attribution never grants document access).
- **Acceptance criteria:** every sensitive document carries a visible consent state; revocation effective on read paths immediately and audit-logged; no access path outside case-scoped grants; medical items unreachable without an explicit member consent record; sponsor/payer roles have no document API surface.

### MOB-04 — VONESA mobile flow

**OBR criterion (when promoted):** billing/revenue correctness + commercial KPI (new revenue line on the proven spine).

- **Prerequisites:** the enabling foundations are **complete** (`T-208/T-208b` recovery-law routing; `T-204`/`T-408` success-fee billing spine). What remains is purely governance: `WS-F` (`FLIGHT-00…11`) **remains unpromoted** and requires its own reauthorization; `vonesa-architecture-integration-2026-05-30.md` stays the architecture authority.
- **Status:** **Design refinement only.** Reconcile the blueprint's 3-minute flow (flight lookup → eligibility band → single cession/POA agreement screen → ledger) with the VONESA architecture doc and the `FeeMathSheet` contract now, so `FLIGHT-*` slices inherit finished UX contracts at promotion.
- **Files/modules (future, under WS-F):** VONESA vertical on the case spine; flight-data adapter; cession/POA agreement records; compensation ledger read model.
- **Risks / legal inputs:** cession vs. POA default per airline/jurisdiction (case-level fallback); eligibility bands never rendered as guaranteed amounts; assignment wording per country needs counsel sign-off before any public eligibility check.
- **Acceptance criteria (inherited by FLIGHT-*):** free eligibility check collects flight data only; one-screen agreement with fee math and the "recover nothing → pay nothing" line; ledger states map to outbox events; airline submission/chase dates surface through the MOB-02 Next Step model.

### MOB-05 — Fee Math Sheet / Agreement Ceremony

**OBR criterion:** public trust/pricing clarity (display layer); legal/entity correctness + auditability (signature layer).

- **Prerequisites:** display layer — all merged (`c02` success-fee calculator, `T-407` entity/governing-law disclosure, `c04` billing terms). Signature layer — designs exist (`g10`, `s08`, `s09`); the missing input is the **per-country POA/e-sign validity matrix** (the single biggest legal input this program needs) plus MOB-03 consent records.
- **Status:** **Design-only now.** The Fee Math Sheet display component is a strong early design-gate candidate (pricing-clarity criterion, no new writers) — nominate it at or immediately after `MOB-DG01`. The Agreement Ceremony requires promotion **and** the legal matrix; it must respect that professional recovery starts only after the `s08`-gated human decision.
- **Files/modules:** shared `FeeMathSheet` component (member claim detail, membership purchase, later VONESA); agreement records + signature capture (post-gate); document generation into vault.
- **Risks / legal inputs:** POA formality per jurisdiction (notarization risk; fallback print-and-sign with in-app tracking); fee-example wording as "example," never "estimate/projection"; cooling-off/withdrawal terms per country; every signature event audit-trailed (`m05` lineage).
- **Acceptance criteria:** identical fee-math component before every signature everywhere; tier discounts against base rate; "recover nothing → pay nothing" at every agreement moment; full legal text one tap from every summary; signed documents to vault with method/timestamp; no agreement flow reachable without the prerequisite staff decision recorded.

### MOB-06 — Agent mobile companion

**OBR criterion (when promoted):** commercial KPI evidence (distribution channel throughput).

- **Prerequisites:** role boundaries are complete and binding (`T-301`/`T-304`/`T-306`, ADR-09; agents: leads/sales/stage-only, never claim content). The blocker is governance: **`OMG-00…09` remains unpromoted** and requires its own reauthorization.
- **Status:** **Design-only.** The blueprint's one-screen sale (plan cards → contact → payment link/QR → instant activation) is the design input for `OMG` when it opens. Cash-marked sales need a reconciliation design before any build.
- **Files/modules (future, under OMG):** `(agent)` route group mobile ergonomics; activation links/QR; commission visibility per `T-306` (durable subscription ownership, not read-scope).
- **Risks / legal inputs:** `ent-tm08` assisted-registration threat model governs; cash reconciliation policy; activation-minimum PII only on agent devices.
- **Acceptance criteria (future):** two-minute street sale end-to-end on a phone; stage-only claim visibility re-proven on the mobile surface; activation triggers member welcome flow; commission attribution per ADR-05 (provenance only, no access).

### MOB-07 — Diaspora Trip Mode / gift membership

**OBR criterion:** Trip Mode — public trust + commercial KPI (seasonal acquisition); gift membership — billing/revenue correctness + tenant/privacy safety.

- **Prerequisites:** Trip Mode — none beyond MOB-01 (content variant of the free funnel; `T-113` residence-country and `T-208` incident-country routing already make cross-border cases first-class). Gift membership — payer/beneficiary decoupling builds on merged `T-112` subscription fields; outstanding inputs are Paddle cross-border tax review and the payer-privacy enforcement pattern (`ga04`, `g08`) reapplied to payers.
- **Status:** **Split.** Trip Mode: **folded into the MOB-01 gate scope** (bilingual EAS packs, transit-country content, pre-departure download; same no-PII profile). Gift membership: design-only pending entity/tax/counsel review; a billing-adjacent model change even though it stays Paddle-only, so it needs its own gate.
- **Files/modules:** Trip Mode — MOB-01 content-pack module + locale `de`; gift membership (future) — subscription creation flow, payer-visibility read model (renewal/receipts only), invitation/acceptance flow.
- **Risks / legal inputs:** payer must have **no API surface** exposing beneficiary case existence (sponsor-admin enforcement standard); Paddle payer-in-DE/CH, service-in-XK/MK/AL invoicing needs tax confirmation; gifted-seat consent (beneficiary explicitly accepts).
- **Acceptance criteria:** Trip Mode packs fully offline before border crossing; bilingual EAS as one component; gift flow (when built) creates a normal member fully private from the payer, payer sees billing artifacts only; no diaspora feature introduces a non-Paddle payment path.

---

## 4. Explicit Boundaries (binding on all MOB-* work)

1. **No changes to `apps/web/src/proxy.ts`.** Gated regardless of slice.
2. **No routing/auth/session/tenancy refactor.** Canonical routes stay `/member`, `/agent`, `/staff`, `/admin`; host/tenant semantics stay as resolved by the `T-302…T-305` chain; mobile work adapts to them, never the reverse.
3. **No billing-provider expansion. Paddle-only.** Gift membership, VONESA fees, and agent sales stay on Paddle rails or wait.
4. **No runtime VONESA/SVC/CQRS/UI implementation unless separately promoted.** `WS-F`, `SVC-*`, read-model plumbing, broad UI/UX overhaul, and billing/product UI changes remain out of scope exactly as current-program records; this packet adds design intent, not promotion.
5. **No README/AGENTS/architecture-doc changes unless explicitly authorized.** This packet and the blueprint live under `docs/product/`; they claim no authority over `docs/ARCHITECTURE.md`, ADRs, CI, or playbooks.
6. Clarity markers remain contractual; no MOB-* slice may introduce disclaimer or promise language outside the reviewed marker set.
7. All MOB-* runtime work follows the standing DoD: modularity guard, tenant-leak harness, i18n integrity, `pr:verify` / `security:guard` / `e2e:gate`, Pilot Gate, Sonar/CodeQL green, tracker closeout before follow-on work.

---

## 5. Next Governance Step & Recommended First Slice

**Exact next governance step (after M0→M5 closeout):**

1. Land the final `T-503` authority/evidence/destructive `claims.status` removal closeout under the existing `OBR-DG40` controlled-continuation authority, and record it in `current-program.md` / `current-tracker.md`.
2. Run a **fresh current-authority resolution** from the `activeSlice=null / blocked_requires_current_authority` state. No MOB-* work may start from this packet directly.
3. At that resolution, register the `MOB-*` namespace in the canonical tracker and schedule **`MOB-DG01`** as the next design gate.

**Recommended first promotable slice: `MOB-01` (with Trip Mode content folded in), via `MOB-DG01`.**

- **Phase-C-safe by construction:** zero PII, no auth, no session, no tenancy, no billing, no schema, no proxy, no canonical-route changes; extends surfaces that already passed review (`t01`, `t02`, `c03`, `c06`).
- **OBR-eligible on its face:** public trust + commercial KPI evidence, with no structural-work smell.
- **Independent of the T-503 endgame:** consumes nothing from the status-authority migration and cannot create drift against it.
- **Commercially time-sensitive:** the August diaspora driving corridor is the year's cheapest acquisition window, and MOB-01 + Trip Mode is the only slice that can meet it without touching gated systems.

`MOB-DG01` scope proposal: content packs + offline caching + evidence coach + mobile presentation of the existing claim pack + funnel instrumentation. Explicit exclusions: account-creation changes, member surfaces, new disclaimer language, any schema or auth work.

**Second gate candidate:** `MOB-05a` — Fee Math Sheet display component only (pricing-clarity criterion, all prerequisites merged, no new writers).

---

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
- [ ] First useful output <30s from cold start, no account, no PII.
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

*Relationship to authority: this packet is an `input`. Promotion of any MOB-* slice requires a fresh current-authority resolution and a recorded design gate. If this packet conflicts with `current-program.md` or the architecture-finalization tracker, those documents win.*
