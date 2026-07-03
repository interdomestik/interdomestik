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

# Mobile UX Primitive Component Contracts

> Status: **Design contracts only — no implementation authorized.** These contracts fix the props, states, invariants, and accessibility duties of the mobile primitives so that promoted slices build against a stable design API. TypeScript is used as contract notation, not as shipped code. Each contract names the slice that may first implement it; implementing a contract before its slice is promoted is a governance violation, not a head start.

Conventions: all components are presentation-layer (no data fetching; read models are passed in); all user-visible strings arrive as localized message keys, never literals; all components must pass contrast AA and ≥44pt touch targets; every component with a "stress-flow" tag uses ≥17pt body type.

---

## 1. `ReviewBadge` — first slice: MOB-01 _(the trust primitive; everything else depends on its existence)_

Purpose: the single, uniform way any automated output declares it is not final. Replaces ad-hoc disclaimers everywhere.

```ts
interface ReviewBadgeProps {
  kind: 'legal' | 'medical' | 'damage' | 'eligibility' | 'generic';
  reviewState: 'pending_human_review' | 'human_reviewed' | 'informational_only';
  reviewerLabelKey: string; // e.g. "review.legal.within24h" → "Confirmed by our legal team within 1 business day"
  reviewedAt?: string; // ISO date, required when human_reviewed
}
```

Invariants: rendered on **every** pre-check, eligibility, or assessment output with no exceptions; copy comes only from the reviewed clarity-marker catalog; never dismissible; never renders a numeric confidence score. States: pending (muted, clock icon), reviewed (green check + reviewer label + date), informational (grey info). A11y: role=status, read after the main content.

## 2. `OwnerChip` — first slice: MOB-02

```ts
type StepOwner = 'member' | 'interdomestik' | 'insurer' | 'court' | 'airline';
interface OwnerChipProps {
  owner: StepOwner;
  labelKey: string;
}
```

Invariants: exactly one owner; color-independent meaning (icon + label, never color alone); `member` is the only owner that may pair with an amber action.

## 3. `NextStepCard` — first slice: MOB-02 _(stress-flow)_

Purpose: the case companion hero. One per case, always.

```ts
interface NextStepCardProps {
  caseTitleKey: string; // member-phrased title
  stage: CaseStage; // post-T-503 canonical stage set only
  statusSentenceKey: string; // full localized sentence, see copy system §3
  owner: StepOwner;
  action?: { labelKey: string; deepLink: string }; // present iff owner === 'member'
  expectation?:
    | { dateISO: string; kindKey: string } // "they have until", "we expect by"
    | { awaitingDateReasonKey: string }; // explicit "awaiting date" state
  escalationNoteKey?: string; // "if they miss it, we escalate"
}
```

Invariants: **exactly one** rendered action; amber styling iff `owner === 'member'`; `expectation` is required — either a date or an explicit awaiting-date reason (never silently absent); stage must be a member of the post-T-503 transition matrix (compile-time union, no strings); consumes read-model data only (outbox-derived), never writer state. States: member-action, waiting-on-other-party, all-quiet ("Nothing needed from you"), escalation-proposed (renders `ProposalCard` below, never replaces the Next Step). A11y: card is a single landmark; action is the first focusable.

## 4. `ProgressRail` — first slice: MOB-02

```ts
interface ProgressRailProps {
  stages: readonly CaseStage[];
  current: CaseStage;
  compact?: boolean;
}
```

Invariants: stages come from the canonical transition matrix; no percentage, no time estimate on the rail itself; skipped stages render as skipped, not completed.

## 5. `TimelineEvent` — first slice: MOB-02

```ts
interface TimelineEventProps {
  eventKey: string; // maps to member-visible event catalog only
  occurredAt: string;
  actor: StepOwner | 'system';
  attachments?: DocumentRef[];
  erasedSubject?: boolean; // renders T-104h skeleton contract
}
```

Invariants: only member-visible catalog events (internal notes structurally unreachable, per `s05`); erased subjects render the preserved-skeleton contract from `T-104h`; human sentences only, no status codes.

## 6. `ChecklistItem` — first slice: MOB-01 (content checklists), MOB-02 (document checklists)

```ts
interface ChecklistItemProps {
  labelKey: string;
  state: 'needed' | 'in_review' | 'accepted' | 'not_applicable';
  action?: { kind: 'camera' | 'file' | 'link'; target: string };
}
```

Invariant: ticking is driven by upstream state (upload accepted, guide step done), never a free member toggle on document checklists.

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
