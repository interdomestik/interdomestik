---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-component-contracts.md
  - docs/product/2026-07-03-mobile-copy-system.md
  - docs/product/2026-07-03-mobile-design-review-enterprise.md
---

# Unified Mobile Error Taxonomy

> Status: **Design specification — no implementation authority.** One error language for all MOB-* surfaces, adopted as a constraint at each design gate. Four classes, four patterns, one copy namespace (`errors.*`, full sentences, catalog-only). Global rules: red is never an error color (ink + instruction); toasts are forbidden for anything legally meaningful; every error names the next action; no raw provider/system messages ever reach the member.

## Class A — Offline / No Connectivity

**Definition.** Device has no usable network; the user attempted something that needs one. (Help Now content is exempt by construction — it must never produce a Class A error; if it does, that's a build defect, not an error state.)

**UX pattern.** _Read surfaces:_ render last-known state with an honest timestamp banner — "Updated {time} — you're offline." Never block reading. _Write surfaces (MOB-02+ constraint from the design review):_ **explicit reject-and-hold** — the action does not silently queue; a full-width inline card states what was held and what happens next, with a manual "Try again" and an automatic retry on connectivity restore. Legally meaningful writes (consent, signature, approval) are **never** auto-submitted on reconnect — they re-present for one confirming tap ("You're back online — send your approval now?").

**Copy examples** (`errors.offline.*`): "You're offline. Your photos are safe on this phone." · "No connection. We'll hold this and remind you when you're back online." · "Back online — send your approval now?"

**Retry behavior.** Reads: silent background refresh on reconnect. Non-legal writes: auto-retry once on reconnect, then hold with notification-free badge on the source screen. Legal writes: re-present, never auto-fire.

**Audit implications.** Held actions are device-local drafts, not events — nothing enters the outbox/audit trail until server acknowledgment; the UI must never claim "sent" for a held item (the word "held" or "waiting" is contractual).

**Used by.** Vault uploads (MOB-03), Next Step actions and messages (MOB-02), ceremony steps (MOB-05b — additionally: entering AC-3 offline is blocked upfront: "Signing needs a connection — everything is saved, come back online."), Trip Mode downloads (progress pauses/resumes, never fails outright).

## Class B — Stale Data

**Definition.** The surface rendered, but the read model may be behind (sync lag, backgrounded app, read-model rebuild).

**UX pattern.** Never a blocking state. The timestamp discipline from MH-A applies: "Updated {time} — refreshing…" as a quiet inline line (13pt slate), content stays interactive. If refresh reveals the shown Next Step changed, the update is _announced_, not swapped silently — a one-line inline notice ("This case just updated") replaces the card content on tap, preventing a member from acting on a step that no longer exists.

**Copy examples** (`errors.stale.*`): "Updated 09:12 — refreshing…" · "This case just updated — tap to see the latest." · "Showing your last saved view."

**Retry behavior.** Automatic (pull-to-refresh additionally available on lists); exponential backoff, silent; no user action ever _required_ to un-stale.

**Audit implications.** Actions taken against a stale Next Step must be server-validated against current state (the write path rejects with a Class B-flavored conflict: "This step was already completed — here's what's next"), and the rejection is logged as a stale-action event, not a user error.

**Used by.** MH-A/CD-1 Next Step, timeline, ledger (WS-F future), document checklist states.

## Class C — Permission Denied (device permissions)

**Definition.** Camera, notifications, storage/photos denied or restricted at OS level.

**UX pattern.** **Degrade, then offer — never nag.** Every permission-dependent feature has a designed no-permission variant that is genuinely usable (contract requirements already exist: EvidenceShotList → text checklist; notifications → email/SMS fallback). The re-ask affordance lives inside the degraded surface as a quiet inline option ("Turn on the camera coach in Settings"), deep-linking to OS settings. Never a modal wall, never repeated prompts, never blocking a flow on a deniable permission.

**Copy examples** (`errors.permission.*`): "Camera is off — use this list instead, or turn it on in Settings." · "Notifications are off. We'll email you when something needs you." · "Photo access is off — you can still add files."

**Retry behavior.** Re-check permission on every surface entry (silent); restore full variant immediately when granted (no restart, no fanfare beyond the restored UI).

**Audit implications.** None member-visible; analytics records `camera_denied(bool)`-class flags only (already in the measurement plan), never as an "error" event — a denial is a preference, not a failure.

**Used by.** Evidence Coach (MOB-01), document upload (MOB-03), notification choreography (MOB-02), Trip Mode persistent-storage request (denial → packs still download, with the honest caveat "Your phone may clear these — re-check before you travel," and the road-ready integrity check does the safety net).

## Class D — Server / Provider Failure

**Definition.** Our side failed: 5xx, timeout with connectivity present, PDF generation failure, payment-provider (Paddle) error, flight-data provider failure (WS-F future).

**UX pattern.** Own it, preserve everything, give a path. Full-width inline card (not a modal — the user keeps their context): what failed in plain words, what is safe ("Everything you entered is saved"), one retry button, and — for money or legal surfaces — the human escape hatch ("or call {hotline}"). After two failed retries the card self-upgrades to the escalation variant with the hotline promoted to primary. Payment failures never blame ("The payment didn't go through — nothing was charged. Try again or use another card."), and state the charge status _explicitly every time_.

**Copy examples** (`errors.server.*`): "That didn't work on our side. Everything you entered is saved — try again." · "We couldn't build the PDF just now. Your answers and photos are safe. Try again." · "The payment didn't go through — nothing was charged." · "Still not working — call us and we'll finish this together: {hotline}."

**Retry behavior.** Manual retry primary (user-controlled on legal/money surfaces); idempotency required behind every retryable action (same reference number, no double claims-pack identities, no double payment intents — pairs with the artifact spec's idempotent reference rule).

**Audit implications.** All Class D events on money/legal surfaces are logged with correlation IDs; the member-facing card shows **no** error codes — support retrieves via the artifact reference or account, not by asking members to read hex strings. Paddle failures follow existing `sec10`/webhook-hardening lineage; nothing in this taxonomy adds provider surface.

**Used by.** Claim-pack generation (MOB-01), account creation, membership purchase (Paddle), all MOB-02+ writes, ceremony document loading (MOB-05b — documents pre-fetch at AC-1 precisely to keep Class D out of the signature moment), flight lookup (WS-F future).

## Cross-Class Rules

1. One error visible at a time per screen; Class A outranks D outranks B (C is a variant, not a banner).
2. Every class's card uses the same anatomy: sentence → what's safe → action. Same component, four configurations — engineers get one `ErrorCard`, not four widgets.
3. `errors.*` keys are catalog copy under the standard review workflow; Class D money/legal lines are `@legal-reviewed`.
4. Error states are Figma deliverables per flow (already in the moodboard brief's rejection criteria: "a state in the contracts without a designed frame" fails review).
