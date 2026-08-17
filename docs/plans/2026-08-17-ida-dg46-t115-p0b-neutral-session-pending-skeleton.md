---
document_id: IDA-DG46-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON
date: 2026-08-17
status: reviewed_candidate_pending_exact_arben_approval
authority: advisory_until_exact_hash_approval_and_docs_only_canonical_merge
base_sha: 392079fd0e0f4bc670c1bee6a2b85250670c776c
resolver_before_gate: blocked_requires_current_authority
active_slice_before_gate: null
proposed_slice: IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON
risk_tier: 2
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
---

# IDA-DG46 — T-115 P0B neutral session-pending skeleton

## Decision

Propose exactly one Tier 2 product/UI/accessibility micro-slice:
`IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON`.

While the canonical public landing's browser session is unresolved, the dynamic
front-door runtime renders one neutral localized status skeleton. It does not
render either existing resolved journey. As soon as the session resolves, the
existing anonymous or member behavior renders unchanged.

This candidate grants no branch, worktree, active execution, product mutation,
runtime, deployment or production authority. It requires exact Arben approval,
a byte-identical docs-only authority merge, then a separately exact-main runtime
receipt and exact approval.

## Current authority and scope reconstruction

Clean, synced repository main is
`392079fd0e0f4bc670c1bee6a2b85250670c776c`. The resolver is correctly
`blocked_requires_current_authority`, `activeSlice=null`. `current-program`
ranks the unimplemented T-115 session-pending/OD#17 residual first and says it
needs a fresh exact gate; its completed P0A canonical composition must not be
reopened. The sole outcome selected here is the smaller session-pending
transition, not OD#17 certification or Hero redesign.

The earlier, unpromoted `IDA-T115-P0a-NEUTRAL-SESSION-PENDING-SHELL` is advisory
history only, not authority and not reused. Its Opus review identified a now
resolved UI-v2 flag concern (P0A's canonical page now passes `uiV2Enabled={true}`)
and an overclaim: `front-door-session-context.spec.ts` is outside the required
PR E2E project. This gate therefore uses a new P0B identity, does not change the
page, and does not claim a held-session browser test as required merge evidence.

Preserved user-owned worktrees are recorded only for preflight convergence:
`/Users/arbenlila/development/interdomestik-infra-upgrade-roadmap` and
`/Users/arbenlila/.codex/worktrees/9283/interdomestik-crystal-home`. They are
not candidate-branch collisions, are not dirty main, and are never writers,
cleanup targets or proof environments for this slice.

## Entry-tree continuity

The tree remains: neutral public entry → situation choice → anonymous draft and
secure-save/recovery → saved-draft re-entry/save-submit truth → **this
session-resolution handoff** → resolved anonymous entry or member continuation
→ later dashboard work. P0B adds no route, claim, membership or recovery
transition; it prevents a temporary traversal of a resolved branch before the
only identity selector has authoritative state.

## Frozen behavior contract

`HomePageRuntime` currently reads `authClient.useSession().data` but not
`isPending`; `{ data: null, isPending: true }` is consequently treated as
resolved anonymous. P0B changes only this precedence:

`legacy UI-v1 > UI-v2 unresolved session > resolved member > resolved anonymous`.

| State                                               | Required behavior                                                               | Must not happen                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `uiV2Enabled=true`, `isPending=true`                | one presentation-only runtime skeleton with existing localized `common.loading` | runtime Hero, Free Start intake, funnel tracking, navigation/redirect, interactive controls |
| `uiV2Enabled=true`, `isPending=false`, user absent  | exact current anonymous Hero/intake props                                       | new recovery, membership or route behavior                                                  |
| `uiV2Enabled=true`, `isPending=false`, user present | exact current member continuation props                                         | new dashboard, claim or membership behavior                                                 |
| `uiV2Enabled=false`                                 | exact legacy null/redirect behavior                                             | P0B skeleton or routing change                                                              |

The skeleton is confined to the dynamic runtime subtree. Static `Header` and
below-fold page siblings remain read-only; this gate does not falsely claim the
entire server page is unbranded. The skeleton itself must not receive or render
tenant, host, support-contact or user values, and it performs no storage/network
write. The existing host-resolution effect may still run but cannot make a
runtime child visible or tracked while pending.

Use a semantic `role="status"`, `aria-live="polite"`, a stable
`data-testid="public-entry-session-skeleton"`, existing `common.loading`, and no
motion-dependent meaning. No message key, copy translation, logo, design-system
primitive or global loading boundary is authorized.

## Value, hypothesis and UI/UX evidence

Outcome: a returning member never first sees the anonymous public journey solely
because their session has not yet resolved. Hypothesis: at the sole selector,
recognizing `isPending` reduces wrong resolved branches rendered during pending
from two (Hero and intake) to zero, while preserving all resolved outputs.

Primary metric: visible runtime wrong-branch count during controlled pending
state, `2 → 0`, measured by the focused component contract. The standard full
PR E2E is regression evidence only; it does not construct a held-session state.
This honest boundary avoids a new workflow or browser-fixture surface.

Benchmark principles only: one stable waiting state, staged disclosure after
identity is known, and no premature account-state action. Sources observed
2026-08-17: [AirHelp](https://www.airhelp.com/en-int/air-passenger-rights/),
[Lemonade](https://www.lemonade.com/faq), and
[Allianz Assistance](https://apac.claims.booking.allianz-assistance.com/).
No source wording, layout, brand, artwork, sequence or trade dress is copied.

## Frozen writer map and contract audit

Exactly three product/test writers:

1. `apps/web/src/app/[locale]/components/home/public-entry-session-skeleton.tsx`
2. `apps/web/src/app/[locale]/components/home/home-page-runtime.tsx`
3. `apps/web/src/app/[locale]/components/home/home-page-runtime.test.tsx`

`scripts/repo-size-budget.json` is conditional deterministic metadata only if
the staged tracked product bytes require sync. It is not a product writer. All
production files must remain below 150 lines; the existing runtime/test files
must be reduced or decomposed rather than exceed their limits.

Read-only consumers: `[locale]/page.tsx` (sole mount), `Header`,
`HeroSection`, `FreeStartIntakeShell`, `FunnelLandingTracker`, anonymous
draft/recovery modules, canonical routes and all saved-draft/dashboard paths.
The complete touched contract was audited: `useSession` supplies both identity
and pending state; `HomePageRuntime` is the sole selector; Hero/intake/tracker
are resolved-state consumers; legacy redirect is a separate preserved branch;
the existing unit test is the only new assertion collector. No writer performs
create/update/delete, persistence, action or provider work.

## Forbidden surfaces and non-goals

Do not edit `apps/web/src/proxy.ts`, routes, page/layout/header, auth/session
implementation, tenant resolution, analytics implementation, drafts/recovery,
claims, membership, billing (Paddle remains the only V3 pilot provider; no
Stripe or parallel provider), schema/RLS, messages/i18n values, design-system,
Hero copy/layout, dashboard, OD#17 performance certification, T-116/T-117/T-118,
CI/workflows, Docker/Supabase, AI OS/Brain, deployment or production.

No Suspense, route `loading.tsx`, global loading boundary, feature flag, new
browser lane or test infrastructure. Do not add a `front-door-session-context`
writer: it is not collected by required PR E2E and would widen the slice.

## TDD, acceptance and gate plan

First implementation action after separately approved runtime: add one RED unit
case to `home-page-runtime.test.tsx` for `{data:null,isPending:true}` before
creating/wiring the skeleton.

Focused GREEN evidence:

1. one localized status skeleton, no interactive controls;
2. zero Hero, intake, funnel tracking or redirect while pending;
3. resolved anonymous and member prop contracts unchanged;
4. legacy UI-v1 redirect/null contract unchanged;
5. touched lines/files remain modular and size metadata deterministic.

Focused commands:

```sh
pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/home-page-runtime.test.tsx'
pnpm check:modularity-guard
pnpm check:e2e-contracts
node scripts/repo-size-budget-sync.mjs --check
```

After focused proof and one bounded current-diff senior review, request current
head Copilot feedback (the main ruleset is active). Required Phase C merge proof
remains one full exact-head PR E2E plus `pnpm pr:verify`, `pnpm security:guard`,
gitleaks/audit, CodeQL, Sonar and finalizer. A required skipped test fails;
rerun only evidence invalidated by changed paths, head or environment. GitHub
Ubuntu is the heavy CI/E2E authority; Mac is a light writer and does not start
Docker/Supabase; Z620 is unnecessary unless a genuine governed blocker arises.

## Guardrails, disposition and rollback

Guardrails: zero changed resolved outputs; zero new writes; zero dynamic
tenant/host/support-contact token in skeleton; accessible status; three-writer
ceiling; no browser/workflow expansion; one exact-head full E2E.

- `KEEP`: `2 → 0` and every guardrail/current-head gate passes.
- `REVERT`: any wrong resolved output, tenant exposure, accessibility defect,
  draft/recovery regression or route change.
- `INCONCLUSIVE`: the pending state cannot be represented in the focused hook
  contract without auth infrastructure; stop and re-gate rather than widen.

Failure taxonomy: selector product defect; test-harness/environment; stale head;
CI/resource/network; reviewer feedback; tooling/API. Freeze the valid checkpoint,
audit the whole touched contract, fix one root cause and rerun only invalidated
proof.

Roll back by reverting the one future product merge. No data rollback exists:
P0B changes no data contract. Stop instead of expanding if a fourth product/test
writer, new copy, auth/session change, route/global boundary, storage, analytics
change, browser environment, authority addendum or second remediation is needed.

## Promotion and closeout boundary

The future docs-only authority PR may contain only this immutable gate, compact
program/tracker selection state and conditional deterministic size metadata. It
grants no runtime. Its closeout must preserve a minimal current tracker and link
detailed evidence into the stable archive; it must not restore CI/AI OS history.
After merge, fresh repo authority/resolver convergence must yield exactly P0B
awaiting runtime; then prepare a separate exact-main runtime receipt. Product
closeout records the exact PR/merge/gates/metric/rollback, keeps residual T-115
unpromoted, preserves user-owned worktrees and returns resolver to
`blocked_requires_current_authority`, `activeSlice=null`.
