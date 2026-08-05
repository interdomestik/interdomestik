# IDA-DG26 — Anonymous Hero membership-row retirement

Status: proposed current-authority design gate; no canonical effect, runtime receipt, product
mutation, deployment or production authority until exact Arben approval, docs-only merge and fresh
exact-main resolver/scorecard proof.

Gate: `IDA-DG26`

Sole implementation slice: `IDA-UI06b`

Classification: Tier 2 product UI/accessibility implementation selected by a Tier 0 docs-only gate

Base: `515bec77997091f2f2fb0697cb71ddad9ad5f27f`

Runtime authorized: false

Deployment/CD/provider/staging/production authorized: false

## Exact decision and outcome

Remove only `PublicMembershipAction` from the anonymous variant of `HeroSection`, while preserving
`PublicSituationActions`, `PublicSupportPanel`, member continuation, the header, intake, routes,
copy/i18n and every section outside the Hero unchanged.

The primary user is an anonymous or returning person who opens the public page because something
happened and needs to identify the next help action. The business outcome is a shorter, calmer
Help Now Hero whose immediate-help hierarchy is not interrupted by the inherited annual-membership
sales row. Membership remains available outside the Hero through the existing pricing surface;
this slice neither redesigns that surface nor changes membership eligibility, billing or routing.

Entry state: the current anonymous Hero renders its situation actions, support panel and
`PublicMembershipAction`. Exit state: the same Hero renders the same situation actions and support
panel but no membership row or `/pricing` action inside `public-entry-hero`; the authenticated
member-continuation branch is byte-for-byte behaviorally unchanged.

This is not authority for the separately recorded legacy non-header overflow residual and is not a
Hero redesign. It does not claim to finish the broader UI journey tree. It retires one proven,
named subtree and its direct tests without prescribing any replacement composition.

## Current authority and source audit

`IDA-UI06a` closed only the public-header seam. Its canonical closeout records legacy root overflow
outside the header and any Hero or full-page redesign as separate, unpromoted future work. The
current resolver therefore correctly returns `blocked_requires_current_authority` with
`activeSlice=null`; this gate is the fresh authority selection requested by Arben.

Current source evidence on the exact base:

- `hero-section.tsx` imports and renders `PublicMembershipAction` only in the anonymous branch.
- `public-entry-actions.tsx` owns the component and also includes it in the compatibility
  `PublicEntryActions` aggregate; repository search finds no runtime importer of that aggregate.
- `hero-section.test.tsx`, `public-entry-actions.test.tsx` and
  `public-entry-hero.spec.ts` are the only live tests that assert `public-entry-membership`.
- `page.tsx` mounts `PricingSection` outside the Hero for the existing public-page variants, so
  removing the Hero row does not remove the page's existing membership/pricing surface.
- No store, API, auth/session transition, tenant decision, schema, event, provider or deployment
  edge is involved.

Historical `IDA-DG05` / `IDA-UI01a` evidence remains completed history. This gate supersedes only
the currently rendered anonymous-Hero membership-row contract; it does not reopen or recertify the
rest of that completed slice.

## UI/UX benchmark and measurable outcome

Observed on `2026-08-05` for the exact urgent-help versus acquisition seam:

- The AA breakdown-help page places one `Get help` action first, then safety and service details;
  cover status or joining is handled later or by phone rather than as a competing Hero row:
  `https://www.theaa.com/breakdown-cover/advice/broken-down-get-help`.
- AAA's roadside-assistance page presents both `Join AAA` and `Request roadside assistance` near
  the first heading, providing a useful negative comparison for action competition:
  `https://www.ace.aaa.com/content/ace-www/en/automotive/roadside-assistance.html`.
- GOV.UK emergency-service guidance recommends fewer links, shorter sentences and immediate
  information for people whose comprehension may be affected by stress:
  `https://www.gov.uk/service-manual/agile-delivery/making-services-in-an-emergency`.

Comparison criteria are immediate-help action priority, unrelated acquisition competition,
mobile/stress readability, preservation of support/safety routes and progressive disclosure of
commercial detail. The anti-copy boundary is strict: use only prioritization principles; copy no
words, layout, branding, illustration or distinctive trade dress.

Numeric better-than-baseline outcome: count top-level anonymous-Hero content groups before the
adjacent `FreeStartIntakeShell`; baseline `3` (`PublicSituationActions`, `PublicSupportPanel`,
`PublicMembershipAction`), target `2`, unit `groups`, direction `lower`. Measure from the rendered
`public-entry-hero` DOM on every supported locale and assert that the two retained groups and their
accessible actions remain present. This metric proves bounded simplification, not business
conversion or completion of a redesign.

The schema-v1 UI/UX receipt lives outside the product repository under the task evidence root. It
must bind `gateId=IDA-DG26`, `soleSlice=IDA-UI06b`, all three source URLs, `blockedSources=[]`, the
numeric metric above, Arben's verbatim scope approval and the final exact gate approval before
promotion. The advisory governance check never grants repository or runtime authority.

## Exact implementation writer map

1. `apps/web/src/app/[locale]/components/home/hero-section.tsx`
2. `apps/web/src/app/[locale]/components/home/hero-section.test.tsx`
3. `apps/web/src/app/[locale]/components/home/public-entry-actions.tsx`
4. `apps/web/src/app/[locale]/components/home/public-entry-actions.test.tsx`
5. `apps/web/e2e/public-entry-hero.spec.ts`
6. `scripts/repo-size-budget.json` only through the unchanged deterministic size-sync command

One writer, one new implementation task, one worktree and one implementation PR only. The future
runtime receipt must bind these exact six paths and the then-current exact main. A fifth product
source/test path beyond the five named app paths, or any second product outcome, stops for re-gate.

First implementation action: make the focused component and browser contracts RED by requiring no
`public-entry-membership` in the anonymous Hero while preserving the exact situation/support and
member-continuation assertions; only then remove the import, render, component export and orphaned
source imports inside the approved writer map.

## Contract graph and closure

| Contract edge | Required disposition |
| --- | --- |
| localized `page.tsx` → `HomePageRuntime` / legacy Hero mount | Existing flags, mounts and sibling sections remain unchanged. |
| `HomePageRuntime` → anonymous `HeroSection` | Same session decision, locale, tenant-derived support contacts and entry point. |
| anonymous Hero → `PublicSituationActions` | Preserve all four immediate-help destinations, names and intent behavior. |
| anonymous Hero → `PublicSupportPanel` | Preserve WhatsApp, diaspora, emergency and privacy content/links. |
| anonymous Hero → `PublicMembershipAction` | Delete this sole legacy render edge and its component contract. |
| member Hero → `MemberContinuation` | Preserve `/member` and optional new-case continuation behavior. |
| public page → `PricingSection` | Preserve the existing outside-Hero membership surface; no test or copy rewrite. |
| source → unit/E2E collectors | Update only assertions owned by the removed row; retain all help/support/no-overflow checks. |

Closure audit covers all importers and renderers of `PublicMembershipAction`, the compatibility
aggregate, all `public-entry-membership` collectors, anonymous/member branch selection, retained
support and situation actions, the adjacent intake, the outside-Hero pricing surface, supported
locales, keyboard/accessible names and browser overflow collectors. There is no shared runtime
consumer beyond the localized public entry, no read/write/delete edge, and no new capability or
special proof environment. Existing Mac/Z620/GitHub allocation is reused without configuration
change; current-head browser proof is required later and cannot be inferred from this gate.

## Acceptance evidence and highest-risk cases

| Acceptance criterion | Authoritative collector |
| --- | --- |
| Anonymous Hero has exactly two retained top-level content groups | `hero-section.test.tsx` plus rendered `public-entry-hero` DOM in `public-entry-hero.spec.ts` |
| No membership row, test ID or `/pricing` link remains inside the Hero | same unit and browser collectors plus repository search on exact head |
| Component/export and compatibility aggregate no longer carry the retired row | `public-entry-actions.test.tsx`, source audit and type-check |
| Four situation actions and their destinations/intent behavior remain exact | `public-entry-actions.test.tsx` and `public-entry-hero.spec.ts` |
| Support, emergency/privacy and member continuation remain exact | both focused component suites and focused browser proof |
| Header, intake, outside-Hero pricing and canonical page markers remain unchanged | scope audit, existing public collectors and mandatory Phase C gates |
| No narrow/mobile/zoom overflow or keyboard/accessibility regression is introduced | existing public Hero browser geometry/accessibility assertions across supported locales |

No durable store, event, audit row, external-provider state or fixture is created. Evidence is
source/test/DOM state bound to exact head. The highest risks are accidentally removing the external
pricing surface, deleting support/safety actions, changing the member branch, broadening into a
Hero redesign, deleting i18n keys, masking inherited overflow, weakening existing tests merely to
make them green, or treating fewer DOM nodes as proof that the full-page overflow residual is fixed.

## Responsive, accessibility and frontend contract

- Preserve the `section`, `aria-labelledby`, `public-entry-title` and `public-entry-hero` contract.
- Preserve heading hierarchy, situation/support DOM order, accessible names, link destinations,
  visible focus, keyboard activation, 44-CSS-pixel targets, forced-colors and reduced-motion use.
- Do not add replacement spacing, decorative content, client state/effects, viewport sniffing,
  overflow masking, route logic, new copy or analytics.
- Remove the now-orphaned membership-only source imports, but retain every message key unchanged;
  unused membership copy is a bounded residual of the approved i18n exclusion, not authority to
  expand four locale files.
- Keep every touched TS/TSX file no larger than its base and under the repository's modularity
  ceiling. Deletion is preferred over refactor.

## Forbidden surfaces, exclusions and non-goals

Forbidden: `apps/web/src/proxy.ts`; canonical routes/hosts and `*-page-ready` markers; header;
`FreeStartIntakeShell`; `PublicSituationActions`; `PublicSupportPanel`; support-contact resolution;
messages/i18n values; pricing and every other section outside the Hero; auth/session/tenancy;
schema/RLS/migrations; membership state, billing/Paddle and entitlements; draft/claim writers;
analytics/events; global CSS/layout; shared UI tokens; dependencies/lockfiles; CI/workflows;
Vercel/provider/deployment/production configuration; README; AGENTS; architecture documents.

Non-goals: solve or mask legacy non-header overflow; redesign or replace the Hero; change its
heading/copy/brand; create a new membership CTA; change pricing; alter anonymous recovery or saved
progress; modify the member dashboard; finish the UI tree; activate M6; enroll M7; deploy; or select
a successor slice.

Stop before mutation if implementation needs copy/i18n deletion, `page.tsx`, a new test file, a new
browser/runtime/persistence/privacy/provider/schema/routing/auth/tenancy/billing/state primitive,
another independently invalidatable proof surface, more than the six writers, a second authority
addendum or a second product outcome. Re-size at eight active engineering hours or twelve wall-clock
hours without a PR-ready exact-head checkpoint; after eighteen wall-clock hours only scoped proof,
remediation, merge and closeout may continue.

## Verification and reviewer plan

Focused implementation proof, after separate runtime authorization:

```sh
pnpm --filter @interdomestik/web test:unit --run \
  'src/app/[locale]/components/home/hero-section.test.tsx' \
  'src/app/[locale]/components/home/public-entry-actions.test.tsx'
pnpm --filter @interdomestik/web test:e2e -- \
  'e2e/public-entry-hero.spec.ts' --project=ks-sq --project=mk-mk
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm check:modularity-guard
pnpm repo:size:check
git diff --check
```

Final implementation evidence remains the mandatory Phase C contract: `pnpm pr:verify`,
`pnpm security:guard`, `pnpm e2e:gate`, exact-current-head CI, Sonar/new-issue intake, CodeQL,
gitleaks, pnpm audit, repo-native security, Copilot/reviewer feedback, finalizer, mergeability and
zero unresolved threads. Codex Security diff scan remains explicitly user-waived; repo-native
security is not waived. Heavy build/browser evidence uses the governed Z620 path; Mac remains
control/light writer and GitHub-hosted Ubuntu supplies lightweight authoritative evidence. This
gate does not require CD or Vercel because it changes no deployment contract; any automatic CD is
classified and contained under existing policy.

Reviewer matrix: senior product/UX/accessibility and contract review; `qa_reviewer` for focused and
regression collectors; `architect_reviewer` for scope/consumer closure; `security_reviewer` for
protected-surface non-impact; `performance_reviewer` for removal-only bundle/layout risk; and
`gatekeeper` for final exact-head evidence. One bounded senior design review is required before
exact-hash approval. A second signal is needed only for a blocker, disagreement or unavailable
priority route. Model review is advisory and never replaces repository gates or Arben approval.

Bounded reviewer disposition on this exact candidate: the priority Claude Opus 5 route was
`blocked` after 4.890 seconds because its OAuth access token had expired (`401`), before any review
result. The approved GPT-5.6 Sol Max fallback then ran once in read-only mode and returned `PASS`
after 765.287 seconds: exact base and hashes aligned, the resolver remained fail-closed,
deterministic size metadata was synchronized, product code was unchanged, and every live
`PublicMembershipAction` source, aggregate and test consumer fit the five named app paths. It found
no blocker or hardening item. Sonar/reviewer comments are not applicable before a PR. Codex
Security diff scan remains user-waived; this docs-only gate creates no replacement security
evidence requirement.

## Rollout, rollback and authority boundary

The implementation uses the existing web rollout only after a separately authorized and merged
implementation PR. Rollback is the exact implementation-merge revert. Trigger rollback or block
merge if any retained Help Now/support/member-continuation action changes, the outside-Hero pricing
surface disappears, accessible/keyboard/overflow proof regresses, a protected surface changes, or
current-head evidence fails. No data, schema, provider or production-data rollback exists.

After exact gate approval, passing UI/UX and admission receipts, docs-only PR merge and fresh
governed publication/check, the resolver must select exactly `IDA-UI06b` with
`runtimeAuthorized=false`. Only then may a new implementation task register active execution and
start a prospective measured product session before coding. A separate exact runtime receipt is
still required. M6 is not activated by this gate and may be used only if the later governed
verification/shadow path independently authorizes it; no M7 cohort claim is made.

If the resolver names another slice, the gate hash/approval drifts, the receipts do not pass, or
repo authority conflicts with this scope, stop fail-closed. On gate merge, promote only
`IDA-UI06b`; promote no successor.
