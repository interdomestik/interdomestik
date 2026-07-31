# IDA-DG24 — Active-member saved-draft manager entry

Status: proposed current-authority/design gate
Sole prospective implementation slice: `IDA-UI03a6`
Classification: Tier 2 product UI/discoverability
Base SHA: `c7cfdf543a12e1d457becdc45b4f8ce99eda4bdb`
Runtime authorized: false
Deployment/production authorized: false

## Outcome and value

An eligible access-active member can discover one explicit saved-work capability
on the canonical member dashboard. The secondary action uses the existing
localized Manage label and opens the normal active Claim Draft Intake at
`/:locale/member/claims/new`, where Manage remains a separate explicit action.
It claims no draft exists and creates no draft, claim, membership, entitlement,
persistence or submission effect.

This closes the active-member discoverability gap without reopening completed
anonymous `IDA-UI03a4`, inactive `IDA-UI03a5`, secure-draft `IDA-UI03a1` or active
intake `IDA-UI03a3` work.

## Selection

`5 = best` for value/Phase C fit; `1 = smallest/easiest` for the other columns.

| Candidate                                     | Value | Scope | Dependencies | Protected risk | Proof cost | Rollback | Phase C fit |
| --------------------------------------------- | ----: | ----: | -----------: | -------------: | ---------: | -------: | ----------: |
| `IDA-UI03a6` active-member saved-work entry   |     3 |     1 |            1 |              1 |          2 |        1 |           5 |
| Existing public-header overflow               |     2 |     2 |            1 |              1 |          3 |        1 |           3 |
| `IDA-UI03b` different-email recovery          |     3 |     4 |            4 |              5 |          5 |        3 |           2 |
| Frozen `IDA-UI03a2` draft-to-claim conversion |     5 |     5 |            5 |              5 |          5 |        4 |           2 |

The active entry is the smallest product-visible continuation. Different-email
recovery changes ownership/security semantics; draft-to-claim changes claim
writers and remains frozen; the header defect is retained but does not advance
the saved-progress journey.

## Current contract and UI benchmark

The dashboard already computes a content-free capability boolean only for the
neutral host, raw `member|user` role and default public tenant. It is not a draft
existence signal. Subscription resolution distinguishes active, inactive and
unresolved. The current view hides the saved-work entry for active membership.
Inactive `?mode=drafts` admission, normal active intake, explicit Manage and all
owner-scoped draft CRUD already exist.

Observed `2026-07-30T19:44:32Z`:

- Allianz Claims Portal separates unsubmitted claims and supports save-and-return:
  `https://www.allianztravelinsurance.ca/en_CA/file-a-claim/how-to-submit-a-claim.html`.
- Progressive exposes one Claims section for filing and existing-claim access:
  `https://www.progressive.com/manage-policy/`.
- GEICO distinguishes reporting a new claim from accessing a claim dashboard:
  `https://claims.geico.com/ClaimsExpress/Locate`.
- UK PCOL returns auto-saved partial claims through the personal homepage:
  `https://www.possessionclaim.gov.uk/pcol/claim/helphlp.action`.

Criteria: explicit saved-work discoverability, clear capability-versus-existence
truth, and preservation of the primary next action. Better-than-baseline target:
explicit saved-work affordances on the eligible active dashboard rise from zero
to exactly one. Measure by focused component and exact browser assertions.
Interactions to the list remain two; Manage stays deliberate. Learn from
principles only; copy no words, layout, branding, illustration or trade dress.

## Exact implementation writer map

1. `apps/web/src/components/dashboard/member-dashboard-view/helpers.ts`
2. `apps/web/src/components/dashboard/member-dashboard-view/index.tsx`
3. `apps/web/src/components/dashboard/member-dashboard-view.test.tsx`
4. `apps/web/e2e/smoke/ida-dashboard-smoke.spec.ts`

First action: add RED active/inactive/unresolved href cases, then put the
content-free decision in the concise helper before wiring the view. Active uses
the plain intake path; inactive retains exact `?mode=drafts`.

## Contract closure and highest-risk cases

| Node/edge                               | Closed contract                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| page admission → capability prop        | Existing neutral-host/raw-role/default-tenant matrix; no draft read.                                 |
| subscription tuple → href helper        | Fulfilled active → plain intake; fulfilled inactive → `?mode=drafts`; unresolved → none.             |
| hero primary → secondary entry          | Existing primary action stays first; one semantic secondary link follows it.                         |
| active link → normal intake             | Existing route ignores manager-only mode; Manage remains deliberate.                                 |
| inactive link → manager-only intake     | Completed `IDA-UI03a5` behavior remains exact.                                                       |
| draft actions → owner/session authority | Existing list/resume/update/delete and dormant submit remain unchanged.                              |
| collectors → baseline                   | Page admission, dashboard, route/intake/action and `smoke-ida` collectors cover the zero→one target. |

Proof must cover:

1. eligible active member + resolved subscription shows exactly one saved-work
   entry after the unchanged primary action;
2. active member with zero drafts sees the same capability entry and no
   existence/count claim; empty truth appears only after explicit Manage;
3. unresolved subscription stays fail-closed;
4. inactive behavior from `IDA-UI03a5` remains exact;
5. agent/non-member and non-neutral/non-default admission remain unchanged;
6. active/open-case next-action priority is not replaced;
7. active navigation shows normal intake plus explicit Manage; draft actions,
   dormant submission and owner isolation remain unchanged.

No special browser capability, database mutation, provider or Z620-only canary is
introduced. Normal focused browser proof is sufficient.

## Forbidden surfaces and non-goals

Forbidden: `apps/web/src/proxy.ts`; route/core/page admission; Claim Draft Intake;
auth/session/OTP; tenancy/RLS/schema/migrations; draft persistence/domain actions;
claim creation/submission/events/audit; billing/Paddle; messages; dependencies;
other dashboards; public-header remediation; README; AGENTS; architecture docs;
deployment, provider or production configuration.

Not promoted: `IDA-UI03a2`, `IDA-UI03b`, `IDA-UI03a0c`, another UI-tree node,
draft counts/auto-open, a new route, new copy, or broad dashboard redesign.

Line ceilings are binding: helper `<=150`; legacy view `<=430`; legacy unit test
`<=483`; smoke spec `<=150`. Stop and return to authority if implementation
needs a fifth writer path, exceeds a ceiling, needs new copy, route/page/domain
changes, a second proof environment, a persistence/privacy primitive, or exceeds
eight active engineering hours/twelve wall-clock hours without a PR-ready head.

## Evidence and gates

Focused proof:

```sh
pnpm --filter @interdomestik/web test:unit --run \
  'src/app/[locale]/(app)/member/page.test.tsx' \
  'src/app/[locale]/(app)/member/claims/new/page.test.tsx' \
  src/components/dashboard/member-dashboard-view.test.tsx \
  src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx \
  src/actions/free-start-drafts.boundary.test.ts
pnpm --filter @interdomestik/web test:smoke:ida
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm check:modularity-guard
```

Mandatory Phase C proof: `pnpm pr:verify`, `pnpm security:guard`,
`pnpm e2e:gate`, repo-size/plan/tracker checks, current-head CI/E2E/Pilot,
Sonar, CodeQL, gitleaks, audit/security, finalizer, feedback sweep and zero
unresolved threads. Codex Security diff scan remains waived by user instruction.

## Rollout, rollback and authority

One implementation PR after this gate merges, the resolver selects only
`IDA-UI03a6`, UI/UX and admission receipts pass, and a separate exact runtime
receipt is accepted. Rollout is normal web deployment with no flag or migration.
Rollback is the exact implementation-merge revert, triggered by unauthorized
visibility, primary-action displacement, an unexpected draft read/existence
claim, wrong active/inactive destination, or failed current-head evidence. No
data rollback is required. This gate grants no runtime/deploy/production
authority and promotes no second slice.
