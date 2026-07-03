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

# Interdomestik IDA — Mobile Excellence Dossier — Part 1

> Status: **Design/product preparation only — no implementation authorized.** M0→M5 is not fully closed (final `T-503` closeout outstanding; `activeSlice=null / blocked_requires_current_authority`). This dossier proposes no changes to proxy, routing, auth, session, tenancy, billing provider, VONESA runtime, SVC, CQRS, or tracker authority. Everything here is consumable by design gates (`MOB-DG01` onward) after M0→M5 closeout and fresh current-authority resolution.

Part 1 of [2026-07-03-mobile-excellence-dossier.md](./2026-07-03-mobile-excellence-dossier.md).

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
