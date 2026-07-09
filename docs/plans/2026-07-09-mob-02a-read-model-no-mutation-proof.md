---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-09
related:
  - docs/plans/2026-07-09-mob-dg03-entry-evidence-acceptance.md
  - docs/plans/2026-07-08-mob-dg03-entry-evidence-blocker-resolution.md
  - docs/product/2026-07-03-mobile-component-contracts-part-1.md
  - packages/domain-claims/src/claims/lifecycle-read-model.ts
  - packages/domain-claims/src/claims/lifecycle-read-sql.ts
  - apps/web/src/features/claims/tracking/server/getMemberClaimDetail.ts
  - apps/web/src/features/claims/tracking/server/member-domain-event-timeline.ts
---

# MOB-02a Read-Model / No-Mutation Proof

> Status: accepted reviewer-portal evidence for `MOB-DG03` entry review. This
> document does not promote `MOB-02`, promote `MOB-02a`, authorize runtime work,
> edit app source, or approve mutation behavior.

## Reviewer Portal Custody

| Field                  | Value                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Step                   | `MOB02A-READMODEL-PROOF`                                                          |
| Reviewer               | Gazmend                                                                           |
| Submitted at           | `2026-07-09T11:10:44.763Z`                                                        |
| Evidence reference     | `submissions/2026-07-09T11-10-45-857Z-mob02a-readmodel-proof-gazmend/review.json` |
| Portal status endpoint | `https://reviewer-ecohub.vercel.app/api/status`                                   |
| Complete?              | yes                                                                               |

## Accepted Items

| Item             | Portal decision | Repo-safe acceptance                                                               |
| ---------------- | --------------- | ---------------------------------------------------------------------------------- |
| `RM-SOURCES`     | approve         | Read-source boundaries are accepted for `MOB-DG03` entry review.                   |
| `RM-EXACTLY-ONE` | approve         | The exactly-one-next-step invariant is accepted as a required implementation gate. |
| `RM-NO-MUTATION` | approve         | No-mutation boundaries are accepted as a required implementation gate.             |
| `RM-ERASED`      | approve         | Erased-subject rendering is accepted as a required implementation gate.            |
| `RM-TESTS`       | approve         | Future test surfaces are accepted as required implementation evidence.             |

## Repo-Safe Scope Conclusion

For `MOB-DG03`, the read-model/no-mutation entry blocker is closed. The accepted
future `MOB-02a` proof target is a typed read-only derivation that returns:

- exactly one Next Step per displayable case;
- exactly one owner;
- exactly one status-sentence key;
- exactly one action or an explicit no-action state;
- exactly one date or awaiting-date reason;
- erased-subject rendering that preserves skeleton context without exposing
  erased personal data.

Candidate read sources remain limited to read-side claim tracking, lifecycle
read-model, lifecycle compatibility reads where explicitly justified, and
member-visible event timeline rendering. The later implementation must prove it
does not import or call claim writers, status mutation, outbox writes, Agreement
Ceremony writers, billing/payment behavior, schema/RLS changes, auth/proxy/
routing changes, notifications, or KS/AL exposure.

## Required Future Implementation Gates

The implementation PR for `MOB-02a` must include focused proof for:

1. pure derivation coverage for every accepted display state;
2. catalog completeness for required `en`, `sq`, and `mk` keys;
3. component/render proof that exactly one member-facing card/action is shown;
4. static no-mutation proof for the touched read-model/display files;
5. erased-subject rendering proof;
6. member-route proof that the display is read-only and produces no writer side
   effects.

## Runtime Boundary

This proof is only entry evidence for a future authority gate. It does not
authorize claim writers, Agreement Ceremony writers, ProposalCard approval,
status mutation, outbox writes, schema/RLS/migrations, auth/proxy/routing,
billing/payment, notifications, KS/AL exposure, Brain tooling, generated Wiki,
README, AGENTS, or architecture docs.
