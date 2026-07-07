---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
tracker_path: docs/plans/current-tracker.md
related:
  - docs/plans/2026-07-06-mob-dg01b-mk-help-now-non-dark-gate-draft.md
  - docs/reviews/2026-07-07-mob-dg01b-current-authority-request-skeleton.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/plans/2026-07-05-rbac-01-closeout.md
---

# MOB-DG01B Current Authority - MK Help Now Non-Dark Enablement

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself and does not implement runtime, product UI, schema, RLS, migration,
> auth, session, tenancy, routing, proxy, billing, dependency, README, AGENTS,
> or broad architecture work.

## Classification

Classified as promotion/design-gate work. It records a single governed runtime
slice selection after the MK evidence lane returned the required country,
hotfix/re-darken, alert, and business-memo correction records. It does not
change source code or runtime behavior.

Risk tier for this gate: Tier 0.

Risk tier for the later `MOB-01b` implementation worker: Tier 2 unless the
implementation discovers a protected-surface requirement. It must stop and
return to authority before touching proxy, auth, tenancy, schema, RLS, billing,
member account creation, claim writers, or routing.

## Day-Of-Use Authority State

Prepared from `main@475bb1ad23293c208867972e91e77b959c0f7b5f` on
2026-07-07.

The fresh current-authority resolver returned:

- `status=blocked_requires_current_authority`
- `reason=umbrella_without_concrete_promoted_slice`
- `activeSlice=null`
- `sourceFile=docs/plans/current-tracker.md`

That is the expected post-`RBAC-01` state. `RBAC-01` closed the staging
role-marker residual with a caveat, and no replacement runtime slice was
promoted by its closeout.

## Inputs

- `docs/plans/2026-07-05-rbac-01-closeout.md`
- `docs/plans/2026-07-06-mob-dg01b-mk-help-now-non-dark-gate-draft.md`
- `docs/reviews/2026-07-07-mob-dg01b-current-authority-request-skeleton.md`
- `docs/reviews/2026-07-06-nine-step-evidence-intake-register.md`
- `docs/reviews/2026-07-07-gazmend-return-control-room.md`
- `docs/reviews/2026-07-07-reviewer-portal-vercel-deployment-record.md`

Obsidian notes remain advisory only. Repository source, current-program,
current-tracker, tests, gates, and explicit user instructions remain
authoritative.

## Accepted Evidence

| Evidence row                             | Status for this gate                                                                   | Reference                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ENT-A01` RBAC caveat                    | Accepted with caveat                                                                   | `docs/plans/2026-07-05-rbac-01-closeout.md`                                                                                                                                                                                                                                    |
| `ENT-A04` MK country-content L2 sign-off | Accepted for current-authority review                                                  | `submissions/2026-07-07T18-01-06-147Z-ent-a04-gazmend/review.json`                                                                                                                                                                                                             |
| `ENT-A05` B6 hotfix/re-darken proof      | Accepted for current-authority review with attestation caveat                          | `corrections/2026-07-07T21-15-47-981Z-ent-a05-gazmend/review.json`; `corrections/2026-07-07T21-15-53-766Z-ent-a05-gazmend/review.json`; `corrections/2026-07-07T21-16-02-977Z-ent-a05-gazmend/review.json`; `corrections/2026-07-07T21-24-21-109Z-ent-a05-gazmend/review.json` |
| `ENT-A06` B7 alert coverage proof        | Accepted for current-authority review with attestation caveat                          | `corrections/2026-07-07T21-14-47-429Z-ent-a06-gazmend/review.json`; `corrections/2026-07-07T21-14-51-068Z-ent-a06-gazmend/review.json`; `corrections/2026-07-07T21-14-57-421Z-ent-a06-gazmend/review.json`                                                                     |
| `ENT-A14` placeholder/trust review       | Accepted for public-exposure preparation                                               | `submissions/2026-07-07T16-23-14-740Z-ent-a14-gazmend/review.json`                                                                                                                                                                                                             |
| `ENT-A02-A03` Memo 1 / Memo 2            | Accepted for `MOB-05a` / `MOB-02` preparation, not as runtime authority for this slice | `corrections/2026-07-07T21-05-08-212Z-ent-a02-a03-gazmend/review.json`; `corrections/2026-07-07T21-05-48-145Z-ent-a02-a03-gazmend/review.json`                                                                                                                                 |

The `ENT-A05` and `ENT-A06` portal returns are accepted as reviewer/operator
attestations. The future implementation must stop and return to authority if it
requires machine-verifiable proof that is not already present, such as exact
SHA, manifest hash, provider alert logs, or synthetic-event job URLs.

## Decision

Promote exactly one canonical tracker slice: `MOB-01b`.

The next active governed implementation goal is exactly one canonical tracker
slice: `MOB-01b`.

No other `MOB-*` slice is promoted by this gate.

## Scope

Future `MOB-01b` is limited to the smallest non-dark MK Help Now enablement:

- expose only the accepted MK Help Now content through the already-merged
  `MOB-01` dark-pack mechanism;
- keep Kosovo, Albania, and every unsigned country dark or placeholder-only;
- verify supported public Help Now locales for MK;
- verify service-worker/cache behavior for public content-pack updates;
- verify anonymous public funnel events stay low-cardinality and PII-free;
- connect the runtime PR evidence back to the accepted MK content, B6, B7, and
  RBAC caveat records.

## Non-Goals

`MOB-01b` must not authorize:

- Kosovo or Albania Help Now exposure;
- VONESA, CRM, DOM, OMG, member portal, or broad UI package expansion;
- member account creation, claim writers, case companion, document upload, or
  payment flows;
- fee math, Paddle billing, subscriptions, refund logic, invoices, or paid
  acquisition;
- schema, migration, RLS, auth, session, tenancy, proxy, or routing changes;
- `apps/web/src/proxy.ts` changes;
- Operational Brain runtime or live AI behavior;
- production paid launch.

## Binding Constraints

`apps/web/src/proxy.ts` remains read-only.

Any future current-main staging P0.1 agent/staff marker miss freezes `MOB-01b`
and returns to current authority.

The accepted MK content, alert, and hotfix evidence authorizes only bounded
non-dark content exposure for MK. It does not authorize legal advice, emergency
service positioning, insurer representation, paid launch, individual claimant
representation, final `PAID`, finance closure, final settlement, or final
`CLOSED` proof.

The future PR must preserve dark state for unsupported countries and must not
weaken the already-merged `MOB-01` dark-pack controls.

## Required Future Evidence

The `MOB-01b` implementation closeout must record:

- exact accepted MK pack/source reference used by runtime;
- public Help Now MK route proof for supported locales;
- dark/placeholder proof for unsupported countries;
- cache/service-worker revalidation proof after manifest/content update;
- anonymous funnel event proof with no PII, account, claim, document, payment,
  precise location, health, injury, or free-text content;
- no-touch statement for proxy, auth, tenancy, schema/RLS, migrations, billing,
  member account creation, claim writers, README, AGENTS, and broad architecture
  docs;
- focused tests for the changed public Help Now path;
- `pnpm pr:verify`;
- `pnpm security:guard`;
- `pnpm e2e:gate`.

## Stop Conditions

Stop and return to authority if any of these occur:

- wrong, uncited, or disputed MK emergency number;
- signed/accepted MK content differs from rendered runtime content;
- unsigned country leaves dark state;
- stale public Help Now content persists after manifest/hash update;
- B6 hotfix/re-darken path cannot be followed;
- B7 alert/synthetic path cannot be proven or acknowledged;
- public cache, analytics, logs, or alerts contain PII, account data, claim data,
  document data, payment data, precise location, health/injury facts, or free
  text;
- current-main staging produces another P0.1 agent/staff marker miss;
- the implementation requires proxy, auth, tenancy, schema, RLS, billing,
  routing, member-account, claim-writer, or payment changes.

## Gate Proof

Tier 0 proof required for this gate:

- `git diff --check`
- `node scripts/verify-v3-docs.mjs`
- `node scripts/plan-audit.mjs`
- `node scripts/track-audit.mjs`
- `node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs .`
- `mcp__interdomestik_qa.scope_audit`

After this gate text is applied, `next-slice.mjs` is expected to return
`status=ready` and `activeSlice.id=MOB-01b`.

## Current Authority Outcome

After this gate merges, resolver state is expected to promote `MOB-01b` as the
only active governed implementation slice. Direct implementation must start
from a clean branch after that merge and must keep runtime scope within the
non-dark MK Help Now enablement envelope above.
