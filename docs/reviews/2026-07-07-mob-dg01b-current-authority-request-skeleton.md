---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
related:
  - docs/plans/2026-07-06-mob-dg01b-mk-help-now-non-dark-gate-draft.md
  - docs/reviews/2026-07-07-gazmend-return-control-room.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-07-evidence-intake-processor.md
---

# MOB-DG01B Current-Authority Request Packet

> Status: ready to send for current-authority review. This is not a
> current-authority decision, not a design-gate approval, and not permission to
> start `MOB-01b`.

## Classification

Classified as `documentation/external-tracker-only` because it prepares the
shape of a later current-authority request after evidence returns. It does not
change tracker authority or runtime state.

## Use Only After These Are Accepted

The intake register now records accepted evidence for all required rows, with
the B6/B7 caveat that the returned portal rows are reviewer/operator
attestations rather than machine-verifiable SHA/provider-log proof. Current
authority may accept those attestations or return the request for stronger
machine proof.

| Required row                             | Intake status now                              | Acceptance reference                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ENT-A04` MK country-content L2 sign-off | Accepted                                       | `submissions/2026-07-07T18-01-06-147Z-ent-a04-gazmend/review.json`                                                                                                                                                                                                             |
| `ENT-A05` B6 hotfix/re-darken proof      | Accepted for CA review with attestation caveat | `corrections/2026-07-07T21-15-47-981Z-ent-a05-gazmend/review.json`; `corrections/2026-07-07T21-15-53-766Z-ent-a05-gazmend/review.json`; `corrections/2026-07-07T21-16-02-977Z-ent-a05-gazmend/review.json`; `corrections/2026-07-07T21-24-21-109Z-ent-a05-gazmend/review.json` |
| `ENT-A06` B7 alert coverage proof        | Accepted for CA review with attestation caveat | `corrections/2026-07-07T21-14-47-429Z-ent-a06-gazmend/review.json`; `corrections/2026-07-07T21-14-51-068Z-ent-a06-gazmend/review.json`; `corrections/2026-07-07T21-14-57-421Z-ent-a06-gazmend/review.json`                                                                     |
| `ENT-A01` RBAC caveat still clean        | Accepted with caveat                           | `docs/plans/2026-07-05-rbac-01-closeout.md`                                                                                                                                                                                                                                    |

`ENT-A14` placeholder/trust review should be attached before public exposure.
It is not a hard prerequisite for drafting this request unless current authority
upgrades it.

## Request Template

```text
Request:
Promote exactly one runtime slice: MOB-01b.

Design gate:
MOB-DG01B - MK Help Now Non-Dark Enablement.

Scope:
Enable only signed MK Help Now content through the already-merged MOB-01 dark-pack mechanism.

Non-goals:
No KS/AL exposure.
No VONESA/CRM/DOM/OMG/member expansion.
No billing, fee math, Paddle, subscriptions, invoices, or paid launch.
No auth, tenancy, routing, proxy, schema, RLS, or migration work.
No Operational Brain runtime/live AI.
No broad UI package implementation.

Evidence attached:
ENT-A04:
- submissions/2026-07-07T18-01-06-147Z-ent-a04-gazmend/review.json

ENT-A05:
- corrections/2026-07-07T21-15-47-981Z-ent-a05-gazmend/review.json
- corrections/2026-07-07T21-15-53-766Z-ent-a05-gazmend/review.json
- corrections/2026-07-07T21-16-02-977Z-ent-a05-gazmend/review.json
- corrections/2026-07-07T21-24-21-109Z-ent-a05-gazmend/review.json

ENT-A06:
- corrections/2026-07-07T21-14-47-429Z-ent-a06-gazmend/review.json
- corrections/2026-07-07T21-14-51-068Z-ent-a06-gazmend/review.json
- corrections/2026-07-07T21-14-57-421Z-ent-a06-gazmend/review.json

ENT-A01 caveat:
- docs/plans/2026-07-05-rbac-01-closeout.md
- resolver still reports blocked_requires_current_authority / activeSlice=null before this request

ENT-A14:
- submissions/2026-07-07T16-23-14-740Z-ent-a14-gazmend/review.json

Attestation caveat:
- ENT-A05/ENT-A06 portal returns are accepted for current-authority review as
  reviewer/operator attestations. If current authority requires machine proof
  such as exact SHA, manifest hash, provider alert logs, or synthetic-event job
  URLs, reject this request and return those evidence items without promoting
  MOB-01b.

Stop conditions:
Wrong/cited-disputed emergency number.
Unsigned or hash-mismatched MK content pack.
B6 exercise missing or failed.
B7 alert/synthetic proof missing or failed.
Any P0.1 current-main agent/staff marker miss.
Any need for proxy/auth/tenancy/schema/RLS/billing changes.

Requested authority action:
If accepted, update current-program/current-tracker so resolver selects exactly MOB-01b.
If rejected, record the blocker and keep activeSlice=null.
```

## Operator Checklist Before Sending

- [x] Intake register contains accepted `ENT-A04`.
- [x] Intake register contains accepted `ENT-A05`.
- [x] Intake register contains accepted `ENT-A06`.
- [x] Sensitive evidence is referenced, not pasted.
- [x] `MOB-DG01B` draft has no stale pending rows in this request packet.
- [x] `next-slice.mjs` still reports blocked before authority.
- [x] Request cites current program/tracker MOB/RBAC rows directly, not the
      resolver's older `T-002b` evidence pointer.
- [x] Request names exactly one runtime slice: `MOB-01b`.
- [x] Request does not include implementation instructions beyond the approved
      scope.

## Current Disposition

Ready to send for current-authority review. Resolver state must remain
`activeSlice=null` until current authority explicitly promotes exactly
`MOB-01b`.
