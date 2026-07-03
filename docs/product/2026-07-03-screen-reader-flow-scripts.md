---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-excellence-dossier.md
  - docs/product/2026-07-03-mobile-component-contracts.md
  - docs/product/2026-07-03-mobile-error-taxonomy.md
---

# Screen Reader Flow Scripts (VoiceOver / TalkBack)

> Status: **Design specification — no implementation authority.** The exact intended reading order, roles, and announcements for four critical flows. These scripts are the acceptance definition for the ship-gate's "VoiceOver/TalkBack pass" — a build passes when a blind user hears _this_, in this order. Notation: each numbered line = one swipe-next stop. `[role]` = trait/role announced. `→` = what activating does. Text in quotes is the exact announcement (en shown; localized per catalog).

**Global rules.** Reading order = visual order, no exceptions requiring explanation. Decorative elements (pictograms with adjacent labels, hairlines, ghost overlays) are hidden from the accessibility tree. Dynamic updates use polite live regions except emergency and error escalations (assertive). Focus never resets to top on in-place state changes. All touch targets reachable by swipe — nothing is gesture-only.

---

## 1. Help Now — Car Path (HN-1 → HN-4)

**HN-1 · Hub.** Screen announce: "Help Now."

1. "What happened?" [heading level 1]
2. "Kosovo — emergency numbers saved on this phone." [static text]
3. "Car accident — step-by-step help." [button] → HN-2
4. "Injury — what to do right now." [button]
5. "Property damage — protect your claim." [button]
6. "Flight problem — delayed or cancelled." [button]
7. "I just need the accident form." [link]
8. "Call Interdomestik, {hotline number}." [button, phone]
9. "Close Help Now." [button]

**HN-2 · Safety triage.** Screen announce: "First: is anyone hurt?"

1. "First: is anyone hurt?" [heading 1]
2. "Someone is hurt. Call emergency, 1 9 4." [button, phone — number read as digits] → dialer
3. "No one is hurt — continue." [button] → HN-3
4. "Call Interdomestik, {hotline}." [button, phone]
   Focus order note: the emergency button is the _second_ stop (after the heading), first actionable — never bury it below the continue path.

**HN-3 · Police or EAS.** Screen announce: "Police, or the accident form?"

1. "Call the police if any of these apply." [heading 2]
   2–7. Rule items, each: "{rule sentence}." [checkbox, unchecked] → toggles ("checked")
2. Live region (polite), updates as boxes change: "One rule applies — call the police, 1 9 2." / "No rules apply — the European Accident Statement is enough."
3. "Call the police, 1 9 2." [button, phone — present only when ≥1 checked]
4. "Open the accident form." [button]
5. "Reviewed for Kosovo, {review date}. General guidance — see full note." [button, ReviewBadge] → marker detail
6. "Call Interdomestik, {hotline}." [button, phone]

**HN-4 · Scene actions.** Screen announce: "At the scene — 6 steps. 2 done."

1. "At the scene." [heading 1]
2. "2 of 6 done." [static, live region polite — updates on each tick]
   3–8. Items, each: "{instruction sentence}. {Done / Not done}." [checkbox] — the photo item adds: "Opens the camera coach." → EC-1
3. "Don't admit fault at the scene. Let the facts decide." [static text]
4. "I'm done here." [button] → HN-5
5. "Call Interdomestik, {hotline}." [button, phone]
   Haptic ticks pair with the announcement "Done — {n} of 6."

---

## 2. Claim Pack Read-Back (CP-1)

Screen announce: "Here's what we see. Three sections: basis, deadlines, documents."

1. "Here's what we see." [heading 1]
2. "Your claim basis." [heading 2]
3. "Workable basis: the other driver was cited for the collision." [static text]
4. "Initial assessment — our legal team confirms within 1 business day." [static text, ReviewBadge — announced immediately after the band it qualifies, never separated]
5. "Your deadlines." [heading 2]
6. "In Kosovo, claims like this generally allow around three years. We confirm your exact dates before filing." [static text]
7. "Documents." [heading 2]
8. "4 of 6 collected." [static, live region polite]
   9–14. Items: "{Document name}. {Collected / Still needed}." [static or button when actionable: "— add now." → upload/camera]
9. "Get my free Claim Pack, PDF." [button] → CP-2
10. "Have Interdomestik handle it." [button] → account/handoff
    Order note: the free option is read _before_ the paid-path option, matching visual order and the equal-dignity rule — the screen reader experience must not invert the fork's fairness.
    During generation (the sanctioned 3s beat): live region (polite) announces the staged copy once per stage: "Assembling your pack — checking Kosovo deadlines."

---

## 3. Fee Math Sheet (FM-0 → FM-1)

**FM-0 · Collapsed line (in host screen order):**
n. "No win, no fee. Opens the exact math." [button] → FM-1

**FM-1 · Sheet.** On open, focus moves into the sheet; background is inert. Screen announce: "Fee math. Example amounts."

1. "Fee math." [heading 1]
2. "Example amounts." [static text]
3. "Choose an example recovery amount." [radio group label]
   4–6. "€2,000." / "€5,000." / "€10,000." [radio buttons, one selected]
4. Live region (polite, re-announces on selection): "If we recover €5,000: success fee at your member rate, 15 percent, is €750. **You receive €4,250.**" — one sentence, amounts in words the TTS handles ("four thousand two hundred fifty euros"), the _you receive_ figure always last (recency = emphasis in audio).
5. "If we recover nothing, you pay nothing." [static text — always present, never skippable, positioned after the math it guarantees]
6. "Full fee rules, document." [link]
7. "Contracting entity: {entity}. Governing law: {law}." [static text]
8. "Close fee math." [button] → focus returns to FM-0 trigger
   Slider variant (if ever added — currently cut per red-team): must have the radio alternative; the radios are the accessible truth regardless.

---

## 4. Evidence Coach — Camera-Denied Fallback (EC-1 degraded)

Entry condition: camera permission denied → EC-1 renders the text-checklist variant (Class C pattern). Screen announce: "Evidence list. Camera is off — using the list. 0 of 6 done."

1. "Evidence list." [heading 1]
2. "Camera is off. Use this list — or turn the camera coach on in Settings." [static text]
3. "Open Settings." [button] → OS settings deep link
   4–9. Shot items, each: "{Prompt sentence — e.g., Photograph both cars, the whole scene}. Not done." [checkbox] → "Done — {n} of 6."
   - Each item's extended hint (swipe-up / long-press actions where supported): "Tip: {one-line framing tip from the shot list}."
4. "Add photos from your gallery instead." [button — present if photo-library permission allows] → picker
5. "Done — keep my list on this phone." [button] → EC-3 equivalent summary
6. "Your notes and any photos stay on this phone. Nothing uploads." [static text]
   Return path: if permission is granted later, next entry announces the restored variant plainly: "Camera coach is on." — no celebration, no re-onboarding.

---

## Verification note

These scripts become test scripts: at each slice's gate, the QA pass walks each numbered line with VoiceOver (iOS) and TalkBack (Android) and checks announcement, order, and activation result. Deviations are defects, not interpretations. Localized announcements come from the same message catalog as visual copy — no screen-reader-only strings except role/state suffixes the OS provides.
