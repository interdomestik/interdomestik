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

# Mobile Program Authority Packet (Design/Current-Authority Input) — Part 1

> Status: **Input document — design authority only.** This packet defines the governed design intent for the mobile commercial experience. It creates **no execution authority** and promotes **no slice**: every `MOB-*` item below enters the active queue only through a fresh current-authority resolution and a recorded design gate in `docs/plans/current-program.md` / `docs/plans/current-tracker.md`. If this packet conflicts with those documents, they win.

Part 1 of [2026-07-03-mobile-program-authority-packet.md](./2026-07-03-mobile-program-authority-packet.md).

**Repo state this packet is written against (2026-07-03):** `T-002b` is complete. The remaining M0→M5 blocker is the **final `T-503` authority/evidence/destructive `claims.status` removal** closeout. The canonical tracker state is **`activeSlice=null` / `blocked_requires_current_authority`** — nothing is running, and nothing here changes that.

Companion blueprint: `docs/product/mobile-experience-blueprint.md` (full UX rationale). This packet is the governance-shaped extract: objectives, slice mapping, prerequisites, boundaries, and gates.

---

## 1. Mobile Program Objective & Non-Goals

**Objective.** Make Interdomestik commercially launchable on mobile: a member-facing experience in which (a) a visitor gets useful, no-account incident help in under 30 seconds with zero server-side PII before explicit handoff, (b) a member always sees exactly one Next Step per case with an owner and a date, (c) every agreement moment (membership, recovery, VONESA, expert costs) renders honest fee math before signature, and (d) all of it rides the existing case/recovery/document/event spine finalized by M0→M5 — never a parallel stack.

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

| Slice    | Blueprint area                                                                                                                                                   | Disposition today                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `MOB-01` | Help Now / no-account free funnel (offline scene guides, evidence coach, Claim Pack continuity, Trip Mode content; zero server-side PII before explicit handoff) | **First candidate for `MOB-DG01` promotion.** Design complete; Phase-C-safe profile; **no runtime work authorized until the gate records it** |
| `MOB-02` | Mobile case companion / Next Step model                                                                                                                          | Design-only; runtime requires fresh current-authority/design-gate promotion (case/recovery spine largely in place)                            |
| `MOB-03` | Vault + consent sheets                                                                                                                                           | Design-only; runtime requires promotion **plus** signed DPIA for medical paths                                                                |
| `MOB-04` | VONESA mobile flow                                                                                                                                               | Design refinement only; runtime rides `WS-F` (`FLIGHT-00…11`), which remains unpromoted                                                       |
| `MOB-05` | Fee Math Sheet / Agreement Ceremony                                                                                                                              | Design-only; display layer is a strong early gate candidate; signature/POA layer additionally requires the legal matrix                       |
| `MOB-06` | Agent mobile companion                                                                                                                                           | Design-only; runtime rides `OMG`, which remains unpromoted                                                                                    |
| `MOB-07` | Diaspora Trip Mode / gift membership                                                                                                                             | Split: Trip Mode content folds into `MOB-01` scope; gift membership design-only pending entity/tax/counsel review                             |

Rule: a `MOB-*` slice may only be promoted if its primary acceptance criterion satisfies the OBR selection rule (legal/entity correctness, billing/revenue correctness, claim/recovery safety, tenant/privacy safety, auditability, public trust/pricing clarity, or commercial KPI evidence). "Better UX" alone is not a selection argument; each slice states its OBR-qualifying criterion.

---
