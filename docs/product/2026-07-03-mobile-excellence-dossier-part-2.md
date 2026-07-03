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

# Interdomestik IDA — Mobile Excellence Dossier — Part 2

> Status: **Design/product preparation only — no implementation authorized.** M0→M5 is not fully closed (final `T-503` closeout outstanding; `activeSlice=null / blocked_requires_current_authority`). This dossier proposes no changes to proxy, routing, auth, session, tenancy, billing provider, VONESA runtime, SVC, CQRS, or tracker authority. Everything here is consumable by design gates (`MOB-DG01` onward) after M0→M5 closeout and fresh current-authority resolution.

Part 2 of [2026-07-03-mobile-excellence-dossier.md](./2026-07-03-mobile-excellence-dossier.md).

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
