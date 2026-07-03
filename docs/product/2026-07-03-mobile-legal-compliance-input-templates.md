---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-program-authority-packet.md
  - docs/product/2026-07-03-mob-dg01-help-now-trip-mode-gate-packet.md
---

# Mobile Program — Legal / Compliance Input Templates

> Status: **Templates only.** These are the structured intake forms for the legal and compliance inputs the mobile program needs. Filling them requires counsel/reviewer work, not code, and can start immediately regardless of tracker state. Each completed template becomes a dated evidence artifact referenced by the slice that consumes it. An empty template blocks nothing by itself; a slice that requires one cannot close without it.

Priority order matches the authority packet §6: **L1 and L2 first.**

---

## L1 — Per-Country POA / E-Signature Validity Matrix

**Consumed by:** MOB-05 Agreement Ceremony (blocking), WS-F VONESA POA fallback (blocking), `SignaturePad` component method resolution.
**Owner:** ___ (counsel) · **Requested:** 2026-07-__ · **Due target:** before MOB-05 gate.

One row per (country, document type). Document types: service agreement, POA, assignment/cession, medical consent.

| Country | Doc type                                      | Draw-to-sign valid? | Typed+OTP valid? | Qualified e-sig (eIDAS-class) required? | Notarization required? | Print-and-sign fallback conditions | Counterparty acceptance notes (insurers/courts/airlines) | Source/citation | Reviewer | Date |
| ------- | --------------------------------------------- | ------------------- | ---------------- | --------------------------------------- | ---------------------- | ---------------------------------- | -------------------------------------------------------- | --------------- | -------- | ---- |
| KS      | POA                                           |                     |                  |                                         |                        |                                    |                                                          |                 |          |      |
| KS      | Assignment                                    |                     |                  |                                         |                        |                                    |                                                          |                 |          |      |
| MK      | POA                                           |                     |                  |                                         |                        |                                    |                                                          |                 |          |      |
| AL      | POA                                           |                     |                  |                                         |                        |                                    |                                                          |                 |          |      |
| DE      | Assignment (VONESA/cross-border counterparty) |                     |                  |                                         |                        |                                    |                                                          |                 |          |      |
| CH      | Assignment                                    |                     |                  |                                         |                        |                                    |                                                          |                 |          |      |
| AT      | Assignment                                    |                     |                  |                                         |                        |                                    |                                                          |                 |          |      |

**Completion rule:** MOB-05's signature layer may only enable, per country, the methods this matrix marks valid; countries without a completed row get `print_and_sign_fallback` only.

---

## L2 — Help Now Country Content Sign-Off Sheet

**Consumed by:** MOB-01 (per-country ship gate — unsigned countries ship dark), Trip Mode packs.
**Owner:** ___ (local counsel / operations lead per country) · **Start now** — this is the long pole for the August corridor.

One sheet per country pack version.

```
Country: ____          Pack version/hash: ____          Locale(s): ____
Reviewer (name, qualification): ____                    Review date: ____

[ ] Emergency numbers verified (police / ambulance / fire / road assistance), incl. regional variants
[ ] Police-report thresholds verified: when police MUST be called (injury, dispute, foreign vehicle,
    suspected intoxication, state property damage, minimum damage thresholds if any)
[ ] European Accident Statement: legal standing in this country confirmed; bilingual rendering reviewed
[ ] Green Card guidance verified (border requirements, foreign-plate handling)
[ ] Evidence-preservation guidance contains no advice that could constitute unauthorized legal practice
[ ] Clarity markers present and unmodified (c03/s10 catalog only, no new disclaimer language)
[ ] Deadline statements verified (statute windows referenced, phrased as ranges with "verify" guidance)
[ ] Translation reviewed by native speaker (sq/mk/de as applicable)

Sign-off: ____________________   Valid until (review cycle, max 12 months): ____
```

**Completion rule:** the sign-off binds to the pack version hash; any content change re-opens the sheet.

---

## L3 — GDPR Article 9 DPIA (Medical / Injury Paths)

**Consumed by:** MOB-03 medical uploads and injury intake (hard block regardless of promotion).
**Owner:** ___ (DPO/counsel) · **Due target:** before any injury-path gate.

Required sections (skeleton to hand to the DPO):

1. Processing description: injury pre-check inputs, medical document uploads, invalidity-coefficient review; systems touched (storage, AI pre-check chain `T-403/404` context rules, human reviewers).
2. Lawful basis + Art. 9(2) condition (explicit consent via `ConsentSheet` records; document the record schema).
3. Data flows and access parties: handler / certified medical reviewer / partner lawyer — mapping to consent grants; case-scoped access only (`T-302b` semantics); audit logging.
4. Retention and erasure: crypto-shredding chain (`T-104d–h`) as the erasure mechanism; retention periods per document class.
5. Risks and mitigations: reviewer device access, export paths, share-packs (`ent-tm05`), revocation semantics (hide-on-read effective immediately).
6. Residual risk acceptance + sign-off (DPO, date).

---

## L4 — Cession / Assignment Wording per Airline Jurisdiction (VONESA)

**Consumed by:** WS-F FLIGHT-* (blocks even the free public eligibility check).
**Owner:** ___ (counsel + recovery partner).

| Jurisdiction / airline group | Cession accepted? | Required wording/form | POA fallback trigger | Fee-math implications | Source | Reviewer | Date |
| ---------------------------- | ----------------- | --------------------- | -------------------- | --------------------- | ------ | -------- | ---- |

Plus: approved eligibility-band caveat sentence (extraordinary circumstances) per locale — feeds the `EligibilityBand.caveatKey` catalog.

---

## L5 — Fee-Display Wording Review

**Consumed by:** MOB-05a Fee Math Sheet copy; membership pricing surfaces.
**Owner:** ___ (counsel, per market).

Deliverables: approved wording for (a) the example framing ("If we recover €5,000 …" — confirm "example" status, never "estimate/projection/quote"), (b) the "recover nothing → pay nothing" line per locale, (c) tier-discount presentation vs. base rate, (d) cooling-off/withdrawal sentence per country, (e) confirmation that the display does not trigger claims-management/financial-promotion regimes in KS/MK/AL/DE/CH/AT. Output: reviewed message keys entering the clarity-marker catalog.

---

## L6 — Paddle Cross-Border Tax Confirmation (Gift Membership)

**Consumed by:** MOB-07 gift membership design closure.
**Owner:** ___ (finance/tax advisor).

Questions to answer: payer in DE/CH/AT purchasing a subscription delivered to a beneficiary in XK/MK/AL — VAT/place-of-supply treatment under Paddle merchant-of-record; invoice addressing (payer) vs. service records (beneficiary); any threshold where this requires entity changes. Constraint restated: **Paddle-only — if a scenario cannot be done on Paddle rails, the scenario waits; no provider expansion.**

---

## L7 — Agent Cash-Sale Reconciliation Policy

**Consumed by:** MOB-06 design closure under OMG.
**Owner:** ___ (finance + ops).

Must define: whether cash-marked activation is permitted at all; if yes — settlement window, reconciliation record, agent liability, audit trail (`ent-tm08` alignment), fraud thresholds and suspension rules; if no — the approved alternative (payment link/QR only). MOB-06 design stays open until this answers.

---

## Tracking Table (update as inputs land)

| ID  | Input                                      | Owner | Status      | Evidence path (when complete) | Blocks                               |
| --- | ------------------------------------------ | ----- | ----------- | ----------------------------- | ------------------------------------ |
| L1  | POA/e-sign matrix                          |       | not started |                               | MOB-05 signatures, WS-F POA fallback |
| L2  | Country content sign-off (KS)              |       | not started |                               | MOB-01 non-dark launch (KS)          |
| L2  | Country content sign-off (MK, AL, transit) |       | not started |                               | MOB-01 country coverage, Trip Mode   |
| L3  | DPIA medical                               |       | not started |                               | MOB-03 medical, injury intake        |
| L4  | Cession wording                            |       | not started |                               | WS-F public eligibility              |
| L5  | Fee wording                                |       | not started |                               | MOB-05a final copy                   |
| L6  | Paddle cross-border tax                    |       | not started |                               | MOB-07 gift design closure           |
| L7  | Cash reconciliation                        |       | not started |                               | MOB-06 design closure                |
