---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-program-authority-packet.md
  - docs/product/mobile-experience-blueprint.md
---

# Mobile UX Primitive Component Contracts — Part 3

> Status: **Design contracts only — no implementation authorized.** These contracts fix the props, states, invariants, and accessibility duties of the mobile primitives so that promoted slices build against a stable design API. TypeScript is used as contract notation, not as shipped code. Each contract names the slice that may first implement it; implementing a contract before its slice is promoted is a governance violation, not a head start.

Part 3 of [2026-07-03-mobile-component-contracts.md](./2026-07-03-mobile-component-contracts.md).

## 13. `SignaturePad` — first slice: MOB-05 (Agreement Ceremony), post legal matrix

```ts
interface SignaturePadProps {
  method: 'draw' | 'typed_otp' | 'print_and_sign_fallback'; // allowed methods come from the per-country POA matrix (template L1)
  countryCode: string; // selects allowed methods; unsupported → fallback only
  documentRefs: readonly DocumentRef[]; // what is being signed, must be openable full-text
  onSigned: (evidence: SignatureEvidenceDraft) => void; // method, timestamp, audit metadata
}
```

Invariants: allowed methods resolve from the legal matrix by country — the component never defaults a method; full text of every signed document reachable from the pad; produces audit evidence (`m05` lineage); unreachable until the `s08` staff decision exists on the case.

## 14. `TripModePack` — first slice: MOB-01

```ts
interface TripModePackProps {
  corridor: { from: CountryCode; to: CountryCode; transit: readonly CountryCode[] };
  packs: Array<{ country: CountryCode; version: string; signOffRef: string; downloaded: boolean }>;
  bilingualEAS: { primary: Locale; secondary: Locale }; // one component, side-by-side rendering
}
```

Invariants: a pack renders only if `signOffRef` is present (unsigned country packs are structurally unrenderable); download is explicit; bilingual EAS is one component with paired paragraph rendering, never two stacked copies.

---

## Cross-cutting contract rules

1. **No component fetches.** Data arrives as props from the consuming slice's promoted read model.
2. **No component invents copy.** Every string is a message key resolved through the copy system (see copy doc); clarity-marker keys come only from the reviewed catalog.
3. **Amber scarcity rule is mechanical:** only `NextStepCard` (member-owner state) and `ChecklistItem.action` may use the action accent; a screen rendering two amber elements fails review.
4. **Erasure-aware:** any component rendering subject data must accept and honor the `erasedSubject` contract (`T-104h`).
5. **Storybook-style contract fixtures** (states enumerated above) are part of each component's definition-of-done when its slice is promoted — contract fixtures double as visual-regression baselines (`p38-dg18` lineage).
