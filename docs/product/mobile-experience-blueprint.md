# Interdomestik IDA — Mobile Experience Blueprint

**Status:** Proposal for commercial launch (post M0–M5)
**Author role:** Mobile product design / UX architecture / service design
**Date:** 2026-07-03

---

## 1. Product Diagnosis

The current product is a web dashboard organized by internal structure (member / agent / staff / admin route groups, a services catalog page, a claims list). That works for a pilot. It fails commercially on mobile for three reasons:

**1. It sells a taxonomy, not a moment.** Eleven services presented as eleven cards forces the user to self-diagnose ("Is my problem a Legal Basis Pre-check or a Procedure Guide?"). Nobody who just had a car crash knows — or should need to know — the difference. The service catalog is Interdomestik's org chart, not the user's mental model. Users arrive in exactly three states: *something just happened* (adrenaline, one-handed phone use, roadside), *I have an ongoing problem* (a claim in flight, checking status), or *I'm evaluating whether this is worth €20/year* (skeptical browsing). The IA must be built around these three states.

**2. The dashboard pattern is wrong for the median user.** A dashboard assumes recurring engagement with varied data. A member touches this app perhaps 4–10 times a year, in bursts around an incident. The right pattern is a **case companion**: one clear "here's where you are, here's the single next step" surface, not KPI tiles.

**3. Trust is asserted, not demonstrated.** Legal-service apps win trust by showing competence fast: a useful checklist in 30 seconds, a claim pack you can hold, a named human reviewing your file. The current pilot buries the first useful output behind registration. Meanwhile the legal boundaries (not an insurer, not final decisions) risk being handled as disclaimer walls — which reads as evasion. Boundaries should be woven into confident language ("a human expert reviews this before anything is final" is a *feature*, not a warning).

**What's right and must be kept:** the shared case/document/timeline/event spine, the role model, the free→member→professional-recovery ladder, and VONESA on the same spine. The redesign is about presentation and flow, not the domain model.

---

## 2. Service Taxonomy Recommendation

**Decision: collapse the 11 services into 4 member-facing missions plus 1 vertical. The 11 services survive as internal capabilities and case stages — never as a browsing catalog.**

| Mission (user-facing) | Absorbs these canonical services |
|---|---|
| **Help Now** — "Something just happened" | #6 Incident Scene Guide (Police vs EAS, Green Card, evidence preservation) |
| **Start a Claim** — "I want compensation" | #1 Legal Basis Pre-check, #2 Procedure Guide, #3 Injury Pre-check, #4 Vehicle/Material Damage Review — all become *steps inside intake*, auto-selected by incident type |
| **My Cases** — "Where do I stand?" | #5 Invalidity Coefficient Review, #7 Professional Expertise, #9 Court Path, #10 Legal Representation — all become *stages and escalations on the case timeline*, surfaced only when relevant |
| **Membership** — "What do I get, what does it cost?" | #8 Member Discounts / Success-Fee Benefit — becomes transparent fee math shown at every agreement moment, plus a benefits page |
| **Flight Delay (VONESA)** — first-class vertical | #11 Passenger Rights, with its own entry point and 3-minute flow, on the shared case spine |

Rules this taxonomy enforces:

- A pre-check is never a product the user "opens." It's a step the intake wizard runs for them based on what happened. The user experiences it as "we checked your basis — looks workable, here's why."
- Experts, court, and legal representation are never menu items. They appear as **proposed next steps on a live case** ("We recommend an independent vehicle expert. Cost: covered under your plan / €X, approve?"). This is both better UX and safer legally: escalation paths only appear after the prerequisites (rejection, low offer, review) the business rules require.
- Invalidity Coefficient Review appears only inside injury cases for members, framed as "request a human specialist review" — a form plus a named-reviewer promise, not an automated tool.
- Discounts/success-fee is not a service; it is **pricing honesty as a UI pattern** (the Fee Math Sheet, §11) rendered before every signature.

---

## 3. Mobile Information Architecture

```
ROOT (state-aware)
│
├── Home (Free or Member variant — see §6)
│
├── Help Now  ★ always reachable: center tab + lock-screen widget + deep link
│   ├── Car accident → scene guide (Police vs EAS decision, photos, Green Card)
│   ├── Injury → immediate steps + evidence
│   ├── Property/other damage → evidence + report guidance
│   └── Flight problem → jumps into VONESA
│
├── Cases
│   ├── Case list (usually 1) → Case Detail
│   │   ├── Next Step card (always exactly one)
│   │   ├── Timeline (member-visible events only)
│   │   ├── Documents (case-scoped view of Vault)
│   │   ├── People (your case handler, experts, lawyer when active)
│   │   └── Agreements & fees (signed docs, fee math, ledger)
│   └── + Start a claim (intake wizard)
│
├── Vault (documents & evidence, cross-case)
│   ├── By case / by type (ID, vehicle, medical, correspondence)
│   ├── Consent boundaries visible per item (esp. medical)
│   └── Camera-first "Add evidence" with guided shot lists
│
└── Account
    ├── Membership & plan (incl. family/household seats)
    ├── Benefits & fee rules (success-fee explainer)
    ├── Sponsored-by badge (if group seat)
    ├── Language, notifications, privacy, data export/delete
    └── Help & contact (real humans, hours, callback)
```

VONESA lives as a prominent Home entry + Help Now branch, not a sixth tab. Its cases appear in Cases like any other — same spine, specialized intake and ledger.

---

## 4. Navigation Model

**Decision: 5-slot bottom tab bar with an elevated center action.**

`Home · Cases · [HELP NOW] · Vault · Account`

- **Help Now is the center slot**, visually elevated (pill/FAB style, amber), always one thumb-tap away. This is the single most important navigation decision: it makes the app's promise physical. Competitors bury emergency guidance in content pages.
- No hamburger menu. Everything reachable in ≤2 taps from a tab root.
- Free (unauthenticated) users get the same shell with Cases/Vault in "preview" state — visible, explained, locked behind account creation only where PII genuinely starts (this converts better than hiding).
- Push notifications deep-link straight to the Next Step card, never to a list.

---

## 5. Role-by-Role Mobile Strategy

| Role | Surface | Scope on mobile |
|---|---|---|
| Public visitor | **Mobile app / PWA, Free Zone** | Help Now, incident checklists, claim-pack generation (no PII), VONESA eligibility check, pricing. Full width of the free funnel. |
| Member | **Mobile app — the primary product** | Everything in §3. |
| Family/household user | Same app, invited seat | Own login, own cases, shared plan. Household admin sees seat list, never case contents. |
| Sponsored member | Same app | Identical to member + "Provided by {Sponsor}" badge. Zero data flows to sponsor beyond aggregate counts. |
| Agent | **Companion mode in the same app** (role-switch), phone-first | Lead capture, membership sale + instant activation (QR / code / payment link), member lookup, claim *stage* visibility only. No claim content. |
| Staff / claims operator | **Desktop-first (existing web)**; mobile = triage companion | Push-notified queue, approve/route/comment on the go. No full case editing on phone. |
| Professional reviewer / partner | **Desktop web, case-scoped invite links**; mobile read-only | Upload findings, sign off. Case-specific access, watermarked docs, audit-logged. |
| Admin / branch / tenant admin | **Desktop only** | Do not spend mobile budget here. |
| Sponsor/group admin | **Desktop web portal** | Roster upload, seat activation stats, aggregate usage. Never individual claims. |

The commercial insight: **one app binary, three modes** (Member, Agent, Staff-triage) selected by role at login. Separate apps fragment distribution and double maintenance.

### 5b. Diaspora — a first-class commercial segment, not a sponsor footnote

The diaspora (Balkan nationals in DE/CH/AT/IT/Nordics) is arguably the highest-value segment and cuts across every layer above. Three distinct diaspora jobs-to-be-done, each with a product answer:

1. **"I'm driving home this summer."** The August corridor (DE/CH → XK/AL/MK) is the single most predictable incident spike: foreign plates, Green Card questions, cross-border liability, language barriers with local police. Product answer: a **Trip Mode** in the preparedness module — "Driving to Kosovo? Get road-ready": Green Card check, EAS in two languages side-by-side (German + Albanian/Macedonian), border/emergency numbers per transit country, offline pack downloaded before departure. Help Now already handles GPS-country ≠ home-country; Trip Mode pre-arms it.
2. **"I want my parents covered back home."** Diaspora members are *buyers* more often than *users*. Product answer: **Gift/Remote membership** — buy Standard/Familja for family in-country in one flow, payer and beneficiary decoupled (payer gets renewal + payment receipts only; beneficiary gets the app, the cases, full privacy from the payer — same boundary discipline as sponsors). This is the digital version of sending remittances and should be marketed exactly that way.
3. **"My incident happened abroad / my counterparty is foreign."** Cross-border claims (foreign insurer, home-country damage or vice versa) are where DIY fails hardest and success-fee recovery is most defensible. Product answer: intake already captures country; a cross-border case badges as such and routes to the specialized desk; copy sells it plainly ("Accident in Germany, insurer ignoring you at home? This is exactly what we do.").

VONESA compounds here: diaspora corridors (ZRH/GVA/FRA/DUS ↔ PRN/SKP/TIA) are chronically disrupted routes — flight-delay checks are a natural acquisition wedge into the diaspora audience before they ever have an accident.

Implications enforced elsewhere in this document: German added to the launch language set (§10), diaspora association rosters in the Group layer (existing), gift membership in Wave 2 (§13), August-readiness as a launch-timing consideration (§13), and payer/beneficiary privacy boundary (§15).

---

## 6. Member Home Screen Concept

The home screen is **state-aware** — it renders one of three layouts:

**State A — Active case (the most common member state):**
1. **Next Step card** (hero, top): case name, status phrase in plain words ("Insurer reviewing — we chase them Tuesday"), and the one action: *yours* ("Upload the police report") or *ours* ("Nothing needed from you — we're on it," with expected date). One card even if multiple cases; others stack beneath, collapsed.
2. Quiet secondary row: Vault shortcut, message-your-handler, VONESA check.
3. Membership strip (renewal, plan, family seats) at the bottom, small.

**State B — Member, no active case:**
1. Greeting + **"What happened?"** launcher: four big tappable situations — Car accident · Injury · Property damage · Flight delayed — plus "Something else."
2. **Preparedness module** (this is what makes the app feel alive between incidents): "Your glovebox is ready — European Accident Statement saved offline · Emergency numbers for 🇽🇰🇦🇱🇲🇰 · Green Card explainer." Seasonal **Trip Mode** variant for diaspora members (§5b): "Driving home? Get road-ready" with bilingual EAS and transit-country packs. Quiet value; drives retention without fabricating engagement.
3. Benefits strip: "0% upfront. We take a success fee only if you recover." → fee explainer.

**State C — Free visitor:**
Same as B, but the header sells the promise ("Accident? We handle the claim. You pay only from what you win.") and the preparedness module doubles as the conversion hook: finishing a checklist offers "Save this + your claim pack — create a free account."

No KPI tiles. No "recent activity" feed. No empty-state dashboards.

---

## 7. Top Workflows (the six that matter)

### 7.1 Help Now (roadside, 30 seconds to value)
1. Tap center tab → four giant buttons: **Car accident / Injury / Property / Flight**. Works logged-out, works offline (bundled content).
2. Car accident path: immediate triage — *"Anyone hurt?"* → yes: call-emergency button with local number auto-set by GPS country; no: continue.
3. **Police or European Accident Statement?** One decision screen, country-aware ("In {country}, call police if: injury, dispute, foreign vehicle, drunk driver. Otherwise the EAS is enough."). EAS available as annotated offline form with a fill-together guide.
4. **Evidence coach:** guided camera — shot list with ghost overlays (wide scene, plates, damage close-ups, documents, road signs, witnesses' contacts). Photos geo/time-stamped into a local incident bundle.
5. Green Card / cross-border context appears only when GPS country ≠ home country or a foreign plate is flagged.
6. Exit: "You're covered for now. Want us to take it from here?" → creates a case draft pre-filled with everything captured (free account → member conversion point).

### 7.2 Claim intake ("Start a claim")
One wizard, 6–9 screens, conversational one-question-per-screen:
1. What happened? (situation picker — sets the internal service routing)
2. When & where? (date, country → drives Procedure Guide selection and deadline math; show deadline reassurance immediately: "In {country} you have until ~{date}. You're in time.")
3. Who was involved? (parties, insurer if known, injuries y/n → injury path adds explicit medical-consent screen before any health question)
4. What do you have? (evidence quick-add from Help Now bundle or camera/files — skippable)
5. **Instant read-back:** "Here's what we see" — basis pre-check result in plain language with a confidence band ("Workable basis: {reason}. A specialist confirms this within 24h."), procedural next steps for that country, document checklist.
6. Fork: **Free** → downloadable/shareable Claim Pack (PDF: facts, checklist, deadlines, EAS, letter template) — real value, zero PII beyond what they typed. **Member** → "We take it from here" → case created, handler assigned, 24h SLA promise on screen.

The pre-checks (#1–#4) run inside step 5 invisibly. The user never chooses between them.

### 7.3 Evidence & document upload
- **Camera-first.** Every upload entry opens the camera with a context-aware shot list; gallery/files behind a secondary tab.
- Auto-categorization by prompt context ("this is your police report") with a one-tap correct.
- Every item shows: which case, who can see it (Just you / Your handler / + Expert / + Partner lawyer), and for medical items a distinct consent chip that was explicitly granted and is revocable.
- Checklist-driven: the case's document checklist shows ✅/⏳ per required item; uploads tick items; the Next Step card updates automatically. Uploading feels like progress, not filing.

### 7.4 Case timeline & next-step model
- **The invariant: every case shows exactly one Next Step, owned by exactly one party** (You / Interdomestik / Insurer / Court), with a date expectation. If the ball is with the insurer: "Waiting on {insurer} — they have until {date}. If they miss it, we escalate." This single rule kills the #1 complaint in claims UX: silence.
- Timeline below: member-visible events only, newest first, human phrasing ("We sent your file to the insurer," not "Status → SUBMITTED"). Milestones (Filed → Verified → Assessed → Negotiating → Resolved) as a compact progress rail on top.
- Escalation moments (expert, court, lawyer) appear here as **proposal cards** with the Fee Math Sheet and explicit approval — never automatic.

### 7.5 VONESA flight-delay flow (3 minutes, mostly automatic)
1. Entry: Home tile / Help Now → Flight. "Flight delayed or cancelled? Check in 30 seconds."
2. Flight number + date → flight-data lookup auto-fills route, delay, distance → **eligibility read**: "Likely eligible: €400 under EC261. Here's why." (band: likely / possible / unlikely — with reason, never a promise).
3. Passenger details + boarding pass photo (OCR).
4. **One agreement screen:** assignment/cession as default ("We pursue this in our name — you do nothing"), POA fallback where cession isn't accepted; fee math on the same screen ("If we recover €400, you receive €{net}. If we recover nothing, you pay nothing."). One signature.
5. Confirmation → case appears in Cases with its own **compensation ledger** (claimed → airline response → recovered → your payout) and the same Next Step model ("We submitted to {airline}. They typically respond in 6–8 weeks. We chase on {date}.")
6. Free users can run steps 1–2 without an account; the eligibility result is the conversion hook.

### 7.6 Professional Recovery authorization (the Agreement Ceremony)
This is the legally and commercially critical moment; it gets a deliberate, unhurried 4-screen ceremony, always triggered by a human-reviewed proposal, never self-serve from a menu:
1. **What we'll do** — scope in plain language, named handler, what happens first, expected timeline.
2. **What it costs** — the Fee Math Sheet: interactive example ("If we recover €5,000 → success fee {tier %} = €750 → you receive €4,250. If we recover €0 → you pay €0."), member-tier discount shown, expert/court costs handled as separate explicit approvals later.
3. **What you're signing** — service agreement + POA/assignment, summarized in 5 bullets, full text one tap away, e-sign (draw or typed + OTP). Sensitive-document access consent is its own toggle set, not bundled.
4. **Confirmation** — signed pack lands in Vault, case flips to Professional Recovery, audit trail note shown ("Signed {date}, {method}"). A cooling-off/withdrawal note phrased as confidence: "You can withdraw before we file; your documents remain yours."

---

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

**Intake read-back ("Here's what we see").** The trust-critical screen. Card 1: *Basis* — green/amber/grey band with one-sentence reason ("The other driver was cited — liability basis looks workable") and the reviewer line ("Confirmed by our legal team within 24h" with a face avatar row). Card 2: *Your deadlines* — country flag, statute window, "you're in time" reassurance. Card 3: *Documents you'll need* — checklist with have/need states pre-ticked from uploads. Footer fork: "Get my free Claim Pack" (secondary) / "Have Interdomestik handle it" (primary).

**Fee Math Sheet (component, bottom sheet).** Slider or three preset recovery amounts; live math: recovered → success fee (tier-discounted %, struck-through base rate for members) → *you receive* in the largest type on screen; a fixed line: "Recover nothing → pay nothing." Link: "Full fee rules." This sheet renders identically in claims, VONESA, and expert-cost approvals — one component, one mental model.

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

| Instead of | Write |
|---|---|
| "Claim status: SUBMITTED" | "We sent your file to the insurer on 3 July." |
| "This does not constitute legal advice…" (wall) | "Initial assessment — our legal team confirms it within 24h." |
| "Compensation is not guaranteed" (banner) | "If we recover nothing, you pay nothing." (same fact, framed as the fee promise) |
| "Automated injury categorization" | "A first look at your injury category. A certified doctor reviews it before it counts." |
| "Upload required documents" | "Two documents left — then we can file." |

Rules: never promise an outcome, always promise the *next action and its date*; name humans (handler avatar + first name) at every review point; render limitations as the presence of humans, not the absence of guarantees; all legal texts complete and one tap away, never in the flow's critical path except at signature ceremonies.

---

## 12. Service-Grouping Alternatives Considered

**A. 10-service catalog (status quo).** Pros: maps to operations, easy to price per service, complete. Cons: forces self-diagnosis, splinters one incident across multiple "products," feels like a menu of paperwork, converts poorly. **Rejected.**

**B. Life-situation missions (recommended, §2).** Pros: matches the three arrival states, hides internal complexity, single intake funnel maximizes conversion, escalations appear only when legally permitted. Cons: requires solid internal routing; ops must map missions back to service SKUs for billing/reporting; harder to shallow-copy for marketing pages (mitigate: marketing site can still list capabilities). **Chosen.**

**C. Emergency vs. planned split (two apps/modes: "SOS" and "Claims").** Pros: extremely clear at the roadside. Cons: splits the funnel exactly where conversion happens (scene → case draft), doubles surface area. **Rejected**, but its core insight — emergency reachable in one tap — is kept via the center Help Now tab.

**D. Claim-type verticals (Car / Injury / Property / Flight as four mini-apps).** Pros: deep tailoring per vertical, VONESA proves the pattern. Cons: 4× flows to maintain, shared spine erodes, cross-type incidents (crash *with* injury — very common) get awkward. **Partially adopted:** VONESA alone earns vertical treatment because its data source, agreement model, and counterparty are genuinely different; everything else shares one intake with type-specific branches.

---

## 13. Commercial Launch MVP (build first, in this order)

**Wave 1 — the free funnel that proves value (weeks 1–6):**
Help Now hub + car-accident scene guide + evidence coach (offline) · intake wizard with read-back · free Claim Pack PDF · account creation · app shell with 5-tab nav.
*Why first: this is the 30-second value promise and the entire top of funnel. No backend novelty — content + camera + PDF.*

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

## 15. Risks & Open Business Questions

1. **POA / assignment validity per country.** E-signature (draw/OTP) may not satisfy POA formality in every target jurisdiction (notarization requirements). Need a per-country legal matrix before the Agreement Ceremony ships; fallback = print-and-sign with in-app tracking. *Owner: legal. Blocks Wave 3.*
2. **Medical data (GDPR Art. 9).** Injury pre-check processes special-category data. The consent sheet is necessary but not sufficient — need DPIA, retention rules, and reviewer-access logging before injury intake goes public. *Blocks injury path, not car/property.*
3. **Cession vs. POA default in VONESA per airline/jurisdiction** — some airlines reject assignment; the fallback switch must be case-level, and the fee math may differ. Confirm with the recovery partner.
4. **24h human-review SLA capacity.** The read-back screen promises specialist confirmation in 24h. If review staffing can't hold that at launch volume, soften to "within 1 business day" *before* launch — a broken trust promise in week one is unrecoverable.
5. **Success-fee display vs. regulation.** Displaying fee math as quasi-financial projection may attract consumer-credit/claims-management regulation in some markets. Verify wording ("example," not "estimate") per country.
6. **Sponsor privacy boundary** is a contractual promise, not just UI — sponsor agreements must mirror the "aggregate only" rule, and the API must enforce it (no individual endpoints for sponsor-admin role, period).
7. **App store vs. PWA.** Recommendation: ship as installable PWA for pilot markets *plus* store-wrapped build (Capacitor-class) for launch — store presence is a trust signal in the Balkans' consumer market; PWA alone under-converts. Decide by Wave 2.
8. **Agent cash sales** (street sales culture) vs. Paddle-only rails — the "cash-marked" activation needs a reconciliation process or it becomes a fraud vector.
9. **Free Claim Pack cannibalization?** Bet: no — the pack converts skeptics and the people who only ever wanted the form were never buyers. Measure pack→member conversion; if <3% after 90 days, gate the letter template (not the checklist).
10. **Family/household abuse** (one Familja plan shared beyond household) — accept at launch, monitor case-per-plan ratio.
11. **Gift-membership privacy boundary (diaspora payer vs. beneficiary).** The payer must see renewal/payment only — never case existence or content. Same enforcement rule as sponsors: no API surface, not just no UI. Also verify Paddle supports payer-country billing with beneficiary-country service delivery (tax/invoice implications).
12. **Cross-border case economics.** Foreign-insurer recovery (esp. DE/CH counterparties) has different cost structures and may need in-country partners; confirm the success-fee % holds before marketing the cross-border promise to diaspora.

---

## 16. Final Design Review Checklist

Ship-gate for every member-facing release:

- [ ] Every case, in every state, shows exactly one Next Step with an owner and a date.
- [ ] Help Now reachable in one tap from every screen; car-accident guide works in airplane mode.
- [ ] First useful output (checklist or eligibility read) reachable in <30s from cold install, no account.
- [ ] No automated output presented as final: every pre-check carries the `ReviewBadge`; bands + reasons, never bare scores.
- [ ] Fee math shown *before* every signature; "recover nothing → pay nothing" present at every agreement moment.
- [ ] No PII collected in the Free Zone before the fork screen; medical questions always preceded by the Consent Sheet.
- [ ] POA/agreement full text accessible within one tap of every summary; signed copies land in Vault immediately.
- [ ] Sponsor-admin role has no route, API, or export exposing individual case data.
- [ ] All status copy is a full localized human sentence (sq/mk/en), no concatenated fragments, no internal status codes visible.
- [ ] Push notifications deep-link to the Next Step card and render meaningfully when the app is opened cold.
- [ ] Amber appears only where the member must act; if a screen has two amber elements, the screen is wrong.
- [ ] Every escalation (expert/court/lawyer) is a staff-proposed card with explicit approval — none self-serve, none automatic.
- [ ] Accessibility: 17pt+ body in stress flows, ≥44pt targets, full flows with VoiceOver/TalkBack, contrast AA.
- [ ] A member who does nothing for 30 days receives at most one meaningful notification — silence discipline is a trust feature.

---

*The one-line thesis: stop selling eleven services; sell one promise — "something happened, we'll take it from here" — and let the case spine, the Next Step invariant, and honest fee math do the trust-building that disclaimers never will.*
