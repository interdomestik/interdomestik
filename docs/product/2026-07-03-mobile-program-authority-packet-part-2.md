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

# Mobile Program Authority Packet (Design/Current-Authority Input) — Part 2

> Status: **Input document — design authority only.** This packet defines the governed design intent for the mobile commercial experience. It creates **no execution authority** and promotes **no slice**: every `MOB-*` item below enters the active queue only through a fresh current-authority resolution and a recorded design gate in `docs/plans/current-program.md` / `docs/plans/current-tracker.md`. If this packet conflicts with those documents, they win.

Part 2 of [2026-07-03-mobile-program-authority-packet.md](./2026-07-03-mobile-program-authority-packet.md).

## 3. Slice Detail

### MOB-01 — Help Now / no-account free funnel (first `MOB-DG01` candidate)

**OBR criterion:** public trust/pricing clarity + commercial KPI evidence (funnel instrumentation per `c06`).

- **Prerequisites from M0–M5:** none outstanding. Enabling work already merged: `T-108-MIN` (`ida.*` neutral no-tenant public context), `T-109` (country-host aliases), incident-country foundation (`ARCH-M1-09`/`T-102`), and the existing free-start surfaces (`t01` trust UX, `t02` claim-pack generator, `c03` hotline/disclaimers, `c06` instrumentation).
- **Status:** **Candidate only.** This packet nominates MOB-01 for `MOB-DG01`; it does not authorize implementation. Scope at the gate: content packs + offline caching + camera evidence coach + mobile-first presentation of the existing claim pack + funnel events. Zero server-side PII before explicit handoff, no account, no auth, no tenancy, no billing, no schema. Local evidence bundles may contain personal data on the user's device and therefore require clear/delete controls, no service-worker caching, and reviewed "stored on this device only" copy.
- **Files/modules likely affected:** `apps/web/src/app/[locale]/(site)/**` free-start surfaces; new content-pack module under `apps/web/src/features/`; service-worker/offline caching config; `messages/*` (sq/mk/en, later de); claim-pack generator feature. **Not** `proxy.ts`, not route groups, not auth/session.
- **Risks / legal-compliance inputs:** per-country content sign-off (emergency numbers, police-vs-EAS rules, Green Card guidance); reuse of contractual clarity markers only (`c03`, `s10`) — no new disclaimer language; offline cache must never hold member-scoped data.
- **Acceptance criteria:** cold-start to first useful checklist <30s, no account; car-accident guide fully functional offline after first load; zero server-side PII collection pre-fork; local bundle clear/delete proof; service-worker cache excludes incident bundles/photos/local metadata; clarity markers on every guidance output; funnel events per `c06`; i18n integrity guardrail green.

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
- **Acceptance criteria (inherited by FLIGHT-\*):** free eligibility check collects flight data only; one-screen agreement with fee math and the "recover nothing → pay nothing" line; ledger states map to outbox events; airline submission/chase dates surface through the MOB-02 Next Step model.

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
- **Status:** **Split.** Trip Mode: **folded into the MOB-01 gate scope** (bilingual EAS packs, transit-country content, pre-departure download; same no-account / zero-server-side-PII profile). Gift membership: design-only pending entity/tax/counsel review; a billing-adjacent model change even though it stays Paddle-only, so it needs its own gate.
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

- **Phase-C-safe by construction:** zero server-side PII before explicit handoff, no account, no auth, no session, no tenancy, no billing, no schema, no proxy, no canonical-route changes; local device bundles are explicitly non-uploaded and clearable; extends surfaces that already passed review (`t01`, `t02`, `c03`, `c06`).
- **OBR-eligible on its face:** public trust + commercial KPI evidence, with no structural-work smell.
- **Independent of the T-503 endgame:** consumes nothing from the status-authority migration and cannot create drift against it.
- **Commercially time-sensitive:** the August diaspora driving corridor is the year's cheapest acquisition window, and MOB-01 + Trip Mode is the only slice that can meet it without touching gated systems.

`MOB-DG01` scope proposal: content packs + offline caching + evidence coach + mobile presentation of the existing claim pack + funnel instrumentation. Explicit exclusions: account-creation changes, member surfaces, new disclaimer language, any schema or auth work.

**Second gate candidate:** `MOB-05a` — Fee Math Sheet display component only (pricing-clarity criterion, all prerequisites merged, no new writers).

---
