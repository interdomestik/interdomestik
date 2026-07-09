---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-09
related:
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/plans/2026-07-09-mob-dg03-entry-evidence-acceptance.md
  - docs/product/2026-07-09-ent-b04-mob-02a-status-sentence-catalog.md
  - docs/product/2026-07-09-ent-b05-g09-next-step-sla-reconciliation.md
  - docs/product/2026-07-09-memo2-mob-02a-display-model-mapping.md
  - docs/plans/2026-07-09-mob-02a-read-model-no-mutation-proof.md
---

# MOB-DG03 Current Authority: MOB-02a Read-only Case Companion

> Status: active current-authority/design-gate input. This file promotes exactly
> one slice only when recorded through the canonical `current-program.md` and
> `current-tracker.md` rows.

> This design gate promotes exactly one concrete next slice: `MOB-02a`. It does
> not promote the full `MOB-02` umbrella.

## Resolver Input

Before this gate, the expected resolver state was:

```text
status: blocked_requires_current_authority
activeSlice: null
```

`MOB-05a` is closed. Memo 2 is accepted as preparation/current-authority review
evidence only. The completed reviewer portal entry-evidence packet now closes
the remaining `MOB-DG03` entry blockers.

## Promoted Slice

| Field            | Value                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| Slice            | `MOB-02a`                                                                          |
| Name             | Read-only Case Companion / Next Step display foundation                            |
| Class            | implementation                                                                     |
| Risk tier        | Tier 2 by default; escalate if the implementation touches protected surfaces       |
| Authority source | This file plus `docs/plans/current-program.md` and `docs/plans/current-tracker.md` |

The next active governed implementation goal is exactly one canonical tracker
slice: `MOB-02a`.

## Scope

`MOB-02a` is limited to a read-only member-facing display foundation:

- derive one `Next Step` per displayable case;
- show one owner from the accepted owner set;
- show one accepted status-sentence key from the catalog;
- show one date or awaiting-date reason;
- render case-team language for Interdomestik responsibility at launch;
- preserve erased-subject rendering behavior;
- prove the display is read-only and produces no writer side effects.

The implementation may inspect existing read-side claim tracking, lifecycle
read-model, lifecycle compatibility reads where explicitly justified, and
member-visible timeline rendering. Any touched code must remain within the
read-only display foundation and its focused tests.

## Entry Evidence

| Requirement                        | Evidence                                                              |
| ---------------------------------- | --------------------------------------------------------------------- |
| Memo 2 display mapping             | `docs/product/2026-07-09-memo2-mob-02a-display-model-mapping.md`      |
| `ENT-B04` status-sentence catalog  | `docs/product/2026-07-09-ent-b04-mob-02a-status-sentence-catalog.md`  |
| `ENT-B05` G09 / SLA reconciliation | `docs/product/2026-07-09-ent-b05-g09-next-step-sla-reconciliation.md` |
| Read-model / no-mutation proof     | `docs/plans/2026-07-09-mob-02a-read-model-no-mutation-proof.md`       |
| Consolidated acceptance addendum   | `docs/plans/2026-07-09-mob-dg03-entry-evidence-acceptance.md`         |

## Required Implementation Gates

The future `MOB-02a` implementation PR must prove:

1. exactly one Next Step is derived for every accepted display state;
2. owner, sentence key, action/no-action, and date/awaiting-date fields are
   complete and typed;
3. all required status-sentence keys exist for `en`, `sq`, and `mk`;
4. no internal status codes are rendered to members;
5. no claim writers, status mutation, outbox writes, Agreement Ceremony writers,
   or notification behavior are imported or called;
6. erased-subject rendering preserves skeleton context and hides erased personal
   data;
7. member-route proof shows read-only rendering without writer side effects.

## Exclusions

This gate does not authorize:

- full `MOB-02` umbrella work;
- claim writers or status mutation;
- Agreement Ceremony writers or ProposalCard approval;
- outbox writes or new lifecycle events;
- schema/RLS/migrations;
- auth, proxy, routing, session, or tenancy changes;
- billing, payment, Paddle, or fee math;
- notifications, live AI, Brain tooling, retrieval/ranking/config/MCP/hooks,
  generated Wiki, README, AGENTS, or architecture docs;
- KS/AL exposure;
- named-handler display, handler photos, assignment reliability claims, 24/7
  support, emergency coverage, or guaranteed outcome language.

## Stop Conditions

The implementation must stop and return to current authority if it needs any
excluded surface, cannot derive exactly one Next Step from read-side data,
cannot prove no-mutation behavior, lacks accepted copy keys for all required
locales, or needs to expose named-handler identity beyond signature-level facts.

## Decision

`MOB-DG03` promotes exactly one next concrete slice:

`MOB-02a` - read-only Case Companion / Next Step display foundation.

Runtime implementation is authorized only after this authority PR is merged and
the resolver returns `status=ready` with `activeSlice.id=MOB-02a`.
