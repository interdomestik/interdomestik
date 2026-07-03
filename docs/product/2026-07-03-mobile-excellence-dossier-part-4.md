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

# Interdomestik IDA — Mobile Excellence Dossier — Part 4

> Status: **Design/product preparation only — no implementation authorized.** M0→M5 is not fully closed (final `T-503` closeout outstanding; `activeSlice=null / blocked_requires_current_authority`). This dossier proposes no changes to proxy, routing, auth, session, tenancy, billing provider, VONESA runtime, SVC, CQRS, or tracker authority. Everything here is consumable by design gates (`MOB-DG01` onward) after M0→M5 closeout and fresh current-authority resolution.

Part 4 of [2026-07-03-mobile-excellence-dossier.md](./2026-07-03-mobile-excellence-dossier.md).

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
