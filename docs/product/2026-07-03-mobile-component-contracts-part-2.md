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

# Mobile UX Primitive Component Contracts — Part 2

> Status: **Design contracts only — no implementation authorized.** These contracts fix the props, states, invariants, and accessibility duties of the mobile primitives so that promoted slices build against a stable design API. TypeScript is used as contract notation, not as shipped code. Each contract names the slice that may first implement it; implementing a contract before its slice is promoted is a governance violation, not a head start.

Part 2 of [2026-07-03-mobile-component-contracts.md](./2026-07-03-mobile-component-contracts.md).

## 7. `EvidenceShotList` — first slice: MOB-01 _(stress-flow)_

```ts
interface EvidenceShotListProps {
  scenario: 'car_scene' | 'vehicle_damage' | 'injury' | 'property' | 'documents';
  shots: Array<{
    id: string;
    promptKey: string;
    overlay: 'wide' | 'plate' | 'closeup' | 'document' | 'none';
    optional?: boolean;
  }>;
  onBundleChange: (bundle: LocalIncidentBundle) => void; // device-local only in MOB-01
  onClearBundle: () => void;
}
```

Invariants: fully usable with camera permission denied (degrades to text checklist); capture requires explicit user action; in MOB-01 the bundle never leaves the device without explicit user action; copy states "stored on this device only"; user can clear/delete the bundle; photos carry capture timestamp; service-worker caches never include bundles/photos/local metadata; no upload endpoint reference until a promoted slice adds one. The bundle may contain personal data locally, so MOB-01 claims zero server-side PII, not absolute zero PII.

## 8. `FeeMathSheet` — first slice: MOB-05a (display layer)

Purpose: the single fee-transparency component for claims, VONESA, and expert-cost approvals. One component, one mental model.

```ts
interface FeeMathSheetProps {
  context: 'membership' | 'recovery_agreement' | 'vonesa' | 'expert_cost';
  feeRule: { baseRatePct: number; memberRatePct: number; tierLabelKey: string }; // from c02 calculator logic
  entityDisclosure: { contractingEntityKey: string; governingLawKey: string }; // T-407, mandatory
  examples: readonly number[]; // preset recovery amounts; interactive slider optional
  fullRulesLink: string;
}
```

Invariants: renders **before** any signature affordance is reachable; "recover nothing → pay nothing" line is structural (component-rendered, not caller-supplied, so it cannot be omitted); all figures labeled with the reviewed "example" wording (legal template L5), never "estimate/projection"; entity + governing law always visible (T-407); math delegates to the `c02` calculator — the component contains no fee arithmetic of its own.

## 9. `ConsentSheet` — first slice: MOB-03 _(stress-flow)_

```ts
interface ConsentSheetProps {
  subject: 'medical' | 'sensitive_document' | 'gift_seat' | 'data_sharing';
  grants: Array<{
    party: 'handler' | 'medical_reviewer' | 'partner_lawyer' | 'expert';
    labelKey: string;
    required?: boolean;
  }>;
  policyLink: string;
  onDecision: (granted: PartyGrant[]) => ConsentRecordDraft; // persisted only by a promoted slice's writer
}
```

Invariants: appears **before** the first question/upload of its subject, never after; per-party toggles, no bundled "accept all"; continue disabled until required grants set; every decision produces an auditable consent record draft with subject, parties, timestamp, policy version; revocation entry point advertised on the sheet itself; medical subject blocked entirely until DPIA sign-off is recorded (template L3).

## 10. `ProposalCard` — first slice: MOB-02 (render), actions gated by MOB-05

```ts
interface ProposalCardProps {
  proposal: {
    kind: 'expert' | 'court' | 'partner_lawyer';
    proposedByStaffId: string;
    rationaleKey: string;
    prerequisitesMet: readonly string[];
  }; // s08/s09 gate evidence refs
  cost?: FeeMathSheetProps; // embedded fee math when cost-bearing
  onApprove?: () => void; // absent until MOB-05 Agreement Ceremony is promoted
}
```

Invariants: renders only from a staff-created proposal record — the component has no self-serve creation path; `prerequisitesMet` must be non-empty (the `s08`/`s09` decision references); cost-bearing proposals embed `FeeMathSheet`; approve affordance absent until the Agreement Ceremony slice exists.

## 11. `EligibilityBand` — first slice: WS-F (FLIGHT-*) only

```ts
interface EligibilityBandProps {
  band: 'likely' | 'possible' | 'unlikely';
  amountContextKey?: string; // "€400 under EC261" — always with regulation context, never bare
  reasonKey: string; // mandatory: the why, in one sentence
  caveatKey: string; // reviewed extraordinary-circumstances line
}
```

Invariants: never renders a bare amount without regulation context and caveat; never renders as a score or percentage; always paired with `ReviewBadge(kind: 'eligibility')`. **Not buildable before WS-F promotion.**

## 12. `LedgerRow` — first slice: WS-F (VONESA), later reused for success-fee payout view

```ts
interface LedgerRowProps {
  stage: 'claimed' | 'submitted' | 'counterparty_response' | 'recovered' | 'paid_out';
  amount?: MoneyRef; // tenant/currency-aware money type, no floats
  occurredAt?: string;
  pending?: boolean;
}
```

Invariant: amounts appear only from billing-side read models (`T-204`/`T-408` lineage), never computed client-side.
