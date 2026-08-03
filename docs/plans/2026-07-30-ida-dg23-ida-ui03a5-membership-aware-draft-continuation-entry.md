# IDA-DG23 — Inactive-account saved-draft continuation

Status: proposed current-authority/design gate  
Sole prospective implementation slice: `IDA-UI03a5`  
Classification: product-facing UI/workflow  
Risk tier: Tier 3 (exact neutral-host inactive-account exception inside an existing route)  
Base SHA: `027f6db9327b14faf12c9d33d156824d794906c2`  
Runtime authorized: false  
Deployment authorized: false  
Production authorized: false

## Outcome

Let a verified person who previously saved eligible vehicle/property preparation
on the neutral IDA front door resume, edit, or permanently delete those drafts
after returning with no access-active membership.

The inactive dashboard exposes one secondary “Resume or manage” action. It opens
the existing canonical route at `/member/claims/new?mode=drafts`. That exact mode
renders a manage-only variant of the existing `ClaimDraftIntake`; it does not
render `FreeStartIntakeShell`, create a new route, grant membership, create a
claim, or add persistence.

This slice changes only the missing inactive-account continuation branch:

- anonymous/no verified account recovery remains the completed `IDA-UI03a4`
  same-browser journey;
- access-active member preparation remains the completed `IDA-UI03a3` journey;
- active/open-case priorities remain unchanged;
- different-email recovery and draft-to-claim conversion remain later slices.

## Current journey truth

| State                                 | Current evidence                                                                                                                                                                 | This slice                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Anonymous / no verified account       | `IDA-UI03a4` preserves eligible facts for 30 days in the same browser with resume/discard.                                                                                       | No change.                                                                 |
| Verified account, inactive membership | `IDA-UI03a1` already stores six facts by access tenant and owner; membership is not required for secure draft CRUD. The dashboard and membership gate currently hide that store. | Add one truthful continuation entry and a manage-only inactive route mode. |
| Access-active member                  | `IDA-UI03a3` already provides explicit save/resume/update/delete at `/member/claims/new`; submission remains dormant.                                                            | No change, including when `?mode=drafts` is present.                       |
| Active member with case/action        | Existing dashboard priorities select documents, authorization, member action, or open case.                                                                                      | No change.                                                                 |

Every secure draft action continues to fail closed through the unchanged
`resolveFreeStartDraftSession`. `apps/web/src/proxy.ts` remains read-only.

## Why this is the next smallest valuable product slice

Value and Phase C fit use `5 = best`; scope, dependencies, protected risk, proof
cost, and rollback use `1 = smallest/easiest`.

| Candidate                                                   | User value | Scope | Dependencies | Protected risk | Proof cost | Rollback | Phase C fit |
| ----------------------------------------------------------- | ---------: | ----: | -----------: | -------------: | ---------: | -------: | ----------: |
| `IDA-UI03a5` inactive continuation entry + manage-only mode |          5 |     2 |            1 |              2 |          3 |        1 |           5 |
| Active-member secondary manager entry                       |          2 |     2 |            1 |              2 |          2 |        1 |           3 |
| Tenant-to-neutral signed-in handoff                         |          5 |     4 |            4 |              5 |          5 |        3 |           2 |
| `IDA-UI03b` different-email recovery                        |          3 |     4 |            4 |              5 |          5 |        3 |           2 |
| `IDA-UI03a2` draft-to-claim conversion                      |          5 |     5 |            5 |              5 |          5 |        4 |           2 |

The selected slice is one coherent outcome: discover and continue an existing
owner-scoped draft while inactive. It deliberately excludes the earlier R5
active-member entry, public shell recovery switch, cross-origin designs, and
separate mobile/desktop variants.

Base repository size is exactly `5,632 / 5,632` tracked files. This gate is the
only new tracked authority file, so the bounded authority PR must finish at
exactly 5,633 tracked files. Its other planned paths—current program, current
tracker, and repo-size budget—already exist. Benchmark, approval, admission,
review, and canary receipts remain external task artifacts and do not add
repository files.

Canonical base-tree inventory measures `config/data/messages=1,824,440` bytes.
The preserved skip-worktree `.codex/config.toml` is 902 bytes larger locally
than its committed blob; that is local measurement contamination, not canonical
growth. The docs-only authority PR must produce and prove its final budget from
the exact staged Git tree or a detached clean checkout after governance files
are final. It may capture only the exact authority-document delta; it may not
authorize an implementation message change or unrelated inventory increase.

Because the authority PR is docs/governance only, its exact post-authority
implementation ceilings are already fixed:

- `source/scripts <= 7,953,805` bytes;
- `tests/e2e <= 6,024,848` bytes;
- `config/data/messages = 1,824,440` bytes;
- tracked files `= 5,633`.

The exact post-authority total/docs bytes are bound by the final staged
repo-size-sync evidence before authority merge. Implementation adds, deletes,
and renames zero files, does not touch messages or the budget, and must finish
at or below the four fixed ceilings above.

## Primary user and business value

Primary user: a verified default-public-tenant person who saved preparation on
neutral IDA, returns without active membership, and needs the facts already
entered instead of starting again.

Business value: reduce repeat entry and abandonment while keeping free
preparation visibly separate from member assistance and claim submission.

Manual outcome measure:

- baseline: the inactive neutral dashboard offers no path to secure drafts;
- target: one secondary action reaches the existing owner-scoped list, resumes
  all six stored facts, permits an explicit update or permanent delete, and
  never exposes a new-draft, Start another, or claim-submission action;
- no analytics change is authorized.

## Benchmark evidence

Observed on `2026-07-30T06:37:42Z`:

1. GOV.UK One Login separates “start or resume” from task completion:
   `https://www.sign-in.service.gov.uk/documentation/design-recommendations/save-progress`.
2. Progressive separates reporting a claim from viewing existing work:
   `https://www.progressive.com/claims/faq/how-to-report-a-claim/`.
3. Allstate keeps file/track actions distinct from account and benefit truth:
   `https://www.allstate.com/claims/file-track`.

Comparison criteria:

- whether resuming existing work is distinct from starting/submitting a claim;
- whether the current highest-priority account action remains primary.

Blocked-source accounting: none for this bounded comparison.

Better-than-baseline measure: successful inactive-dashboard continuation of all
six facts in a fresh same-account browser session, measured across ten clean
seed resets. Baseline is `0/10`; target is at least `9/10`, and higher is better.
This is a post-merge product KPI sample, not a merge gate. The one deterministic
C31 journey plus unit/contract matrix is the merge acceptance lane; the ten-run
receipt informs the next authority decision without reopening this slice.

Use only explicit re-entry, state truth, and task prioritization principles. Do
not copy wording, layout, branding, illustrations, or trade dress. The
structured benchmark/approval receipt must pass
`ui-ux-governance-check.mjs` before promotion.

## Exact writer map

The future implementation may write only these eleven existing paths:

1. `apps/web/src/app/[locale]/(app)/member/claims/new/_core.entry.tsx`
2. `apps/web/src/app/[locale]/(app)/member/claims/new/page.test.tsx`
3. `apps/web/src/app/[locale]/(app)/member/page.tsx`
4. `apps/web/src/app/[locale]/(app)/member/page.test.tsx`
5. `apps/web/src/components/claims/claim-draft-intake/index.tsx`
6. `apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`
7. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/secure-save-band.tsx`
8. `apps/web/src/components/dashboard/member-dashboard-view/index.tsx`
9. `apps/web/src/components/dashboard/member-dashboard-view/types.ts`
10. `apps/web/src/components/dashboard/member-dashboard-view.test.tsx`
11. `apps/web/e2e/smoke/ida-dashboard-smoke.spec.ts`

No file may be added, deleted, or renamed.

Measured modularity plan:

| Path                           | Current lines | Post-change ceiling | How the proof fits                                                                                                                                                                    |
| ------------------------------ | ------------: | ------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claim-new `_core.entry.tsx`    |           143 |                 149 | Compact the existing diaspora constant/type/parser block before adding the exact mode predicate and inactive branch.                                                                  |
| claim-new `page.test.tsx`      |           137 |                 149 | Convert mode failures into one table and compact existing mock/assertion layout.                                                                                                      |
| member `page.tsx`              |            74 |                  90 | Add current-header, raw-role, and default-tenant eligibility only.                                                                                                                    |
| member `page.test.tsx`         |           143 |                 149 | Remove the dead `MemberDashboardV2` mock before adding current-header/eligibility proof.                                                                                              |
| `claim-draft-intake/index.tsx` |           149 |                 149 | Compact the existing handoff/prop contracts; add only an optional manage-only branch.                                                                                                 |
| `claim-draft-intake.test.tsx`  |           149 |                 149 | Repurpose the configured-host visibility test to prove manage-only behavior.                                                                                                          |
| `secure-save-band.tsx`         |           149 |                 149 | Compact its six-line `Props` declaration; add one optional prop and conditions around Save and Start another.                                                                         |
| dashboard `index.tsx`          |           495 |                 494 | Compact the icon import and open-status constant; add one shared-breakpoint secondary link inside the existing hero action stack.                                                     |
| dashboard `types.ts`           |            17 |                  22 | Add one optional eligibility prop and an optional supplemental subscription-resolution flag.                                                                                          |
| dashboard test                 |           635 |                 635 | Extend the existing inactive assertion and an existing active assertion; remove equivalent redundant lines so the legacy file does not grow.                                          |
| IDA smoke spec                 |           150 |                 150 | Replace the second-context public-home resume path in existing C31 with dashboard-link → manager-mode resume; preserve creation, fresh-session identity, six-fact proof, and cleanup. |

Any twelfth implementation path, tracked-file increase beyond 5,633, exceeded
ceiling, implementation size-budget change,
new route, message edit, or change to persistence, auth, cookie scope, tenant
resolution, membership semantics, proxy, schema, billing, or claim behavior
stops implementation and requires fresh authority.

## Exact execution contract

### Dashboard eligibility and entry

Member page derives `draftManagerAvailable` only when all are true:

1. the current request passes unchanged `evaluateNeutralOtpHost(await headers())`;
2. the original, uncoerced session role is exactly `member` or `user`;
3. the session tenant equals unchanged `resolveDefaultPublicTenantId()`.

The value is computed before `withMemberActorRoleOnSession` can convert an agent
to the member actor view. Agent/staff/admin/unknown roles therefore receive
false even if they can exercise another portal surface.

`MemberDashboardView` adds optional `draftManagerAvailable?: boolean`, default
false. `getDashboardSupplementalData` appends a third boolean showing that the
subscription lookup fulfilled; the tuple member is optional for existing test
callers. It is true for a fulfilled inactive result and false for lookup failure
or missing tenant. The entry renders only when the lookup fulfilled, returned
no active subscription, and `draftManagerAvailable` is true. A degraded lookup
must not expose an entry that may be false for an active account.

The entry:

- is a secondary link after the existing membership activation CTA inside the
  hero action stack;
- uses one DOM element at every viewport, with no `hidden` or responsive-hide
  class, so 320px and desktop exercise the same action;
- has test id `member-draft-continuation`;
- points exactly to `/{locale}/member/claims/new?mode=drafts`;
- reuses the existing localized `freeStart.secureSave.manage.open` label by
  parsing the existing secure-save copy. Exact EN: “Resume or manage”;
- does not claim a draft exists and does not change the primary membership
  title, copy, CTA, hero state, service cards, or priorities.

No entry renders on tenant/unknown/spoofed hosts, tenant mismatch, other raw
roles, or access-active membership. Active/open-case behavior is untouched.

### Exact inactive manager-mode admission

Extend the existing search-param shape so values may be strings or arrays.
Inactive manager mode is true only when:

1. the query object has exactly one own key;
2. that key is `mode` with scalar value exactly `drafts`;
3. the current request passes unchanged `evaluateNeutralOtpHost`;
4. the verified session role is exactly `member` or `user`;
5. `ensureTenantId(session)` equals unchanged
   `resolveDefaultPublicTenantId()`;
6. the existing membership lookup returns inactive.

The unauthenticated redirect remains before header evaluation, membership
exception, message loading, and manager rendering.

`hasActiveMembership` is awaited directly. Only a fulfilled `false` means
inactive. A rejected dependency lookup propagates to the existing route error
boundary and must not render either the membership gate or manager surface; no
catch-to-false conversion is authorized.

Arrays, duplicates represented as arrays, case changes, whitespace, extra
keys, diaspora/category keys, tenant/unknown/spoofed hosts, forwarded-host
mismatch, other roles, tenant mismatch, or access-active membership preserve
normal route behavior:

- inactive account receives the existing membership gate;
- active account receives the existing `IDA-UI03a3` Claim Draft Intake, even
  when `?mode=drafts` is present;
- diaspora handoff and configured presentation host remain unchanged.

Current-request host evaluation is used only for exception admission. The
existing `resolveNeutralOtpHost()` remains unchanged as the client presentation
hint. Every draft action independently rechecks request host, fresh session,
access/default tenant equality, and owner scope.

### Manage-only Claim Draft Intake

Add optional `managerOnly?: boolean` to the existing `ClaimDraftIntake`
composition and optional `manageOnly?: boolean` to `SecureSaveBand`.

When manager-only:

- preserve the existing draft-only heading and truth panel;
- render the existing secure-save band and Manage action;
- hide the new-draft `free-start-save-open` and
  `free-start-start-another` actions;
- render no category/details/preview panel until an existing draft is resumed;
- do not auto-open Manage, list, count, resume, create, update, or delete on
  page load;
- after explicit Manage → Resume, render the existing resumed
  `ClaimDraftMainPanel`, including six facts, Back to details, explicit Save
  changes, conflict handling, permanent delete, and dormant disabled submit;
- expose no claim success, real submit handler, public result generation,
  membership success, checkout, or member benefit.

The component continues to import only the bounded organizer/draft primitives
already approved and implemented by `IDA-UI03a3`. It must not import
`FreeStartIntakeShell`, `useOrganizerSubmit`, `submitFreeStartIntake`,
`ClaimWizard`, or a claim writer. This preserves the merged `IDA-DG20`
import-boundary residual risk.

Normal `ClaimDraftIntake` and normal `SecureSaveBand` callers omit the optional
props and remain unchanged.

## Tier 3 platform and operations assessment

Permission matrix:

| Context                                                   | Dashboard entry | Exact inactive mode           | Draft authority                        |
| --------------------------------------------------------- | --------------- | ----------------------------- | -------------------------------------- |
| Anonymous/no session                                      | no              | login redirect                | none                                   |
| Neutral, raw `member` or `user`, default tenant, inactive | yes             | yes                           | unchanged owner-scoped action boundary |
| Neutral, raw `member` or `user`, default tenant, active   | no              | ignored; normal active intake | unchanged                              |
| Tenant/unknown/spoofed host                               | no              | no                            | action boundary also rejects           |
| Agent/staff/admin/unknown raw role                        | no              | no                            | none through this seam                 |
| Default-tenant mismatch                                   | no              | no                            | action boundary also rejects           |

Data, privacy, and lifecycle:

- no schema, RLS, grant, store, field, audit, retention, cookie, or identity
  change;
- only the existing six non-health facts are read or explicitly updated;
- existing owner/access-tenant predicates, CAS version conflicts, idempotency,
  pagination, 200-draft cap, and permanent delete remain authoritative;
- drafts keep the existing until-owner-delete retention truth; no content is
  added to logs, analytics, or model review.

Failure, resilience, and concurrency:

- page load performs no draft operation and has no local/device fallback;
- list/resume/update/delete failures keep the existing visible live-region
  states and never claim success;
- simultaneous updates retain existing CAS conflict behavior;
- missing session, host mismatch, tenant mismatch, or role mismatch falls back
  to the existing login/membership/active-intake behavior, never a permissive
  manager;
- rejected membership or subscription lookup never becomes authoritative
  inactive state: the route rejection propagates, while the dashboard’s third
  supplemental flag remains false;
- no provider, webhook, queue, email, payment, callback, retry service, or
  production runner dependency is introduced.

Performance and cost:

- dashboard adds only one translation namespace read and deterministic
  host/role/tenant checks plus a boolean on the existing subscription result;
  it adds no data query;
- route admission adds deterministic checks around the already-required
  membership lookup;
- only an explicit Manage action starts the existing paginated list call;
- no provider cost, model token cost, new bundle dependency, or scale-sensitive
  background work is introduced.

Accessibility and responsive behavior:

- the secondary action is a semantic link in the existing action stack with an
  existing localized accessible name and keyboard focus treatment;
- one element reflows at 320px and desktop rather than maintaining divergent
  variants;
- existing list focus, live status, confirmation, disabled-submit explanation,
  and resumed-panel focus contracts remain in force.

Observability and support:

- existing content-free `free_start_draft.resumed|updated|deleted` audit events
  remain the only durable operational signals;
- visible status and account-context errors remain the support diagnostic;
- no alert, metric, trace, runbook, or admin workflow change is justified for
  this bounded discoverability seam.

Reviewer matrix:

- security/auth/tenancy: exact host, raw role, default tenant, action-boundary
  recheck, owner scope;
- product/UX/accessibility: truthful inactive hierarchy, one responsive link,
  no draft-existence claim;
- maintainability/contracts: `IDA-DG20` import boundary, optional defaults,
  line/byte ceilings;
- QA/E2E/gate: route failure table, manager-only component state, and updated
  inactive C31;
- performance/operations: no new query on page load, explicit list only,
  rollback leaves drafts intact.

One bounded Opus 5 review is required while quota is available. The exact hash
gets one call with a 30-minute timer; extending wait never resubmits the same
hash. GPT-5.6 Sol Ultra is the fallback only for quota exhaustion or route
unavailability. Model review remains advisory.

## Forbidden surfaces

- `apps/web/src/proxy.ts`;
- `FreeStartIntakeShell`, anonymous recovery hook/band, local-storage contract,
  public entry, landing runtime, login return, or cross-origin handoff;
- any new/renamed route, redirect architecture, URL builder, or canonical
  clarity marker;
- `evaluateNeutralOtpHost`, `resolveFreeStartDraftSession`,
  `resolveDefaultPublicTenantId`, tenant host classification, auth/session/OTP
  implementation, cookie scope, roles, and permissions;
- all message JSON files;
- database schema, migrations, RLS, draft CRUD, owner identity, audit,
  idempotency, encryption, retention, and seed state;
- membership/subscription lookup behavior;
- claim creation, conversion, submission, numbering, lifecycle, events,
  notifications, documents, providers, or public result generation;
- Paddle, checkout, billing, repo-size budget, deployment aliases, runners,
  Docker, and production configuration;
- `README.md`, `AGENTS.md`, architecture documents, frozen branches/worktrees,
  `IDA-UI01b`, `IDA-UI03a2`, `IDA-UI03b`, `IDA-UI03a0c`, PR `#1455`,
  `IDA-CD-DG02`, and `IDA-CD02`.

## Highest-risk cases

1. Exact mode bypasses membership on a non-neutral/spoofed host, other role, or
   non-default tenant.
2. Agent sees a link because the member page coerces its actor role.
3. Active member is diverted from the existing intake.
4. Extra/array/near-match query enters manager mode.
5. Manager mode exposes new-draft Save or a real claim/public submit path.
6. Page load lists or mutates drafts.
7. Resume loses any of the six stored facts or owner isolation.
8. Dashboard copy implies a draft exists or displaces membership activation.
9. Subscription lookup failure is mistaken for confirmed inactivity.
10. Mobile hides a separately rendered action.
11. A touched file grows beyond its measured ceiling or tracked files differ
    from the exact post-authority 5,633 baseline.

## Acceptance evidence

Focused route proof:

- unauthenticated access redirects before manager admission;
- exact neutral inactive `member|user`, default tenant, and only
  `mode=drafts` renders manager-only intake;
- a table rejects tenant/unknown/`ida.evil.example`/forwarded mismatch, other
  roles, tenant mismatch, arrays, near matches, and extra keys into the
  unchanged membership gate;
- a rejected membership dependency propagates and renders neither manager nor
  inactive gate; only a fulfilled false is inactive;
- active exact-mode and normal active requests render the same existing intake
  without `managerOnly`;
- normal inactive, diaspora handoff, configured presentation host, localized
  pricing link, and `new-claim-page-ready` remain unchanged.

Focused component/dashboard proof:

- manager-only shows Manage but not new-draft Save or an initial main panel;
- explicit resume reveals the existing fact/preview path while dormant submit
  remains disabled and no claim/public writer enters the import graph;
- page load calls no draft action;
- member page passes true only for current neutral + raw member/user + default
  tenant;
- optional dashboard eligibility defaults false;
- inactive eligible state shows one exact localized link after the primary
  activation action with no responsive-hide class;
- subscription lookup failure or missing tenant never renders the link;
- active membership and ineligible host/role/tenant render no link;
- `getDashboardSupplementalData` proves fulfilled-null yields
  `subscriptionResolved=true`, while rejection/missing tenant yields false;
- tracked files remain exactly 5,633;
- implementation `source/scripts` and `tests/e2e` category bytes do not exceed
  `7,953,805` and `6,024,848`; config/messages remains `1,824,440`, so
  implementation does not sync or raise the repo-size budget;
- dashboard hero/priority behavior remains unchanged.

Existing C31 browser proof is updated, not duplicated:

1. use its existing neutral host and `KS_MEMBER_EMPTY` inactive account;
2. create and securely save the six eligible facts on the public Free Start
   surface;
3. close the first context and sign the same account into a fresh context;
4. open the member dashboard, follow `member-draft-continuation`, and prove the
   exact URL, existing intake marker, visible Manage action, and absent
   new-draft Save action;
5. Manage → Resume all six facts, prove dormant submit and no claim success,
   then permanently delete;
6. preserve context cleanup and keep the spec at or below 150 lines.

Reuse without rerunning historical implementation proof:

- owner isolation, CRUD lifecycle, same-email cross-session/device, RLS, and
  OTP evidence from merged `IDA-UI03a1`;
- anonymous main-landing recovery from merged `IDA-UI03a4`.

The slice touches the active intake root and shared save band, so it explicitly
reruns the unchanged
`claim-draft-intake/claim-draft-intake.boundary.test.ts`, normal active-intake
component/route proof, and shared `SecureSaveBand` default-caller proof from
`IDA-UI03a3`. It does not recertify unrelated UI03a3 lifecycle/storage evidence.
Rerun only this invalidated proof, evidence invalidated by the eleven paths, and
mandatory current-head gates.

## Focused and mandatory gates

Focused:

- claim-new route, Claim Draft Intake, member page/dashboard, and updated C31;
- unchanged `claim-draft-intake.boundary.test.ts` import-graph contract plus
  normal active/default shared-consumer regression;
- `pnpm i18n:check`;
- `pnpm i18n:purity:check`;
- `pnpm check:modularity-guard`;
- `pnpm check:e2e-contracts`;
- `pnpm repo:size:check`;
- `pnpm slice:verify`;
- `pnpm slice:e2e:pr`;
- Playwright MCP watched neutral inactive continuation and tenant fail-closed
  proof.

Mandatory Phase C:

- `pnpm pr:verify`;
- `pnpm security:guard`;
- `pnpm e2e:gate`.

Repo-native PR evidence still includes gitleaks, CodeQL, `pnpm audit`, Sonar,
reviewer feedback, finalizer, mergeability, approvals, and unresolved-thread
count. Codex Security diff scan is explicitly waived by user instruction.

## Runtime authority and runner allocation

Runtime is not authorized by this proposed document. After gate merge, AI OS
refresh/check must be attempted and the repository resolver must select only
`IDA-UI03a5` before an implementation worktree is created.

Expected allocation:

- Mac: operator control and light unit/i18n/static proof only;
- Z620 `interdomestik-z620-staging`: build/attestation, E2E, and applicable
  staging/CD proof after fresh disk/memory/lease preflight;
- GitHub-hosted Ubuntu: lightweight PR and production evidence.

No Docker Engine/Desktop may start on Mac.

## Rollout and rollback

Rollout is the normal reviewed merge and exact-main verification. There is no
feature flag, migration, provider mutation, production release, or automatic
CD authority.

Rollback: revert only the exact implementation merge. This removes the
inactive dashboard entry and exact manager mode while leaving all saved drafts
untouched and still manageable from the existing public Free Start surface.
Trigger rollback if an unauthorized host/role/tenant/query is admitted, active
behavior changes, membership/claim truth is false, implicit mutation occurs,
facts fail to round-trip, or required gates fail.

## Prior proposal disposition

R0–R6 were proposed-only hashes and were never approved, promoted, implemented,
committed, pushed, or merged. Their reviewer findings remain discovery
evidence. R5 bundled active dashboard work, public recovery control, and
infeasible test/file pressure; all three are removed here. R6 exposed missing
proof invalidation, dependency-failure, and exact post-authority size bindings;
those are corrected here. No prior hash may be reviewed again.

## Non-goals

- anonymous secure manager entry; anonymous continues through `IDA-UI03a4`;
- active-member dashboard entry or active-mode behavior change;
- tenant-to-neutral handoff or return path;
- detecting/counting drafts or auto-opening Manage;
- creating a new draft from inactive manager mode;
- different-email recovery, account merge, or ownership transfer;
- draft-to-claim conversion or claim submission;
- injury/medical or flight persistence;
- second product slice.

## Stop conditions

Stop before promotion, implementation, or merge if:

- Arben has not approved the exact reviewed hash and sole slice;
- benchmark approval or admission receipt is not `pass`/`ready`;
- resolver selects zero, multiple, or another slice;
- implementation needs a path outside the eleven-path map;
- any file must be added/deleted/renamed, exceed its ceiling, or change the
  implementation repo-size budget;
- exact mode cannot remain inactive + neutral host + raw member/user + default
  tenant + exact query scoped;
- active intake or anonymous recovery changes;
- cross-origin URL, login return, session sharing, proxy, host classifier,
  message edit, seed, or Playwright configuration becomes necessary;
- auth, tenancy, schema/RLS, membership semantics, billing, claim conversion,
  new persistence, or new-draft creation becomes necessary;
- manager mode expands into detection, auto-resume, or conversion.

## Next authority action

1. Hash this exact proposed gate and run deterministic writer/line/query/role/
   host/mobile/E2E feasibility checks.
2. Obtain one senior review on that immutable hash.
3. Obtain Arben’s exact approval for the reviewed hash and sole slice.
4. Create benchmark approval and admission receipts.
5. Add sole promotion to `current-program.md` and `current-tracker.md`.
6. Merge one docs/design-gate-only authority PR after checks/review.
7. Refresh/check AI OS and require resolver selection of only `IDA-UI03a5`.
