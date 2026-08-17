---
document_id: IDA-DG45-T115-P0A-CANONICAL-FRONT-DOOR
date: 2026-08-17
status: remediated_candidate_pending_exact_artifact_rereview
authority: advisory_until_exact_hash_approval_and_docs_only_canonical_merge
base_sha: f4f6b5f8d93bfa30fffbd0c9c94eae32b42926be
resolver_before_gate: blocked_requires_current_authority
active_slice_before_gate: null
proposed_slice: IDA-T115-P0a-CANONICAL-FRONT-DOOR
risk_tier: 2
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
---

# IDA-DG45 — T-115 P0a canonical front door

## Decision

Propose exactly one Tier 2 product/UI/accessibility micro-slice:
`IDA-T115-P0a-CANONICAL-FRONT-DOOR`.

The one outcome is to make the already-built Help Now/member-continuation landing
the sole repository-controlled front-door composition. The locale root always
mounts the existing `HomePageRuntime` with the existing UI-v2 contract and no
longer chooses between two page compositions through `NEXT_PUBLIC_UI_V2`.
Anonymous users retain the current Help Now Hero, case-choice actions and Free
Start intake. A resolved member retains the existing member-continuation links.
The legacy direct page-level Hero/intake composition and its sticky CTA are no
longer mounted. This also retires the legacy authenticated-root redirect in favor
of the already-built member continuation, activates the runtime's existing
host/session-aware support-contact selection, and makes its existing
consent/environment-gated landing-view analytics reachable.

This does not redesign the Hero and does not finish T-115. It is the smallest
active-path prerequisite that makes a later session-pending skeleton provable in
the shipped tree. It grants no branch, worktree, active execution, product
session, runtime, deployment or production authority. Exact Arben approval and a
byte-identical docs-only authority merge are required first; product code still
requires a separate exact-main runtime receipt and approval.

## Checkpoint and selection

Repository `main` and `origin/main` are clean and identical at
`f4f6b5f8d93bfa30fffbd0c9c94eae32b42926be`. Current program priority 1 is
`T-115`; dependencies `T-108` and `T-114` are complete. Resolver state is
`blocked_requires_current_authority`, `activeSlice=null`.

The first P0a proposal—adding a session-pending skeleton only inside the dormant
UI-v2 branch—was rejected after Opus 5 review in 454.436 seconds. The reviewer
proved every checked-in environment selects UI-v1, the proposed ida browser test
was absent from required CI, and SSR/no-JS plus page siblings made the four-path
contract incomplete. No code or authority was created from that draft.

The corrective selection follows the dependency rather than widening the rejected
slice. Before pending behavior can be measured, the unit-tested modern branch
must be the one real product branch. Existing required browser suites have so far
run the legacy branch; the one full exact-head PR E2E is therefore the first
browser-wide proof of the canonical composition. This candidate changes only the
page-level composition selector; it does not add session logic or turn the
rejected skeleton into dark code.

## Entry-tree harmony

The existing user journey remains one tree:

1. public `ida.*`/locale root and Help Now choice — UI01a;
2. vehicle/property/injury/flight action — current public entry;
3. anonymous draft, continuity and secure save — UI03a1/UI03a4;
4. different-email recovery — UI03b;
5. saved-draft re-entry and save/submit truth — B1–B10;
6. resolved anonymous or member continuation — existing `HomePageRuntime`;
7. session-pending neutral skeleton — later T-115 residual after this activation;
8. unified membership dashboard and design system — later T-117/T-118/T-116.

Today the locale page contains both the runtime branch and a second direct
Hero/intake branch. `isUiV2Enabled()` selects between them, while every checked-in
environment defaults the flag to false. Consequently the session-aware member
continuation and its existing tests are not the canonical product composition.
P0a removes only that dual-selection point. It does not add a second entry, route,
state machine, draft path or dashboard.

The currently deployed production flag value could not be independently proven:
both Mac and Z620 DNS probes for `ida.interdomestik.com` failed, and no local
Vercel credential was available. Therefore this gate makes no claim that every
user currently sees the legacy branch. It proves only the repository fact that
two compositions remain selectable today and ensures future builds cannot select
the legacy page composition.

## Frozen behavior contract

| State | Required after P0a | Preserved boundary |
| --- | --- | --- |
| locale landing, anonymous/no JS | Existing server-visible Help Now Hero, Free Start anchor and static four-locale content; MK locale now receives the existing MK support contact rather than the legacy prop-less KS fallback | no-JS gate, public actions and draft recovery unchanged; contact policy/code unchanged |
| locale landing, resolved anonymous with JS | Existing runtime Hero and Free Start intake, `publicEntryEnabled=true`; existing host/session-aware support contacts remain authoritative | no support-contact implementation, tenant input or route change |
| locale landing, resolved member with JS | Existing member continuation (`/member`, existing next-claim destination), `publicEntryEnabled=false`, instead of the legacy authenticated-root redirect | no new membership or claim behavior |
| session pending | Existing runtime behavior remains a disclosed residual | no new skeleton or session/auth change in P0a |
| malformed `IDA_HOST` | Existing neutral OTP fail-closed value `null` | page unit contract unchanged |
| UI-v1 flag/env value | No longer controls the locale landing composition | flag helper and every non-landing consumer remain untouched |
| analytics consent/environment allows landing event | Existing `funnel_landing_viewed` path becomes reachable through `HomePageRuntime` | no analytics implementation, payload or consent-policy change |

The locale root must emit `data-variant="hero_v2"` deterministically and mount
exactly one `HomePageRuntime`. It must not directly mount `HeroSection`,
`FreeStartIntakeShell` or `StickyPrimeCTA`. `Header`, all below-fold sections and
`Footer` remain in the same order. The sticky component source, test and aggregate
export remain untouched orphaned cleanup evidence; deleting them is not product
value and is excluded to keep one outcome.

## Frozen writer map

Exactly three maximum paths:

1. `apps/web/src/app/[locale]/page.tsx`
2. `apps/web/src/app/[locale]/page.test.tsx`
3. `apps/web/e2e/gate/public-locale-no-js-shell.spec.ts`

Conditional deterministic repository-size metadata may be staged only if the
tracked-only sync changes `scripts/repo-size-budget.json`; it is metadata, not a
fourth product surface. No file is added, deleted, moved or renamed. All touched
code/test files must remain below 150 lines; `page.tsx` and `page.test.tsx` must
become smaller.

Read-only contract consumers include `HomePageRuntime` and its unit test,
`HeroSection`, `FreeStartIntakeShell`, all public action, anonymous draft, recovery,
secure-save, pricing, member and dashboard code, `StickyPrimeCTA`, feature flags,
analytics, Playwright configuration and the front-door session-context gate.

## Exact implementation boundary

`page.tsx` may only:

- remove its landing-only `isUiV2Enabled` decision;
- remove direct imports/mounts used only by the legacy page branch;
- set the existing page marker to the literal canonical variant `hero_v2`;
- mount `HomePageRuntime` once with the existing inputs and `uiV2Enabled={true}`;
- preserve Header, below-fold sections and Footer in their existing order;
- cease mounting `StickyPrimeCTA` without deleting its source or messages.

No production edit to `HomePageRuntime` is authorized. Its current anonymous,
member, tenant/host, analytics and legacy compatibility behavior is evidence being
activated, not behavior being rewritten.

`page.test.tsx` replaces the flag-off branch test with exact single-composition
proof. The no-JS gate adds the canonical variant assertion to its shared server
fallback helper. Because that gate file is already 147 lines, it may gain at most
one assertion without structural growth. `page.test.tsx` is already 150 lines and
must shrink. The unselected root `ui-v2-funnel-continuity.spec.ts` remains a
read-only residual and is not acceptance evidence.

## UI/UX benchmark and measurable outcome

Current sources observed on 2026-08-17:

- AirHelp presents one direct compensation-check entry before later claim state:
  <https://www.airhelp.com/en-int/air-passenger-rights/>.
- Lemonade describes one guided claim entry rather than parallel account-state
  experiences: <https://www.lemonade.com/faq>.
- Allianz separates file/complete and track-claim actions behind one stable portal
  entry: <https://apac.claims.booking.allianz-assistance.com/>.

Adopt only the principles of one predictable entry composition, staged disclosure
and explicit next action. Do not copy wording, layout, branding, illustration or
trade dress. Blocked sources: none.

Numeric better-than-baseline outcome: repository-controlled landing compositions
reachable from `[locale]/page.tsx`, unit `compositions`, baseline `2`, target `1`,
direction lower. Measure by page unit collectors plus exact DOM markers in the
JavaScript-disabled required gate. User value is a single
predictable front door: anonymous entry and resolved-member continuation no longer
depend on an environment flag selecting a different page tree.

## Acceptance and TDD

First implementation action after separate runtime approval: change
`page.test.tsx` to an expected RED that sets the mocked flag false but still
requires one `HomePageRuntime` call with `uiV2Enabled:true`, no direct legacy
`FreeStartIntakeShell` call, and the canonical `hero_v2` marker.

Focused GREEN must prove:

1. the page has one repository-controlled composition regardless of the flag mock;
2. server shell remains request/session neutral and resolves the same OTP authority;
3. malformed IDA authority still reaches runtime as `neutralOtpHost:null`;
4. page renders no direct legacy Hero/intake/sticky mount;
5. JavaScript-disabled SQ/EN/SR/MK still see the existing Hero, Free Start anchor,
   category actions, flight guidance, no horizontal overflow and literal
   `data-variant=hero_v2`;
6. unchanged HomePageRuntime unit proof still passes for resolved anonymous,
   resolved member, host/session separation and legacy compatibility; the
   separately named unchanged Hero/PostHog/analytics units prove support-contact
   selection and analytics consent/environment gating;
7. page proof (`uiV2Enabled:true`) plus the unchanged flag-off redirect unit form
   an explicit inference that the legacy page-level redirect is retired; no
   positive authenticated browser assertion is claimed in P0a;
8. modularity, E2E contracts and deterministic size budget pass.

Focused commands:

```sh
pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/page.test.tsx' 'src/app/[locale]/components/home/home-page-runtime.test.tsx' 'src/app/[locale]/components/home/hero-section.test.tsx' 'src/components/providers/posthog-provider.test.tsx' 'src/lib/analytics.test.ts'
pnpm check:modularity-guard
pnpm check:e2e-contracts
node scripts/repo-size-budget-sync.mjs --tracked-only --check
```

The changed no-JS gate receives one focused canonical browser proof through the
governed GitHub Ubuntu lane when the PR exists. Then run exactly one
full exact-head PR E2E. Mandatory current-head evidence remains `pnpm pr:verify`,
`pnpm security:guard`, `pnpm e2e:gate`, gitleaks, audit, CodeQL, Sonar, reviewer
feedback and finalizer. A skipped required assertion is failure; rerun only proof
invalidated by changed files, head or environment.

The exact-head E2E is expected to re-point the existing landing consumers,
including public accident/injury/property/flight safety journeys,
`public-header-overflow`, premium Free Start organizer/result/recovery,
different-email recovery and CSP report-only landing coverage. A failure on one
of these is an expected-surface product defect until classified, not presumed
flake. This enumeration changes no collector or workflow.

Mac remains control plane/light writer; no Mac Docker/Supabase. GitHub Ubuntu is
merge-authoritative for CI/E2E. Z620 is not needed unless a proven exact-environment
blocker requires the governed heavy route.

## Hypothesis, guardrails and disposition

Hypothesis: fixing the page selector to the already-tested runtime composition
reduces reachable landing compositions from two to one without changing any
public action, draft/recovery contract or route, and without losing the no-JS
fallback while the existing MK contact policy becomes correctly reachable.

Guardrails: exact four-locale/no-JS continuity; exact existing anonymous/member,
host/contact and consent-gated analytics runtime contracts; zero
route/proxy/auth/session/tenant/persistence changes; no new message, dependency or
analytics event; no Hero redesign; three writer paths; one
exact-head E2E; no production/deployment mutation.

- `KEEP`: one composition is reachable and all guardrails/gates pass.
- `REVERT`: no-JS content, public actions, draft anchor, member continuation,
  authenticated-root behavior, host-aware support contacts, analytics contract,
  accessibility, routes or locale parity regress. Expected disappearance of the
  legacy sticky CTA and expected retirement of the legacy authenticated-root
  redirect in favor of member continuation are part of the approved
  canonicalization, not by themselves revert triggers.
- `INCONCLUSIVE`: repository CI cannot exercise the literal canonical marker and
  the existing anonymous/member runtime evidence without a new environment; stop
  and re-gate instead of adding workflow scope.

Failure taxonomy: product composition defect, browser/no-JS environment, stale
head, CI/resource/network, reviewer feedback or tooling/API. Freeze the last valid
checkpoint and rerun only the invalidated surface.

## Explicit exclusions

No `apps/web/src/proxy.ts`, route, redirect, Header, layout or loading boundary;
no `HomePageRuntime` production change; no auth/session/better-auth/Supabase;
no tenant resolution or support-contact policy; no localStorage, draft, recovery,
secure-save, claim, membership, billing/Paddle, schema/RLS/migration; no messages;
no analytics implementation; no feature-flag helper/config/env/turbo change; no
dependency/lockfile; no Sticky source/test/export deletion; no Hero copy/layout;
no T-115 pending skeleton or OD#17 certification; no T-116/T-117/T-118/dashboard;
no CI/workflow, AI OS/Brain, deployment or production.

Known residual evidence is not authority to expand P0a: the now-unreachable
`HomePageRuntime` UI-v1 compatibility branch/test, orphaned Sticky source/test/export,
unselected `ui-v2-funnel-continuity.spec.ts`, and stale turbo-contract rationale
remain for later bounded cleanup only if current authority selects them.

Stop rather than expand if a fourth product/test writer, new route/auth/session
behavior, feature-config change, new E2E project or authority addendum is needed.
The bounded Opus re-review findings are addressed in this exact candidate without
claiming a final model PASS; do not start another design-review/remediation loop.
Re-size at eight active or twelve wall
hours; after eighteen wall hours only already-scoped proof/remediation/merge/
closeout may continue.

## Rollback and closeout

Rollback is one revert of the exact future product merge. There is no data rollback
because P0a writes no data. The docs-only gate PR may materialize only this gate,
compact program/tracker promotion state, canonical architecture tracker linkage
and deterministic size metadata; it grants no runtime.

Implementation closeout must record exact PR/head/merge/main, the `2 → 1` result,
focused and one full E2E evidence, reviewer/Sonar/CodeQL/security/finalizer,
rollback and residual T-115 work. It must not promote the pending skeleton,
performance certification or dashboard nodes. Resolver returns to
`blocked_requires_current_authority`, `activeSlice=null`; main is clean/synced and
only the exact slice branch/worktree is removed while user-owned state is preserved.
