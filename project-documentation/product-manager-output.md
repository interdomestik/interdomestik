# Prime Claims Experience – Product Plan

## Executive Summary

- **Elevator Pitch:** Help Balkan consumers start and trust their damage claims in minutes with a guided, mobile-first flow that proves safety, speed, and local expertise.
- **Problem Statement:** Visitors doubt safety and speed of handing over PII/evidence, leading to drop-off in the claim wizard and weak uptake of services.
- **Target Audience:** Mobile-first consumers in the Balkans (18–55) facing disputes (vehicle, property, employment, consumer goods); low legal literacy, prefer Albanian/English, expect WhatsApp/phone reachability.
- **Unique Selling Proposition:** Local-language, PII-safe claim intake with visible SLA (<24h response), evidence guidance, and clear human support (call/WhatsApp) plus optional “no win, no fee” framing.
- **Success Metrics:** Landing→wizard start rate +20%; wizard completion +25%; evidence upload success rate >95%; time-to-first-response <24h for new submissions; trust CTA interactions (call/WhatsApp) +15%.

## Feature Specifications

### Feature: Trust-Centered Hero & Footer Safety Net

- **User Story:** As a claimant, I want immediate signals of trust and human help (call/WhatsApp), so I feel safe starting my claim.
- **Acceptance Criteria:**
  - Given the homepage loads, when a user views the hero, then they see proof points (response <24h, languages, “no win, no fee”) and primary CTA to start claim.
  - Given the footer is visible, when a user scrolls, then they see tap-to-call and WhatsApp CTA with hours and address.
  - Edge case: On small screens, CTAs remain sticky or easily reachable without overlapping content.
- **Priority:** P0 (conversion unlock).
- **Dependencies:** Translations for sq/en; phone/WhatsApp numbers confirmed; legal ok for “no win, no fee” copy.
- **Technical Constraints:** Responsive layout; ensure tel:/wa links work across devices; no heavy assets in hero.
- **UX Considerations:** Prominent trust strip; accessibility for CTA buttons; concise proof chips.

### Feature: Guided Claim Wizard with Evidence Prompts & Privacy Badge

- **User Story:** As a claimant, I want guided category/tooltips and evidence prompts so I know what to provide and trust data handling.
- **Acceptance Criteria:**
  - Given a user picks a category, when on the evidence step, then they see tailored suggestions (photos, receipts, reports) and allowed file types/sizes.
  - Given the evidence step, when the user attempts blocked mime/oversize, then the UI blocks with clear error and no upload attempt.
  - Given the review step, when shown the privacy badge, then it states “Data used only to process your claim; no sharing” and SLA (<24h) claim.
  - Edge case: Empty evidence is allowed for start, but warns about better outcomes if added.
- **Priority:** P0 (core intake quality).
- **Dependencies:** Evidence validation rules; signed upload endpoint; translations; SLA copy owned by ops/legal.
- **Technical Constraints:** Supabase storage signed URLs; client-side mime/size checks; PII-safe paths (`pii/claims/{user}`); performant on mobile.
- **UX Considerations:** Inline hints, progress clarity, non-blocking prompts, privacy badge near submit.

### Feature: Services Page (/services) for Clarity & Contact

- **User Story:** As a visitor, I want to understand what Interdomestik handles and how it works, so I can choose to start or contact.
- **Acceptance Criteria:**
  - Given /services loads, when viewed, then it lists key categories (vehicle, property, injury, consumer) with “What we solve → How it works → What you get → FAQ → Contact” sections.
  - Given the contact section, when interacted, then users can call/WhatsApp/form without leaving the page.
  - Edge case: Flight-delay tile hidden behind feature flag.
- **Priority:** P1 (education + conversion assist).
- **Dependencies:** Content/FAQ copy; feature flag for flight delay; contact endpoints.
- **Technical Constraints:** Next-intl for copy; avoid layout shift; keep LCP light.
- **UX Considerations:** Skimmable cards, sticky contact CTA, reassure on safety/PII.

### Feature: SLA Timeline Signals (Member & Agent Views)

- **User Story:** As a member, I want to see my claim status and SLA timers, so I trust progress; as an agent, I want SLA cues to prioritize work.
- **Acceptance Criteria:**
  - Given a submitted claim, when viewed, then the timeline shows current status and next SLA with due time.
  - Given SLA breach, when detected, then badge shows “needs attention” and agent view surfaces it in queue.
  - Edge case: Draft claims show “not started” without SLA timers.
- **Priority:** P1 (trust + ops prioritization).
- **Dependencies:** Status model; SLA rules per category/priority; agent queue UI.
- **Technical Constraints:** Server time source; avoid client drift; minimal polling (websocket or incremental revalidate).
- **UX Considerations:** Clear badges, color with sufficient contrast, avoid anxiety copy.

### Feature: Experiment Hooks (Hero A/B, Flight Delay Tile, “Call Me Now” Microform)

- **User Story:** As a PM, I want controlled experiments to improve conversion, so we learn what messaging and offers work.
- **Acceptance Criteria:**
  - Given feature flags, when enabled, then hero headline variants render and are attributable in analytics.
  - Given flight-delay tile flag on, when user clicks, then flow tracks CTR and completion.
  - Edge case: If flags off, default experience unchanged.
- **Priority:** P2 (learning velocity).
- **Dependencies:** Flag system; analytics events; ops readiness for “call me now”.
- **Technical Constraints:** Lightweight flag checks; no blocking on experiment SDK; privacy-compliant tracking.
- **UX Considerations:** Subtle variant changes; do not harm clarity; graceful fallback.

## Requirements Documentation Structure

### 1. Functional Requirements

- **User Flows:** Landing → hero CTA → claim wizard (category → details → evidence → review) → submit; alternate: landing → /services → contact or start claim.
- **Decision Points:** Category selection drives evidence prompts and SLA template; evidence step allows skip with warning; paywall (future) after first onboarding chat not in this scope.
- **State Management:** Claim draft persisted; files tracked with status (selected, validated, uploaded, failed); SLA state per claim.
- **Data Validation Rules:** Category required; details length; mime/size whitelist; PII path prefix; SLA time bounds validated server-side.
- **Integration Points:** Supabase auth/session; Supabase storage signed URLs; feature flag service; analytics events; i18n.

### 2. Non-Functional Requirements

- **Performance:** LCP <2.5s on mobile hero; wizard interactions <150ms; uploads resumable where possible.
- **Scalability:** Handle concurrent uploads; flag evaluation cached; timelines incremental revalidation.
- **Security:** Auth required past login; signed URLs scoped; PII paths; enforce mime/size server-side; no secrets in client.
- **Accessibility:** WCAG AA; keyboard/focusable CTAs; descriptive errors; high-contrast badges.

### 3. User Experience Requirements

- **Information Architecture:** Clear primary CTA; services page structured “what/how/benefits/FAQ/contact”; wizard steps linear with progress.
- **Progressive Disclosure:** Evidence prompts contextually shown per category; SLA details shown on review/timeline, not in hero.
- **Error Prevention:** Client + server validation for uploads; disable submit until required fields valid; confirm navigation away from draft.
- **Feedback Patterns:** Inline validation; toast for upload success/fail; SLA badges; trust strip always visible.

## Critical Questions Checklist

- [ ] Are there existing solutions we're improving upon? (Baseline current hero/wizard conversion and evidence error rates.)
- [ ] What's the minimum viable version? (Hero + trust strip + evidence prompts + mime/size enforcement + privacy badge.)
- [ ] What are the potential risks or unintended consequences? (Overpromising SLA, compliance on “no win, no fee”, upload storage costs.)
- [ ] Have we considered platform-specific requirements? (Mobile-first, WhatsApp deep links, low-bandwidth users.)
- [ ] What GAPS exist that you need more clarity on from the user? (Confirm SLA target and legal copy approvals; confirm storage cost budget and paywall timing.)
