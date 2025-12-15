# 🚀 V2 Platform Enhancement Proposal (Prime Claims Experience)

Goal: make Interdomestik the safest and fastest place to start and resolve vehicle, property, and injury claims—high trust, guided intake, visible SLA-backed handling, and modern claim best practices.

## 1) Homepage Conversion & Trust (`apps/web/src/app/[locale]/page.tsx`)
- **Hero**: “Start your claim in minutes” + “No Win, No Fee” + phone/WhatsApp micro-CTA; add proof chips (claims handled, languages, “first response <24h”).
- **Services Grid** (claim-specific):
  - Vehicle/Traffic Damage (collision, third-party, hit-and-run)
  - Property Damage (home/business, fire/flood/theft)
  - Personal Injury & Legal Basis (free consultation)
  - Optional: Flight Delay (EU261 up to €600) behind a flag
- **Trust Strip**: Mediation experts, Legal + insurance expertise, 24/7 contact, No Win/No Fee, Local language, Fast response.

## 2) Footer as Safety Net
- Add phone `049 900 600` (tap-to-call) and WhatsApp CTA.
- Add address + hours.
- Add reassurance line: “Local experts · No Win/No Fee · Multilingual · First response <24h”.

## 3) Guided Wizard (Clarity, Safety, Speed)
- Tooltips per category: “Vehicle: collision, third-party; Property: fire/flood/theft; Injury: medical bills/loss of income; Flight: up to €600 EU261”.
- Evidence best practices: prompt for photos (camera), note timestamp/geo (not required), and show required docs per type.
- Review step: privacy badge (padlock + “Data used only to process your claim; no sharing”); show SLA (“We respond in under 24h”) if true.

## 4) Dedicated Services Page (`/services`)
- Structure: What we solve → How it works → What you get → FAQ → Contact.
- “Speed & Safety” panel: intake <5 min, first response <24h, secure uploads (signed URLs), PII-safe handling, escalation path (mediated → legal).
- “When to call us” with direct CTA (call/WhatsApp/form).

## 5) Modern Claim-Handling Signals
- Timeline with status + SLA timers (submitted, triage, evidence review, insurer/mediation, legal/escalation, payout).
- Evidence quality hints: “Add crash photos, police report, repair estimates, medical docs” tailored per category.
- Internal-ready: severity tagging (urgent/standard), duplicate detection (same plate/date), “call me now” microform for high-intent users (experiment).

## 6) Experiment Hooks (optional)
- Feature-flag “Flight Delay” tile/intake; measure CTR→completion.
- A/B hero headline (“Activate Your Assistant” vs. “Start your claim in minutes”).
- Test “call me now” microform for accident/property visitors; measure pickup-to-call.

---

### Execution Plan (fast track)
1) Update hero, trust strip, footer CTAs.  
2) Replace services grid with category-specific copy/icons.  
3) Add wizard tooltips, privacy badge, evidence prompts.  
4) Ship `/services` with “Speed & Safety” panel + contact CTAs.  
5) Optional: enable flight-delay tile behind a flag; add “call me now” microform experiment.

### Roadmap Placement
Add a short “Prime Claims Experience” workstream in the roadmap (next quarter) to track these UX/marketing lifts and experiments. This can run in parallel to core feature delivery without major scope change.
