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

# Interdomestik IDA — Mobile Excellence Dossier

> Status: **Design/product preparation only — no implementation authorized.** M0→M5 is not fully closed (final `T-503` closeout outstanding; `activeSlice=null / blocked_requires_current_authority`). This dossier proposes no changes to proxy, routing, auth, session, tenancy, billing provider, VONESA runtime, SVC, CQRS, or tracker authority. Everything here is consumable by design gates (`MOB-DG01` onward) after M0→M5 closeout and fresh current-authority resolution.

---

## 1. Mobile Experience North Star

**Candidate promise (one sentence, everywhere; public wording gated by L5 and the expert-cost-on-lost-case decision):**

> **"Something happened? We take it from here — and you only pay from what we recover."**

Every screen either delivers this promise or gets out of its way. The sq/mk/de renderings are fixed at L2/L5 review, not improvised per surface.

**What the app should feel like emotionally.** The moment a competent person takes over. Not an insurance portal (form-filling dread), not a legal-tech toy (chatbot glibness). The register is the capable relative who "knows how these things work": calm, specific, slightly protective. Emotional arc per session: _arrive anxious → see the one thing that matters → leave lighter._ Measurable proxy: a member session that ends without the member needing to do anything should feel complete, not empty — "Nothing needed from you. We're on it." is a satisfying end state, and the design treats it as one.

**What users must understand in the first 10 seconds (cold, logged out):**

1. This helps me _right now_ if something just happened (Help Now is visually unmissable).
2. It's free to start — no account, no card, no forms before value.
3. Real humans handle my case; this is not a bot verdict machine.
4. If nothing is recovered, I pay nothing.

Nothing else is allowed to compete for those 10 seconds — no feature carousel, no membership pitch, no cookie-wall theatrics (consent UI defers until something actually needs it).

**Trust signals ranked for Balkans + diaspora users** (in order of impact, from the segment realities: institutional distrust is high, personal-network trust is high, German procedural standards are the diaspora benchmark):

1. **Money math shown before commitment** — the Fee Math Sheet with "recover nothing → pay nothing" beats any badge or certificate.
2. **Named humans with response-time promises kept** — "Ana, your handler, replies within 1 business day" is only a trust signal if it's true; a broken named-human promise is worse than an anonymous queue (see red-team §9).
3. **Physical anchoring** — branch/partner cities, real address, real phone number with hours, in the app footer and Account. Diaspora users verify companies via "does it exist where my family lives."
4. **Language respect** — flawless sq/mk, and de for diaspora surfaces; a single broken translation costs more trust than a missing feature.
5. **Works at the roadside** — offline reliability _is_ a trust signal: an app that works in a border-crossing dead zone is an app that will show up when it matters.
6. **They're against the insurer, for me** — positioning "we deal with the insurer so you don't" converts the not-an-insurer legal boundary into an allegiance statement.
7. **No data grabbing** — "your photos stay on your phone until you send them" and zero server-side PII before explicit handoff, stated plainly.

---

## 2. Modern Mobile UX Audit (blueprint vs. 2026-grade expectations)

Verdict per dimension: **OK** (blueprint already meets the bar), **GAP** (needs the stated fix before/at the relevant gate).

**One-handed use — GAP.** The blueprint implies it (bottom tabs, big buttons) but never specifies a reachability contract. Fix, binding for all MOB-* screens: all primary actions and the Help Now tab within the bottom 60% of the viewport; nothing tappable-critical in the top 15%; destructive/secondary actions may live high (deliberately harder to hit); bottom sheets over modals everywhere; back = system gesture + visible affordance, never gesture-only.

**Stress-state UX — OK, two additions.** One-decision-per-screen and 88pt emergency buttons are specified. Add: (a) haptic confirmation on every capture/step-complete in Help Now (visual confirmation alone fails with shaking hands and sun glare); (b) a persistent "call a human" escape hatch on every Help Now screen — stressed users bail to phone calls, and the app should make that a feature (hotline per `c03`), not a failure.

**Offline-first emergency flows — OK.** Bundled content, airplane-mode acceptance criterion, explicit Trip Mode downloads, no-member-data cache guard are all specified (gate packet §3, §5). One addition: an unobtrusive offline indicator inside Help Now ("Saved on your phone — works without signal") — offline capability that users don't _know about_ builds no pre-trust.

**Mobile performance — GAP (was unspecified).** Budgets now defined in §7 of this dossier; they become gate acceptance criteria language when slices are promoted.

**Accessibility — OK, extended.** 17pt stress-flow body, 44pt targets, AA contrast, VoiceOver/TalkBack flows are in the ship gate. Add: Dynamic Type support up to 135% without layout breakage on `NextStepCard` and Help Now (elderly members and reading-glasses-free roadside use are the same requirement); all camera overlay guidance mirrored as text prompts; captions/transcripts if any instructional video ever ships (prefer none — see §6).

**PWA / installability — GAP (decision was deferred; the UX contract shouldn't be).** Regardless of the PWA-vs-store decision: never show an install prompt before the user has received value; the install moment is _after_ claim-pack generation or Trip Mode download ("Keep this on your phone for the road"), where installation is the natural way to keep the thing they just made. Home-screen icon + offline shell must survive 30 days of non-use without eviction surprises (persistent storage request at Trip Mode download, where the user motivation is obvious).

**Push / deep-link behavior — GAP.** Deep-link-to-Next-Step is specified; permission choreography is not. Fix: never request notification permission at first open; request it at case creation with the reason on screen ("We'll tell you when the insurer responds — usually 2–3 updates a month, nothing else"); if denied, fall back to email/SMS silently, never re-nag; every push renders meaningfully cold (the deep-link target hydrates from the read model without requiring a warm session).

**Perceived speed — GAP.** Fix as system rules: Help Now surfaces render synchronously from local content (no spinner may ever appear inside Help Now — if one does, the architecture is wrong); member surfaces use skeletons only when >300ms, with the `NextStepCard` skeleton reserving exact final layout (zero shift); checklist ticks and consent toggles update optimistically with background reconciliation; the claim-pack "generating" moment is allowed to take up to 3 seconds and should — a deliberate progress beat ("Assembling your pack — checking {country} deadlines…") makes the output feel substantial. Perceived speed is also _fewer screens_: every flow in §3 states its screen count as a budget.

**Touch ergonomics — GAP (implicit → explicit).** Rules: minimum 44×44pt targets with 8pt separation; the single amber action per screen sits in the thumb arc (bottom-right biased for LTR); swipe actions always have visible-button equivalents; no long-press-only affordances; camera shutter at natural phone-grip position in landscape and portrait.

**Localization — OK.** Copy-system doc covers full-sentence integrity, locale gates, bilingual EAS, stress-flow readability. One addition: locale follows the _user_, not the country pack — a diaspora user in `de` locale reading the KS country pack gets de UI chrome with the KS pack's bilingual content pairing.

**Trust and legal boundaries — OK.** ReviewBadge as a structural component, clarity-marker catalog, fee-math-before-signature, staff-proposed escalations are all contractual. The audit's one warning feeds §9: the system is now so disciplined about boundaries that the residual risk is _over-promising operationally_ (dates, SLAs, "we escalate") rather than legally — dates shown to members must come from rules the ops team actually meets.

---

## 3. Best-In-Class Flow Redesigns

Format per screen — **Purpose / Primary / Secondary / Trust cue / States / A11y / Perf / Copy (en example; sq/mk/de per copy system).** Screen counts are budgets: exceeding them at build time requires a gate note. Components referenced are the contracted primitives.

### 3.1 Help Now (5 screens max, MOB-01)

**HN-1 · Hub.**
Purpose: route a stressed person in one tap. Primary: four ≥88pt situation buttons (Car / Injury / Property / Flight¹). Secondary: "I just need the accident form (EAS)"; persistent "Call {hotline}" pill. Trust cue: "📍 {country} — works without signal" line. States: no loading state permitted (local content); error state only for GPS-country failure → manual country picker. A11y: buttons read as "Car accident — get step-by-step help"; first focus on Car. Perf: renders from cached shell <400ms warm, <1.5s cold. Copy: title "What happened?" — nothing else above the buttons.
¹ Flight routes to a static "coming soon + hotline" card until WS-F exists; it must not dead-end.

**HN-2 · Safety triage (car path).**
Purpose: the only life-safety decision. Primary: "Someone is hurt → Call {192}" (full-width, red — the only red in the app). Secondary: "No one is hurt → continue". Trust cue: local emergency number shown with country flag (proves local competence). States: none (static). A11y: emergency button is a `tel:` link, announced with number. Perf: instant. Copy: "First: is anyone hurt?"

**HN-3 · Police or EAS decision.**
Purpose: the highest-value guidance moment. Primary: country-aware rule card — "Call the police if any of these:" (injury, dispute, foreign vehicle, suspected alcohol, heavy damage) with tap-to-confirm checklist; below, "None of these? The European Accident Statement is enough." Secondary: "Open the EAS form". Trust cue: `ReviewBadge(informational)` + L2 sign-off country line ("Verified for {country}, {month yyyy}"). States: unsigned-country → generic-EU guidance variant with explicit "general guidance" marker. A11y: rule list is a real list, checkable via switch controls. Perf: static. Copy: rules ≤90 chars each, verb-first.

**HN-4 · Scene actions (checklist).**
Purpose: keep them productive while adrenaline burns off. Primary: `ChecklistItem` list — move to safety, hazard lights, photos (→ Evidence Coach), exchange details, witnesses, don't admit fault. Secondary: "Call {hotline}". Trust cue: items tick with haptic; progress persists locally. States: partially-complete state resumes on re-entry. A11y: each item actionable + describable. Perf: local state only. Copy: "Don't sign anything you don't understand. Don't agree to fault at the scene."

**HN-5 · Exit / handoff.**
Purpose: convert the incident into a next step without pressure. Primary: "Get your free Claim Pack" (assembles everything captured). Secondary: "I'm done — save this on my phone". Trust cue: "Everything above stays on your phone until you choose to send it." States: nothing-captured variant still offers the pack (guidance-only). A11y: summary readable as one region. Perf: instant; pack generation deferred to CP flow. Copy: "You've done the important parts. Want us to take it from here?"

### 3.2 Trip Mode (4 screens, MOB-01)

**TM-1 · Entry.** Purpose: seasonal preparedness pitch inside the preparedness module. Primary: "Driving to {KS/MK/AL}? Get road-ready". Secondary: dismiss (resurfaces next season, not next session). Trust cue: "Used by drivers on the {DE→KS} route" only if true; otherwise omit. States: off-season = not rendered. A11y: standard. Perf: static tile. Copy: "Driving home this summer?"

**TM-2 · Corridor setup.** Purpose: pick route once. Primary: from/to country pickers → transit list auto-derived. Secondary: manual transit editing. Trust cue: per-country pack version + "Verified {date}" lines (L2 binding). States: unsigned transit country → pack listed as "general guidance only". A11y: pickers are native selects. Perf: instant. Copy: "Your route: {DE} → {AT} → {HU} → {RS} → {KS}".

**TM-3 · Pack download.** Purpose: explicit offline commitment. Primary: "Download for the road ({n} MB)" — triggers persistent-storage request with honest explanation. Secondary: per-country toggle. Trust cue: "Works at the border with no signal." States: downloading (progress per pack), downloaded (✓ + size), update-available (pack version bump). A11y: progress announced. Perf: packs ≤3 MB per country (budget §7). Copy: "Saved. Even airplane mode can't stop it."

**TM-4 · Road-ready checklist.** Purpose: pre-departure confidence + the glovebox moment. Primary: checklist — Green Card, EAS (bilingual, offline), emergency numbers per transit country, vehicle documents reminder. Secondary: share checklist to a family member (plain link/text, no account). Trust cue: bilingual EAS preview (de+sq side-by-side) — the single most shareable artifact in the app. States: incomplete = amber count. A11y: list semantics. Perf: local. Copy: "Green Card: check the dates before you leave — border police will."

### 3.3 Evidence Coach (3 screens, MOB-01)

**EC-1 · Shot list.** Purpose: turn "take photos" into a completable task. Primary: `EvidenceShotList` for the scenario — wide scene ×2, plates, damage close-ups, documents, road context; each shows done/pending. Secondary: skip to free-shoot. Trust cue: "Photos stay on this phone. Nothing uploads." States: camera-permission-denied → text checklist variant (contract requirement). A11y: every shot prompt has text + example silhouette description. Perf: list is local; thumbnails lazy. Copy: "6 photos protect your claim. Start wide."

**EC-2 · Guided camera.** Purpose: get usable photos from shaking hands. Primary: shutter with ghost overlay per shot type; auto-advance to next prompt. Secondary: retake / skip shot. Trust cue: timestamp chip on capture ("This time-stamp helps prove your claim"). States: low-light warning; storage-full error with clear count of what saved. A11y: overlay guidance also spoken via prompt text; shutter ≥60pt. Perf: capture-to-confirm <500ms with haptic. Copy: overlay prompts ≤6 words ("Both cars, whole scene").

**EC-3 · Bundle review.** Purpose: closure + integrity. Primary: grid of captures grouped by prompt; "Done — keep on my phone". Secondary: delete individual items. Trust cue: "Saved locally · {n} items · nothing sent" persistent footer. States: empty (all skipped) → returns to checklist gracefully. A11y: grid navigable, per-item labels ("Damage close-up, 14:32"). Perf: local render. Copy: "Your evidence bundle is safe on this phone."

### 3.4 Claim Pack (3 screens, MOB-01)

**CP-1 · Read-back ("Here's what we see").** Purpose: the trust-critical synthesis. Primary: three cards — _Basis_ (band + one-sentence reason + `ReviewBadge(pending_human_review)`), _Deadlines_ ("In {country}, claims of this type generally allow until ~{range}. Our team confirms your deadline before we file." — L2-reviewed range phrasing), _Documents_ (have/need checklist pre-ticked from bundle). Secondary: edit answers. Trust cue: the ReviewBadge — a machine that says a human checks it. States: loading = the one permitted deliberate beat (≤3s, staged messages); insufficient-info variant asks for the one missing fact, never a form. A11y: cards as regions; band never color-only. Perf: assembled client-side from intake answers + static country rules. Copy: "Workable basis: the other driver was cited. Our team confirms within 1 business day."²
² SLA phrasing per ship-gate check: validate against staffing before launch.

**CP-2 · Pack preview.** Purpose: make the free output feel substantial. Primary: paginated preview (facts, checklist, deadlines, EAS, letter template) + "Save / Share PDF". Secondary: regenerate after edits. Trust cue: professional document design — the pack is the trust artifact non-members keep and show others. States: generation error → retry with bundle intact. A11y: PDF also available as accessible HTML view. Perf: generation ≤3s budget. Copy: cover line "Prepared {date} · Free of charge · Not legal advice — a starting file" (marker catalog).

**CP-3 · Fork.** Purpose: the honest choice. Primary: "Have Interdomestik handle it" → account creation (§4 ladder). Secondary: "Just the pack, thanks" — equal visual dignity, no guilt styling. Trust cue: fee promise line under the primary ("No win, no fee — see the exact math"→ FeeMathSheet when MOB-05a exists; static reviewed line until then). States: n/a. A11y: both paths equally reachable. Perf: instant. Copy: "Either way, the pack is yours."

### 3.5 Member Home (3 state-variants, MOB-02 for A; B/C ride MOB-01 surfaces)

**MH-A · Active case.** Purpose: answer "where do I stand?" before a scroll. Primary: `NextStepCard` hero (one action or "nothing needed"). Secondary: message handler; Vault shortcut; collapsed other cases. Trust cue: owner chip + date — silence killed structurally. States: skeleton (exact-layout, >300ms only); read-model-stale banner ("Updated {time} — refreshing") rather than spinners; error → last-known state with timestamp, never blank. A11y: card is first landmark after nav; action first-focusable. Perf: read-model payload <10KB; card interactive <1s warm. Copy: per status-sentence catalog.

**MH-B · Member, no case.** Purpose: quiet readiness. Primary: "What happened?" launcher (4 situations). Secondary: preparedness module (Trip Mode seasonal), benefits strip. Trust cue: "Your membership: active · {plan} · renews {date}" one-liner, not a dashboard. States: renewal-due variant swaps the strip to a calm renewal card (no red). A11y: launcher = the HN-1 semantics. Perf: static + one membership read. Copy: greeting by first name, then silence — no engagement bait.

**MH-C · Free visitor.** Purpose: promise + immediate utility. Primary: Help Now launcher under the promise line. Secondary: preparedness preview (finishing it offers account save). Trust cue: the §1 promise verbatim + physical-anchor footer. States: n/a. A11y: standard. Perf: this is the funnel entry — full §7 cold budget applies. Copy: "Accident? We handle the claim. You pay only from what we win back."³
³ "win back" phrasing subject to L5 review; fallback "recover".

### 3.6 Case Detail / Next Step (4 screens, MOB-02)

**CD-1 · Next Step (default tab).** As MH-A hero expanded: full status sentence, expectation with escalation note ("If they miss it, we escalate — that's part of the service"), action button when member-owned. Trust cue: `ProgressRail` above; every stage tappable → plain-language explanation of what that stage means. States: awaiting-date explicit variant; overdue variant auto-swaps copy (catalog row exists — no improvisation). A11y/Perf: as MH-A. Copy: catalog only.

**CD-2 · Timeline.** Purpose: the receipts. Primary: `TimelineEvent` list, newest first, human sentences, attachment chips. Secondary: filter by documents/messages. Trust cue: events show _our_ actions prominently ("We chased the insurer — 2nd reminder") — proof of work happening while the member slept. States: erased-subject renders T-104h skeleton; empty timeline impossible by design (case creation is an event). A11y: list with date group headers. Perf: paginated 20/fetch. Copy: past-tense catalog sentences.

**CD-3 · Documents (case-scoped Vault view).** `ChecklistItem` document list with have/need/in-review/accepted states; camera-first add. Trust cue: consent chips visible per sensitive item (read-only until MOB-03). States: upload progress inline; rejected-document state carries the reason + retake path. A11y: status not color-only. Perf: thumbnails lazy; upload resumable. Copy: "Two documents left — then we can file."

**CD-4 · Proposal (when staff proposes escalation).** `ProposalCard` full screen: what/why/who (rationale from staff, `s08/s09` refs invisible to member but structurally required), embedded FeeMathSheet when cost-bearing; approve affordance only post-MOB-05b. Trust cue: "Proposed by {staff name} after reviewing your file {date}". States: pending / approved / declined (declining is safe and reversible — copy says so). A11y: full-text agreements linked. Perf: static + one read. Copy: "We recommend an independent damage expert. Here's exactly what it costs and why."

### 3.7 Fee Math Sheet (1 sheet + 1 collapsed line, MOB-05a)

**FM-0 · Collapsed line (everywhere money is mentioned).** "No win, no fee · tap for the exact math" — one reviewed sentence + chevron. Never a modal ambush.

**FM-1 · The sheet (bottom sheet).** Purpose: kill fee anxiety with arithmetic. Primary: three preset recovery amounts (+slider) → live: recovered → success fee ({tier}% with struck-through base for members) → **you receive** (largest type on the sheet). Structural line: "Recover nothing → pay nothing." (component-rendered, uncloseable). Secondary: "Full fee rules" (versioned document). Trust cue: entity + governing law footer (T-407). States: context variants (membership/recovery/expert/vonesa) change labels, never structure; no-network → sheet works (math is local from `c02` rules). A11y: slider has stepper alternative; math announced as a sentence ("If we recover five thousand euros, you receive four thousand two hundred fifty"). Perf: zero fetches. Copy: L5-reviewed keys only; the word "example" appears on the sheet exactly once, quietly ("Example amounts").

### 3.8 Agreement Ceremony (4 screens, MOB-05b — after L1 matrix)

**AC-1 · What we'll do.** Scope in ≤5 plain bullets, named handler with photo, first action + date ("We file within {n} days of your signature"). Trust cue: the named human + the date. States: none. A11y: read-through order = visual order. Perf: static. Copy: "From here, you deal with us — we deal with everyone else."

**AC-2 · What it costs.** FM-1 embedded full-height, ceremony context: adds "what's included / what needs separate approval" (expert costs, court fees — each will get its own FeeMathSheet moment later; no stacking surprise, see §9). Trust cue: the separate-approvals honesty. Copy: "Nothing else gets charged without asking you first."

**AC-3 · What you're signing.** 5-bullet summary per document (agreement, POA/assignment, consent set as **separate toggles** — never bundled); full text one tap each; `SignaturePad` with country-resolved method (L1 matrix; unlisted country → print-and-sign flow with tracking). Trust cue: "You can withdraw before we file — your documents remain yours" (reviewed cooling-off line). States: OTP failure, signature retry, fallback path each designed — no dead ends at the highest-stakes moment. A11y: signature has typed alternative where matrix allows; full docs are accessible HTML + PDF. Perf: documents pre-fetched at AC-1. Copy: bullets ≤90 chars, verb-first, no legalese.

**AC-4 · Confirmation.** Signed pack → Vault (visible immediately, with method + timestamp); case flips to Professional Recovery; next step already set ("We file with {insurer} by {date}"). Trust cue: the audit line ("Signed {date} via {method} — copy in your Vault"). States: none. Perf: instant. Copy: "Done. We take it from here."

### 3.9 Vault / Consent (4 screens, MOB-03)

**VA-1 · Vault list.** By case / by type; every item shows who-can-see-it chips. Trust cue: the chips themselves — visible access state as default UI. States: empty ("Your documents will live here — only you decide who sees them"), uploading, quarantined (failed scan → clear reason). A11y: chips have text labels. Perf: virtualized list. Copy: chip labels "Just you" / "You + your handler" / "+ medical reviewer" / "+ partner lawyer".

**VA-2 · Item detail.** Preview + full consent state + history ("Shared with handler {date}"). Primary: change access → CS-1. Secondary: download, delete (with case-impact warning if checklist-linked). Trust cue: access history as receipts. States: medical items show the distinct medical-consent frame. A11y: preview alternatives for scans (OCR text when available). Perf: previews cached per session only. Copy: "This is your document. Access changes take effect immediately."

**CS-1 · Consent sheet.** Per contract: per-party toggles, required-minimum logic, policy version, revocation advertised on the sheet. Trust cue: plain statements per party ("Your handler Ana — needs this to file your claim"). States: DPIA-gated medical subject → the entire sheet is unreachable until L3 sign-off (structural, not copy). A11y: toggles are switches with full sentences. Perf: local until save. Copy: no legalese on-sheet; policy one tap away.

**CS-2 · Revocation confirm.** What revoking hides, from whom, effective immediately; consequence honesty ("Your handler won't see this document; it may slow the claim — we'll tell you if it blocks a step"). States: revocation → audit-logged, reversible. Copy: no guilt language; revoking is a right, styled as one.

### 3.10 VONESA (4 screens — **design preview only; runtime is WS-F, unpromoted; nothing here is buildable before WS-F authority**)

**VN-1 · Flight check.** Flight number + date, nothing else; auto-lookup fills route/delay. Trust cue: "30 seconds. No personal details." Preview note: eligibility logic, flight-data adapter, and all copy caveats are WS-F scope with L4 inputs.
**VN-2 · Eligibility result.** `EligibilityBand` (band + amount-with-regulation + reason + caveat) + `ReviewBadge`. Never a promise; conversion hook to account.
**VN-3 · Agreement.** Single screen: cession default (L4 matrix), POA fallback, embedded FeeMathSheet (vonesa context), one signature.
**VN-4 · Ledger.** `LedgerRow` stages claimed→submitted→response→recovered→paid out; Next Step model reused ("We chase {airline} on {date}").

### 3.11 Agent Companion (3 screens — **design preview only; runtime is OMG, unpromoted**)

**AG-1 · Agent home.** Today's leads, follow-ups, sales count; member lookup. Stage-only claim visibility restated structurally.
**AG-2 · Sale.** Plan cards → contact → payment link/QR (Paddle rails only; cash path exists only if L7 permits) → activation. Two-minute budget.
**AG-3 · Confirmation.** Member activated + welcome SMS sent + commission note (per ADR-05/T-306 semantics). No member-PII residue on device beyond activation minimum.

---

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

## 7. Performance & Technical UX Budget

Budgets become acceptance-criteria language at each slice's gate. Reference device: mid-range Android (≈2023 tier), 3G/edge-of-coverage network — the actual roadside condition.

| Budget                                  | Target                               | Where enforced                  |
| --------------------------------------- | ------------------------------------ | ------------------------------- |
| First useful screen (MH-C/HN-1, cold)   | contentful <1.5s, interactive <2.5s  | MOB-01 gate (already in packet) |
| Help Now warm/offline open              | <400ms to interactive                | MOB-01                          |
| Route-level JS, initial (free surfaces) | ≤170KB gz; help-now shell ≤90KB gz   | MOB-01 CI budget check          |
| Member surfaces initial JS              | ≤220KB gz incl. read-model client    | MOB-02                          |
| Country content pack size               | ≤3MB per country incl. bilingual EAS | MOB-01                          |
| NextStepCard read-model payload         | <10KB; interactive <1s warm          | MOB-02                          |
| Interaction feedback                    | <100ms visual+haptic on every tap    | all                             |
| Camera capture-to-confirm               | <500ms                               | MOB-01                          |
| Claim-pack generation                   | ≤3s with staged progress copy        | MOB-01                          |

**Image/media strategy:** SVG for all icons/pictograms/ghost overlays (vector overlays scale across camera resolutions); AVIF/WebP with dimension caps for member-uploaded previews (thumbnails ≤40KB); no fonts beyond the one family (two weights + system fallback stack); no video at launch.

**Service-worker boundaries (restating the gate contract as engineering rules):** SW caches _only_ (a) app shell for free surfaces, (b) versioned country content packs by manifest, (c) static assets. Allowlist, not blocklist. Member API responses, session-derived data, and anything behind auth are **never SW-cached** — member-surface freshness comes from the read model, not the SW.

**Cache rules:** content packs = stale-while-revalidate against manifest version (packs bind to L2 sign-off hashes, so staleness is legally bounded too); app shell = precache + atomic update on new deploy (no half-updated shells); member reads = network-first with last-known-state fallback _rendered as such_ ("Updated {time}"), never silently stale.

**No-cache zones (hard):** the local incident bundle lives in device persistent storage (IndexedDB/OPFS), outside SW cache, excluded from any sync/backup the app controls, encrypted at rest where the platform allows, cleared only by explicit user action. Analytics never touch bundle contents. The CI guard test from the MOB-DG01 packet proves the SW allowlist; a second guard proves the bundle store is not enumerated by any upload code path until the user's explicit send.

**Skeleton/loading rules:** skeletons only >300ms and only on member surfaces; skeletons reserve exact layout (CLS ≈ 0 on NextStepCard); Help Now never shows any loading state (local by construction); the claim-pack beat is the single sanctioned "working on it" moment; spinners are banned app-wide (skeleton, progress bar, or staged copy — a spinner is an apology).

---

## 8. Measurement Plan

Event schema rules first: **no free text, no precise location (country code only), no document contents, no health signals** (the injury guide emits the same generic event shape as car/property — scenario is carried as a low-cardinality enum whose analytics use is reviewed under L3), no pre-account persistent identifiers beyond a rotating anonymous session id, events batched and dropped (not queued) when offline in Help Now (measurement never competes with the emergency flow for resources).

| Event                                                 | Fires when                         | Properties (all enums/bools/ints)               | KPI it feeds                                  |
| ----------------------------------------------------- | ---------------------------------- | ----------------------------------------------- | --------------------------------------------- |
| `help_now_opened`                                     | HN-1 render                        | entry_point, country, offline(bool)             | Reach; offline share                          |
| `scene_guide_completed`                               | HN-4 all core items ticked         | scenario, duration_bucket                       | Guidance completion rate                      |
| `checklist_item_done`                                 | any checklist tick                 | checklist_type, item_index                      | Drop-off mapping                              |
| `trip_pack_downloaded`                                | TM-3 success                       | corridor, pack_count, total_mb_bucket           | Trip Mode adoption                            |
| `evidence_bundle_created`                             | EC-3 done, ≥1 item                 | item_count_bucket, camera_denied(bool)          | Evidence coach efficacy (no content, no EXIF) |
| `claim_pack_generated`                                | CP-2 success                       | scenario, country, has_bundle(bool)             | Free-value delivery                           |
| `claim_pack_shared`                                   | share sheet invoked                | channel_class                                   | Viral coefficient                             |
| `account_handoff_started` / `completed`               | CP-3 primary → account created     | source_surface                                  | Pack→account (72h window)                     |
| `membership_purchase_completed`                       | Paddle confirmation                | plan, source_surface, days_since_account_bucket | Account→member (7d window)                    |
| `case_created`                                        | intake→case success                | scenario, country, cross_border(bool)           | Activation                                    |
| `next_step_action_completed`                          | member completes owned action      | action_type, days_open_bucket                   | Case velocity; silence-kill proof             |
| `fee_sheet_viewed` / `expanded`                       | FM-0 tap → FM-1 open               | context, source_surface                         | Fee-transparency engagement                   |
| `agreement_ceremony_started` / `signed` / `abandoned` | AC-1 enter / AC-4 / exit           | abandoned_at_screen, method, country            | Ceremony conversion + friction point          |
| `consent_granted` / `revoked`                         | CS-1/CS-2                          | subject_class, party_count                      | Consent health (no subject detail)            |
| `notification_permission_result`                      | permission prompt at case creation | granted(bool)                                   | Choreography check (>70%)                     |

**KPI dashboard (the five that run the business):** free→pack rate; pack→account (72h); account→member (7d post-offer); ceremony conversion (started→signed, target >85% — below that, the ceremony has a friction or trust defect, find it via `abandoned_at_screen`); resolution NPS split by outcome. Guardrail metrics reviewed alongside: money-back invocation, notification opt-in, HN-surface membership sales (must stay zero), fee-sheet views per signature (≥1 by construction — instrument to prove it).

---

## 9. Red-Team Critique (adversarial review of everything above)

**What feels untrustworthy?**

1. _The named-human pattern is a loaded gun._ "Ana, your handler" with a photo and an SLA is the strongest trust signal in the design — and the fastest to detonate. If Ana is a rotating queue with a face, members will discover it at first contact and everything else becomes suspect. Either handlers are real, stable, and reachable, or the design must degrade honestly to "your case team" _before_ launch. Decide from ops reality, not design preference.
2. _"Verified for Kosovo, June 2026" invites verification._ A lawyer or smart-ass cousin will check. One wrong police threshold in a signed pack doesn't just embarrass — it makes the L2 process look decorative. Mitigation exists (version-bound sign-off), but the review cadence (≤12 months) may be too slow for emergency-number changes; add an out-of-cycle correction path with hotfix packs.
3. _Too much calm can read as too little urgency._ A member whose insurer is stonewalling wants to see teeth. The timeline's "we chased them — 2nd reminder" entries are load-bearing; if ops doesn't generate chase events reliably, the calm design becomes a serene facade over silence — the exact failure it was designed to kill. The Next Step invariant needs an ops SLA behind every "we do X by {date}", enforced with the same seriousness as CI gates.

**Where could legal copy backfire?**

- "You're in time" (CP-1) is a legal conclusion delivered by software. Even with range phrasing, a member who relied on it past a real limitation period is a liability scenario. Require the L2 review to approve the exact deadline sentence _per country per claim type_, and bias to "deadlines in {country} are typically {range} — we confirm yours within 1 business day," pushing the conclusion to the human.
- "If they miss it, we escalate" — if escalation sometimes doesn't happen (weak file, cost), this becomes a broken promise in writing. Gate the sentence: it renders only for case states where escalation is policy, not judgment.
- The fee promise "recover nothing → pay nothing" must survive contact with the expert-cost model. If a member ever pays an expert fee on a failed recovery, the promise was false. Either expert costs on lost cases are absorbed (then say so, loudly — it's a killer differentiator) or the promise needs the honest asterisk _designed in from day one_, not added by lawyers later. **This is the single most important open business decision in the program.**

**Where could users misunderstand fees?**

- Tier-discount display ("15% ~~18%~~") reads as retail-promo mechanics and cheapens the sheet; show the member's rate plainly, with "your member rate" label, and keep base-rate comparison one tap deep.
- Stacking: success fee + expert cost + court fees can total far above the headline %. AC-2's "what needs separate approval" is necessary but insufficient — add a worked _total_ example in the ceremony for the escalated path. Nobody should learn the all-in economics at the moment an expert is proposed.
- VAT on the success fee (member-facing gross vs. net) — L5 must answer; the ledger must show it.

**Where could local PII handling be risky?**

- The local bundle on a shared or stolen phone: crash photos, other parties' plates and faces, driver documents. Mitigations to bake in: platform-level encryption at rest, bundle behind device biometric/PIN when opened after 24h, explicit "photos may show other people — sharing rules differ by country" line at share time (L2 reviews it), and a one-tap bundle wipe.
- EXIF/geolocation in shared packs: strip precise GPS from shared PDFs by default (timestamp stays, fine location is the member's to add deliberately).
- The `de` diaspora flow creates cross-border data-subject complexity (DE resident, KS incident) — L3 scope should cover it now, not at MOB-03.

**Where could mobile performance fail?**

- SW update races: a driver opens Help Now mid-deploy and gets a half-cached shell. Atomic shell updates are specified; test the _interrupted download_ case explicitly.
- Low-storage devices refusing the 3MB packs or evicting them silently: persistent-storage request helps but isn't guaranteed — Trip Mode must verify pack integrity at "road-ready" time and re-warn, not discover at the border.
- Old-Android camera intents returning nothing (OEM quirks): EC-2 needs the file-picker fallback path tested on real low-end devices, not emulators.
- The read-model <1s warm budget dies if the member surface ships with the full web app's baggage; MOB-02's gate should include a bundle-diff check against the §7 budget, or the case companion inherits 400KB of dashboard code nobody promoted.

**Where could conversion pressure damage trust?**

- The CP-3 fork is clean, but _repeat_ exposure isn't designed: a free user who generates three packs across months — when does the membership ask escalate, if ever? Unmanaged, someone will bolt on a nag banner later and poison the free layer. Decide now: the ask never escalates; the third pack may add one line ("Third time here — membership would have covered all of these"), nothing more.
- Trip Mode's "members: we handle what happens on this road" is one quiet line — keep it one line forever. Seasonal marketing pressure will push to grow it; the governance answer is that TM surfaces are `helpNow.*` namespace and any sales copy there fails the HN-zero-sales metric.
- The 30-day money-back guarantee is absent from the conversion surfaces — that's a trust asset left on the bench; add it to CP-3 ("€20/year, 30-day money-back").

**What should be cut from launch?** (beyond the already-delayed list)

1. The injury scenario in Help Now/intake if L3 DPIA isn't signed — ship car/property only rather than slip the date (the packet allows this; make it the plan of record, not the fallback).
2. Typed-OTP signatures anywhere the L1 matrix row isn't complete — print-and-sign fallback is slower and _fine_.
3. The slider in FM-1 (presets suffice; sliders invite "why did it show me €10,000" screenshots) — add the slider post-launch if anyone asks.
4. Handler photos, if handler stability isn't operationally guaranteed (see #1 above) — names can come later; broken faces can't.
5. `de` locale everywhere except `helpNow.*` — already the copy-system rule; resist scope creep.

---

## 10. Final Execution Package

**Recommended first three promoted slices after M0→M5 closeout** (unchanged from the execution sequence, now with proof obligations):

**1. `MOB-01` — Help Now + Trip Mode (gate: MOB-DG01, packet ready).**
Must prove: the §7 free-surface budgets in CI; airplane-mode functionality; zero-PII and SW-allowlist guard tests; clarity-marker-only copy; funnel events live; ≥1 country (KS) shipped with L2 sign-off, others dark; bundle local-only guard.
Legal inputs needed: **L2 (KS at minimum — start today)**; L2 transit countries for Trip Mode corridors.

**2. `MOB-05a` — Fee Math Sheet, display layer (gate: MOB-DG02).**
Must prove: math delegates to `c02` (zero arithmetic in component, unit-tested against calculator fixtures); "recover nothing → pay nothing" structurally unremovable; T-407 entity/law footer present in every context; works offline; `fee_sheet_viewed` instrumentation; L5-reviewed keys or reviewed-draft placeholders with a copy-swap blocker recorded before public exposure.
Legal inputs needed: **L5** (start now; also resolves the §9 stacking/VAT questions); the **expert-cost-on-lost-case business decision** (§9 — decide before this gate, the sheet's promise line depends on it).

**3. `MOB-02` — Case companion / Next Step read model (gate: MOB-DG03).**
Must prove: outbox-only read model (no writer reads — architectural test); every post-T-503 transition-matrix cell has a status sentence in sq/mk/en (catalog completeness check in CI); exactly-one-next-step invariant as a rendered-output test; overdue variants fire from state, not staff memory; `T-104h` erased rendering; §7 member-surface budgets; notification permission choreography.
Legal inputs needed: expectation-date phrasing review (L5 lineage); `g09` ops-SLA reconciliation (the §9 "teeth" requirement — every "we do X by {date}" backed by an ops commitment).

**Design artifacts still missing (produce before the respective gates; none require implementation):**

1. Hi-fi screen mocks for §3 flows (Figma), starting HN-1..5, CP-1..3, FM-1 — needed for MOB-DG01/DG02 review and visual-regression baselines.
2. Country content source dossiers (KS/MK/AL + transit): the researched raw content L2 reviewers sign — the actual long pole.
3. Post-T-503 transition-matrix → status-sentence catalog spreadsheet (every cell × 3 locales) — feeds MOB-02's completeness check.
4. Bilingual EAS asset (official field semantics, de+sq / de+mk pairing) for L2 review.
5. Notification choreography spec (prompt timing, fallback channels, cold-render contract) — one page, feeds MOB-DG03.
6. PWA-vs-store decision memo (§2 audit gives the UX contract either way; the distribution decision needs a business owner and a date).
7. Fee "total-cost worked example" design for AC-2 (resolves §9 stacking critique) — feeds MOB-DG02/DG05.
8. Handler-model ops decision (named humans vs. case team, §9#1) — one paragraph from ops, but it changes copy keys everywhere.

**Can be prepared now without implementation (no authority needed):** everything in the artifact list above; L1/L2/L3/L5 legal intake (templates ready); sq/mk/de translation of Help Now content; contract fixtures for the four MOB-01 components (design-tool level); the §7 budget numbers wired into gate-packet language; the §8 event dictionary reviewed by whoever owns analytics.

**Must wait for authority:** any code including the SW config and CI budget checks themselves; schema work (consent records); message-key files in the repo; store/PWA packaging; any VONESA or agent surface beyond the previews in §3.10–3.11; and — restated once more — every runtime slice, which enters work only through fresh current-authority resolution and its recorded design gate.

---

_Dossier thesis: the blueprint's trust machinery is sound; what this dossier adds is the enforcement layer — budgets that make speed contractual, copy that survives adversarial reading, conversion that never leans on stress, and a red-team list whose top item is not a design question at all but a business one: decide what "no win, no fee" means when an expert has been paid. Answer that, sign off KS content, and MOB-01 is ready the week the tracker unblocks._
