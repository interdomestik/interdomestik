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

# Mobile UX Primitive Component Contracts — Part 1

> Status: **Design contracts only — no implementation authorized.** These contracts fix the props, states, invariants, and accessibility duties of the mobile primitives so that promoted slices build against a stable design API. TypeScript is used as contract notation, not as shipped code. Each contract names the slice that may first implement it; implementing a contract before its slice is promoted is a governance violation, not a head start.

Part 1 of [2026-07-03-mobile-component-contracts.md](./2026-07-03-mobile-component-contracts.md).

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
