---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
---

# Interdomestik IDA — Mobile Experience Blueprint — Part 2

> Status: **Design input — no implementation authority.**

Part 2 of [mobile-experience-blueprint.md](./mobile-experience-blueprint.md).

## 5. Role-by-Role Mobile Strategy

| Role                            | Surface                                                       | Scope on mobile                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public visitor                  | **Mobile app / PWA, Free Zone**                               | Help Now, incident checklists, claim-pack generation with no account and no server-side PII before explicit handoff, VONESA eligibility check, pricing. Full width of the free funnel. |
| Member                          | **Mobile app — the primary product**                          | Everything in §3.                                                                                                                                                                      |
| Family/household user           | Same app, invited seat                                        | Own login, own cases, shared plan. Household admin sees seat list, never case contents.                                                                                                |
| Sponsored member                | Same app                                                      | Identical to member + "Provided by {Sponsor}" badge. Zero data flows to sponsor beyond aggregate counts.                                                                               |
| Agent                           | **Companion mode in the same app** (role-switch), phone-first | Lead capture, membership sale + instant activation (QR / code / payment link), member lookup, claim _stage_ visibility only. No claim content.                                         |
| Staff / claims operator         | **Desktop-first (existing web)**; mobile = triage companion   | Push-notified queue, approve/route/comment on the go. No full case editing on phone.                                                                                                   |
| Professional reviewer / partner | **Desktop web, case-scoped invite links**; mobile read-only   | Upload findings, sign off. Case-specific access, watermarked docs, audit-logged.                                                                                                       |
| Admin / branch / tenant admin   | **Desktop only**                                              | Do not spend mobile budget here.                                                                                                                                                       |
| Sponsor/group admin             | **Desktop web portal**                                        | Roster upload, seat activation stats, aggregate usage. Never individual claims.                                                                                                        |

The commercial insight: **one app binary, three modes** (Member, Agent, Staff-triage) selected by role at login. Separate apps fragment distribution and double maintenance.

### 5b. Diaspora — a first-class commercial segment, not a sponsor footnote

The diaspora (Balkan nationals in DE/CH/AT/IT/Nordics) is arguably the highest-value segment and cuts across every layer above. Three distinct diaspora jobs-to-be-done, each with a product answer:

1. **"I'm driving home this summer."** The August corridor (DE/CH → XK/AL/MK) is the single most predictable incident spike: foreign plates, Green Card questions, cross-border liability, language barriers with local police. Product answer: a **Trip Mode** in the preparedness module — "Driving to Kosovo? Get road-ready": Green Card check, EAS in two languages side-by-side (German + Albanian/Macedonian), border/emergency numbers per transit country, offline pack downloaded before departure. Help Now already handles GPS-country ≠ home-country; Trip Mode pre-arms it.
2. **"I want my parents covered back home."** Diaspora members are _buyers_ more often than _users_. Product answer: **Gift/Remote membership** — buy Standard/Familja for family in-country in one flow, payer and beneficiary decoupled (payer gets renewal + payment receipts only; beneficiary gets the app, the cases, full privacy from the payer — same boundary discipline as sponsors). This is the digital version of sending remittances and should be marketed exactly that way.
3. **"My incident happened abroad / my counterparty is foreign."** Cross-border claims (foreign insurer, home-country damage or vice versa) are where DIY fails hardest and success-fee recovery is most defensible. Product answer: intake already captures country; a cross-border case badges as such and routes to the specialized desk; copy sells it plainly ("Accident in Germany, insurer ignoring you at home? This is exactly what we do.").

VONESA compounds here: diaspora corridors (ZRH/GVA/FRA/DUS ↔ PRN/SKP/TIA) are chronically disrupted routes — flight-delay checks are a natural acquisition wedge into the diaspora audience before they ever have an accident.

Implications enforced elsewhere in this document: German added to the launch language set (§10), diaspora association rosters in the Group layer (existing), gift membership in Wave 2 (§13), August-readiness as a launch-timing consideration (§13), and payer/beneficiary privacy boundary (§15).

---

## 6. Member Home Screen Concept

The home screen is **state-aware** — it renders one of three layouts:

**State A — Active case (the most common member state):**

1. **Next Step card** (hero, top): case name, status phrase in plain words ("Insurer reviewing — we chase them Tuesday"), and the one action: _yours_ ("Upload the police report") or _ours_ ("Nothing needed from you — we're on it," with expected date). One card even if multiple cases; others stack beneath, collapsed.
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
2. Car accident path: immediate triage — _"Anyone hurt?"_ → yes: call-emergency button with local number auto-set by GPS country; no: continue.
3. **Police or European Accident Statement?** One decision screen, country-aware ("In {country}, call police if: injury, dispute, foreign vehicle, drunk driver. Otherwise the EAS is enough."). EAS available as annotated offline form with a fill-together guide.
4. **Evidence coach:** guided camera — shot list with ghost overlays (wide scene, plates, damage close-ups, documents, road signs, witnesses' contacts). Photos are stored in a local-only incident bundle until the user explicitly shares or attaches them; the app must make clear that the bundle stays on this device and can be deleted.
5. Green Card / cross-border context appears only when GPS country ≠ home country or a foreign plate is flagged.
6. Exit: "You're covered for now. Want us to take it from here?" → creates a case draft pre-filled with everything captured (free account → member conversion point).

### 7.2 Claim intake ("Start a claim")

One wizard, 6–9 screens, conversational one-question-per-screen:

1. What happened? (situation picker — sets the internal service routing)
2. When & where? (date, country → drives Procedure Guide selection and deadline math; show deadline reassurance immediately: "In {country} you have until ~{date}. You're in time.")
3. Who was involved? (parties, insurer if known, injuries y/n → injury path adds explicit medical-consent screen before any health question)
4. What do you have? (evidence quick-add from Help Now bundle or camera/files — skippable)
5. **Instant read-back:** "Here's what we see" — basis pre-check result in plain language with a confidence band ("Workable basis: {reason}. A specialist confirms this within 24h."), procedural next steps for that country, document checklist.
6. Fork: **Free** → downloadable/shareable Claim Pack (PDF: facts, checklist, deadlines, EAS, letter template) — real value, with no server-side PII until the user explicitly creates, shares, or submits the pack. **Member** → "We take it from here" → case created, handler assigned, 24h SLA promise on screen.

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
