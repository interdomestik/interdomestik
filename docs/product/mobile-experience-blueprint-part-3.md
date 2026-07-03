---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
---

# Interdomestik IDA — Mobile Experience Blueprint — Part 3

> Status: **Design input — no implementation authority.**

Part 3 of [mobile-experience-blueprint.md](./mobile-experience-blueprint.md).

## 8. Screen Inventory

**Free Zone (7):** Landing/Home-C · Help Now hub · Scene guide (per type) · Evidence coach camera · Intake wizard · Claim Pack result/share · VONESA quick check
**Auth & activation (5):** Sign up/in (social + phone OTP) · Membership paywall/plans · Payment (Paddle) · Sponsored-code activation · Family-seat invite/accept
**Member Zone (10):** Home-A/B · Case list · Case detail (Next Step + timeline) · Document checklist · Vault · Upload/camera flow · Consent sheet (medical) · Handler chat/messages · Benefits & fee explainer · Account/settings
**Recovery & escalation (6):** Proposal card detail · Agreement ceremony ×4 · Ledger/payout view
**VONESA (4):** Flight check · Eligibility result · Agreement screen · Flight-case detail with ledger
**Agent mode (5):** Agent home (leads/today) · Lead capture · Plan sale + activation (QR/link) · Member lookup · Sale confirmation
**Staff triage mobile (3):** Queue · Case triage card · Quick actions (assign/approve/comment)

≈ 40 screens; the MVP subset is ~28 (§13).

---

## 9. High-Fidelity Screen Descriptions (key screens)

**Home — State A (active case).** Ink-navy header, greeting, small membership chip. Hero card fills the first viewport: case title in the member's words ("Crash on E-75, March 12"), progress rail (5 dots, stage 3 lit), status sentence in 17pt ("The insurer has your file. Response due by 21 July."), owner chip ("With: Insurer"), and one button — amber if the member owes an action ("Upload medical report"), quiet green outline if not ("Nothing needed — view timeline"). Below the fold: collapsed second case, Vault shortcut, "Message Ana (your handler)" with avatar, VONESA tile.

**Help Now hub.** Full-screen, high contrast, works offline; four buttons ≥88pt tall with icons (car, cross, house, plane), country auto-detected shown top-right ("📍 North Macedonia — emergency 192/193/194"). Beneath: "I just need the accident form (EAS)" text link. No nav chrome except a close X. Loads in <1s from cold; content pack cached on install.

**Intake read-back ("Here's what we see").** The trust-critical screen. Card 1: _Basis_ — green/amber/grey band with one-sentence reason ("The other driver was cited — liability basis looks workable") and the reviewer line ("Confirmed by our legal team within 24h" with a face avatar row). Card 2: _Your deadlines_ — country flag, statute window, "you're in time" reassurance. Card 3: _Documents you'll need_ — checklist with have/need states pre-ticked from uploads. Footer fork: "Get my free Claim Pack" (secondary) / "Have Interdomestik handle it" (primary).

**Fee Math Sheet (component, bottom sheet).** Slider or three preset recovery amounts; live math: recovered → success fee (tier-discounted %, struck-through base rate for members) → _you receive_ in the largest type on screen; a fixed line: "Recover nothing → pay nothing." Link: "Full fee rules." This sheet renders identically in claims, VONESA, and expert-cost approvals — one component, one mental model.

**Consent sheet (medical/sensitive).** Appears exactly when an injury question or medical upload begins. Title: "Your medical information." Three plain statements with toggles: share with my Interdomestik handler / share with a certified medical reviewer / share with partner lawyer if my case goes legal. Footnote: "Change any of this later in Vault. Revoking hides documents from that party." Continue disabled until at least handler-consent is on. No legalese on-screen; policy one tap away.

**VONESA eligibility result.** Plane-path graphic, route + delay auto-filled ("SKP → ZRH · arrived 4h 12m late"), verdict band ("Likely eligible — €400") with the reason in one line and the honesty line in muted text ("Final amount depends on the airline's response; extraordinary-circumstance exceptions apply."). Primary: "Claim it — we handle the airline." The ledger preview under the fold shows the four stages so expectations are set before signing.

**Agent sale screen.** One screen: plan cards (Standard €20 / Familja €35), member phone or email, payment via link/QR/cash-marked, instant activation confirmation with member welcome SMS. Agent sees commission note. Two-minute street sale, no laptop.

---

## 10. Component & Design System Direction

**Feel: calm institution, warm execution.** Not insurtech-playful, not law-firm-grey. The reference emotional register is a good hospital triage nurse: competent, unhurried, on your side.

- **Color:** Ink navy (#0F1B2D-range) as the trust base; warm off-white surfaces; **one action accent (amber)** reserved exclusively for "you need to act"; signal green for progress/positive states; red only for emergencies inside Help Now. Because amber is scarce, the app reads as "mostly handled" — which is the product promise.
- **Type:** humanist sans (e.g., Inter/Source Sans class), body 17pt minimum in flows used under stress; status sentences are typographic heroes, not badges.
- **Core components** (build these once, reuse everywhere): `NextStepCard`, `ProgressRail`, `TimelineEvent`, `ChecklistItem`, `EvidenceShotList` (camera overlay), `FeeMathSheet`, `ConsentSheet`, `ProposalCard` (escalations), `LedgerRow`, `OwnerChip` (You/Us/Insurer/Court), `EligibilityBand` (likely/possible/unlikely), `SignaturePad`.
- **Boundary microcopy pattern:** every automated output carries one quiet, consistent line — "Initial assessment · reviewed by a specialist before anything is final" — as a component (`ReviewBadge`), not ad-hoc disclaimers. One pattern, everywhere, small, honest.
- Dark mode deferred; offline-first for Help Now content and EAS form is **not** deferred.
- Localization from day one: sq / mk / en **+ de** (diaspora segment, §5b); all status sentences written as full localized strings, never concatenated. Bilingual side-by-side rendering for the EAS form is a dedicated component, not two copies.

---

## 11. Copy Tone & Trust Language

**Voice: "We'll take it from here."** First-person plural, active verbs, no passive insurance-speak, no exclamation marks.

| Instead of                                      | Write                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| "Claim status: SUBMITTED"                       | "We sent your file to the insurer on 3 July."                                           |
| "This does not constitute legal advice…" (wall) | "Initial assessment — our legal team confirms it within 24h."                           |
| "Compensation is not guaranteed" (banner)       | "If we recover nothing, you pay nothing." (same fact, framed as the fee promise)        |
| "Automated injury categorization"               | "A first look at your injury category. A certified doctor reviews it before it counts." |
| "Upload required documents"                     | "Two documents left — then we can file."                                                |

Rules: never promise an outcome, always promise the _next action and its date_; name humans (handler avatar + first name) at every review point; render limitations as the presence of humans, not the absence of guarantees; all legal texts complete and one tap away, never in the flow's critical path except at signature ceremonies.

---

## 12. Service-Grouping Alternatives Considered

**A. 10-service catalog (status quo).** Pros: maps to operations, easy to price per service, complete. Cons: forces self-diagnosis, splinters one incident across multiple "products," feels like a menu of paperwork, converts poorly. **Rejected.**

**B. Life-situation missions (recommended, §2).** Pros: matches the three arrival states, hides internal complexity, single intake funnel maximizes conversion, escalations appear only when legally permitted. Cons: requires solid internal routing; ops must map missions back to service SKUs for billing/reporting; harder to shallow-copy for marketing pages (mitigate: marketing site can still list capabilities). **Chosen.**

**C. Emergency vs. planned split (two apps/modes: "SOS" and "Claims").** Pros: extremely clear at the roadside. Cons: splits the funnel exactly where conversion happens (scene → case draft), doubles surface area. **Rejected**, but its core insight — emergency reachable in one tap — is kept via the center Help Now tab.

**D. Claim-type verticals (Car / Injury / Property / Flight as four mini-apps).** Pros: deep tailoring per vertical, VONESA proves the pattern. Cons: 4× flows to maintain, shared spine erodes, cross-type incidents (crash _with_ injury — very common) get awkward. **Partially adopted:** VONESA alone earns vertical treatment because its data source, agreement model, and counterparty are genuinely different; everything else shares one intake with type-specific branches.

---

## 13. Commercial Launch MVP (build first, in this order)

**Wave 1 — the free funnel that proves value (weeks 1–6):**
Help Now hub + car-accident scene guide + evidence coach (offline) · intake wizard with read-back · free Claim Pack PDF · account creation · app shell with 5-tab nav.
_Why first: this is the 30-second value promise and the entire top of funnel. No backend novelty — content + camera + PDF._

**Wave 2 — the member spine (weeks 4–10, overlapping):**
Membership purchase (Paddle exists) + sponsored-code activation + **gift/remote membership for diaspora buyers** (payer/beneficiary decoupled) · case creation from intake · Next Step card + timeline + document checklist · Vault + consent sheets · handler messaging (reuse existing messaging) · push notifications.

**Timing note:** if launch can land by early July, Trip Mode + Help Now alone justify a diaspora marketing push into the August driving corridor — the year's cheapest acquisition window. If not, plan the diaspora push for the winter holiday corridor rather than forcing a mid-August scramble.

**Wave 3 — the money flows (weeks 8–14):**
Agreement Ceremony (service agreement + POA e-sign + Fee Math Sheet) · VONESA end-to-end (flight lookup, eligibility, cession, ledger) · Agent mode (sale + activation) — agents are the distribution channel; they need this at launch.

**Explicitly delayed post-launch:** invalidity-coefficient UI (launch = a request form + human contact inside injury cases), expert-network browsing (launch = staff-proposed ProposalCards only), court-path UI (staff-driven; member sees it as timeline stages), staff mobile triage (web works at launch volume), sponsor admin portal (manual roster onboarding + a monthly emailed report for the first 5 groups), family-seat self-service (manual support flow), dark mode, second-language beyond sq/mk/en.

**Cut entirely:** any member-facing analytics/dashboard widgets; per-service à-la-carte purchase flows; automated final-sounding scores (numeric "case strength 87%" — bands + reasons only).

---

## 14. Post-Launch Enhancements (6–12 months)

Insurer response OCR ("photograph the rejection letter → we read it and propose the escalation") · EAS collaborative fill (two phones, one form, cross-border) · proactive VONESA (calendar/boarding-pass scan → "your flight qualifies, want us to file?") · household hub with shared preparedness · witness/statement capture with guided audio · payout tracking to bank with notifications · sponsor self-service portal with aggregate dashboards · staff mobile triage · expert marketplace with SLAs and ratings · claim-pack sharing to non-member counterparties as a viral loop.

---
