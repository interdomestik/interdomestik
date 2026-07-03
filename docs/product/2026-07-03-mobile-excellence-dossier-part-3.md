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

# Interdomestik IDA — Mobile Excellence Dossier — Part 3

> Status: **Design/product preparation only — no implementation authorized.** M0→M5 is not fully closed (final `T-503` closeout outstanding; `activeSlice=null / blocked_requires_current_authority`). This dossier proposes no changes to proxy, routing, auth, session, tenancy, billing provider, VONESA runtime, SVC, CQRS, or tracker authority. Everything here is consumable by design gates (`MOB-DG01` onward) after M0→M5 closeout and fresh current-authority resolution.

Part 3 of [2026-07-03-mobile-excellence-dossier.md](./2026-07-03-mobile-excellence-dossier.md).

## 4. Commercial Conversion Strategy

The ladder: **free value → account → membership → professional recovery.** Each rung is earned by delivered value, never by withheld value.

**Where value is delivered before signup (deliberately generous):** the entire Help Now flow including police/EAS decision and offline packs; the Evidence Coach and local bundle; the bilingual EAS; Trip Mode packs; the full Claim Pack including the letter template; (post-WS-F) the VONESA eligibility read. This generosity is the acquisition strategy: the Claim Pack and bilingual EAS are _shareable artifacts_ that carry the brand into family WhatsApp groups — the diaspora distribution channel money can't buy.

**Where signup is justified (the natural moments, all pull not push):**

1. CP-3 fork — "Have Interdomestik handle it" requires an identity to handle it _for_.
2. "Save this across devices" after a completed checklist or bundle (sync is the honest reason).
3. Trip Mode "family share with updates" (send pack to a family member who can see updates).
   Account is free, promises no spam ("Your email is for your documents, not for marketing" — and that must be true).

**Where membership is sold (exactly three places, nowhere else):**

1. **CP-3 / case handoff** — the moment of highest motivation and full information (they've seen the read-back). Sell the handling, price the year: "€20/year + success fee only if we recover."
2. **Renewal/preparedness moments** — Trip Mode setup for non-members carries one quiet line ("Members: we handle what happens on this road").
3. **VONESA eligibility result** (post-WS-F) — "likely eligible" → claim it as one-off or become a member.
   **Never at the accident scene.** HN-1 through HN-4 contain zero membership content — selling to a person at a crash site is both predatory and, per §9, the single fastest way to destroy the trust the flow builds. The pitch waits for CP-3, after value delivery, when stress has dropped.

**Where professional recovery is offered:** only via staff-proposed `ProposalCard` after `s08`/`s09` review — structurally, not just editorially. The member experiences recovery as _being recommended by a person who read their file_, which is also the conversion-optimal framing.

**Never paywalled (permanent commitments):** emergency guidance and numbers; police/EAS decision content; the EAS form; the Evidence Coach and local bundle; the basic Claim Pack; deadline information; the Fee Math Sheet itself (fee transparency behind a paywall would be self-satire).

**Metrics that prove conversion _quality_** (not just volume):

- Pack→account within 72h; account→membership within 7 days of case handoff offer (the honest window; a 90-day laggard conversion is fine but measures something else).
- Membership 90-day money-back invocation rate (<5% target — high rate = mis-sold).
- Case NPS at resolution, split by outcome (the "we recovered nothing and they'd still recommend us" cohort is the trust metric).
- Notification opt-in at case creation (>70% = permission choreography works).
- Claim-pack share rate (shares per pack — the viral coefficient of the free layer).
- Anti-metrics, monitored to stay _low_: session frequency outside case events (engagement here is a symptom, not a goal); membership sales initiated from HN surfaces (target: structurally zero).

---

## 5. Trust Architecture (reusable patterns)

**ReviewBadge language (the complete allowed set — nothing else ships):**

| State                                                                                                                                                                              | Pattern                              | Example                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| pending                                                                                                                                                                            | "{Specialist} confirms within {SLA}" | "Our legal team confirms within 1 business day"     |
| reviewed                                                                                                                                                                           | "Reviewed by {name/role}, {date}"    | "Reviewed by Dr. {N}, certified physician, 12 July" |
| informational                                                                                                                                                                      | "General guidance for {scope}"       | "General guidance — verified for Kosovo, June 2026" |
| All three attach to outputs, never to promises. The badge never says "AI" or "automated" — it says who _human_ stands behind it and when; the machine is an implementation detail. |

**Human-review moments (the map — every automated output pairs with a named human touchpoint):** basis pre-check → legal team within SLA; injury category → certified doctor (post-DPIA); damage review → independent expert on proposal; invalidity coefficient → specialist, member-only, never automated-final; case handoff → named handler with photo; escalations → staff proposer by name. Rule: **no dead-end automation** — every machine output has a visible path to the human who owns it.

**Fee transparency:** one component (`FeeMathSheet`), one mental model, rendered before every commitment; ledger receipts after (`LedgerRow`); "no other charges without asking first" as a ceremony commitment; total-cost honesty at AC-2 (success fee + separately-approved expert/court costs shown together, §9).

**"Not an insurer / not final advice" without fear:** allegiance framing does the legal work — "We're not the insurer. We're the ones who deal with the insurer for you." States the legal fact as the value proposition. "Not final advice" is carried entirely by the ReviewBadge pattern (presence of a human) — the phrase "this is not legal advice" appears only inside the marker catalog where legally required, never as free-floating UI copy.

**Local-only evidence privacy:** the bundle stays on-device until explicit send (contract-enforced in MOB-01); UI states it at EC-1, EC-3, and HN-5; the send moment shows exactly what leaves the phone. This turns a privacy control into a felt feature: "your evidence, your decision."

**Sponsor / gift-payer privacy:** one pattern, two audiences. To the member: "Provided by {sponsor} — they see that seats are active, never your cases." To the payer/sponsor: "You'll see payments and renewals. {Beneficiary}'s cases are theirs alone." Enforced by API absence, promised in UI, verified by negative tests (ship gate).

**Legal document confidence:** every summary ≤5 bullets; full text always one tap; signed copies in Vault instantly with method+timestamp; versioned documents ("Fee rules v3, effective {date}"); withdrawal rights stated at signature, not buried.

**No outcome guarantees:** bands with reasons (`likely/possible/unlikely` + why), never scores; recovery amounts always "recovered" (past, ledger) or "example" (FeeMathSheet), never "expected"; the one absolute promise permitted is the fee promise ("recover nothing → pay nothing") because it's the one Interdomestik fully controls.

---

## 6. Visual Product Direction

**Language: calm institution, warm execution** — a working tool that looks like it files things correctly. The competitive visual position: everything else in this market looks like either a bank (cold) or a startup (unserious); IDA should look like the good hospital.

**Color hierarchy (roles, not palette poetry):**

- Base: ink navy (#0F1B2D family) — headers, primary text, the trust base.
- Surface: warm off-white (#FAF8F5 family) — never pure white (glare at roadside), never grey (institutional despair).
- **Amber — the action color, rationed:** exclusively "you need to act" (one per screen, mechanical rule). Its scarcity makes the app read as "handled."
- Signal green: progress, positive states, "nothing needed."
- Red: emergency calls only (HN-2). Red never means "error" elsewhere (errors are ink + explanation).
- Muted slate: ReviewBadge, metadata, boundaries — present, never shouting.

**Typography scale (Inter or equivalent humanist sans):** 34/28 page titles (rare), 22 section, **17 body-stress** (Help Now, status sentences — the workhorse), 15 body-standard, 13 metadata-minimum (nothing below 13, ever). Line height 1.45; status sentences may use 20/28 as "typographic heroes." Dynamic Type to 135% without breakage on stress flows.

**Spacing:** 4pt grid; component padding 16; card gap 12; section gap 24; screen margins 16 (20 on ≥400pt widths). Bottom-sheet handle zone 24. Thumb-zone rule from §2 audit is a layout constraint, not a guideline.

**Icon style:** outlined, 2px stroke, rounded joins, 24pt grid; filled variants only for active tab states. No duotone, no illustrations-as-icons. The four Help Now situations get the only large pictographic treatments in the app (48pt, same stroke language).

**Motion principles:** 150–250ms, ease-out, opacity+transform only; motion communicates state change (card in, sheet up, tick confirm), never delight for its own sake; checklist ticks get the one celebratory micro-moment (150ms scale + haptic) because completion under stress deserves it; full `prefers-reduced-motion` compliance; **zero animation in Help Now** except tick confirms — stressed users read motion as instability.

**Emergency-mode visual treatment (HN-1–HN-4):** chrome drops (no tabs except close), contrast rises (AAA target), type up one step, targets ≥88pt on decisions, single-column always, no images beyond the four pictograms, offline indicator present. The visual message: _the app just rolled up its sleeves._

**Calm institutional trust style elsewhere:** cards with 1px hairline borders + 8pt radius (not floating shadows); real data density on member surfaces (members checking a case want substance, not white space theatre); handler photos are real photos, small, consistent crop — no illustrated avatars.

**What to avoid (binding):** gradients, glassmorphism, confetti, mascots, stock photography (especially handshakes and crash-scene imagery), illustrated empty-state art, dashboard KPI tiles, insurance-blue (#0066CC clichés), dark patterns of any kind, marketing hero sections inside the product, autoplaying video, skeleton shimmer on Help Now (nothing to load), and decorative use of the amber action color. This is a working product; decoration is deferred to the marketing site.

---
