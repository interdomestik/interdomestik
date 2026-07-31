# IDA-DG25 — Public-header overflow containment

Status: proposed current-authority/design gate; no promotion or runtime authority until exact
Arben approval, passing UI/UX and admission receipts, merge, and fresh resolver evidence.

Gate: `IDA-DG25`

Sole prospective implementation slice: `IDA-UI06a`

Classification: Tier 2 product UI, responsive accessibility and front-door continuity

Base SHA: `81f3b7d62308c00899b993a22f0a2e3ca480c80e`

Runtime authorized: false

Deployment/production authorized: false

## Outcome and value

At the canonical neutral public entry, the brand, language control and sign-in action reflow within
the document at the four narrow CSS layout widths already bound by the saved-progress journey:
320, 360, 390 and 430 pixels, including 200% CSS zoom plus WCAG text-spacing stress. The header
retains the same three calm functions, keyboard order, accessible names, destinations and locale
menu. It does not clip, force horizontal document scrolling, hide the defect with a global
overflow rule or move any action outside the header.

Primary user: an anonymous or returning person entering Interdomestik on a narrow or magnified
screen before sign-in or membership.

Business value: the canonical first interaction remains reachable and trustworthy for users who
magnify content, and the last explicitly recorded public UI-tree defect is closed before member
dashboard modernization starts.

Entry point: existing localized canonical `/:locale` public route on neutral `ida.*`.

Exit state: the same brand link, four-locale control and `/login` action remain available; the
public intake, anonymous recovery and every downstream route remain unchanged.

## Current authority, identifier and journey boundary

The repository resolver starts at `blocked_requires_current_authority`, `activeSlice=null`.
Completed work is reused, not reopened:

- `IDA-UI01a`–`IDA-UI01f`, `T-108`, `T-109`, `T-114`, `T-501` and ADR-06 already establish `ida.*`
  as the single canonical neutral public/login entry and country hosts as aliases.
- `IDA-UI03a4`, `IDA-UI03a5`, `IDA-UI03a3` and `IDA-UI03a6` close the same-account anonymous,
  verified-inactive and access-active saved-progress branches.
- `IDA-DG22-A3` proved that the recovery region is internally sound but recorded the no-offer
  public header at `left=451.6875`, `right=760.28125` in a 320-pixel document whose
  `scrollWidth=760`. It explicitly preserved the header overflow as an unpromoted remaining
  UI-tree candidate.

`IDA-UI04a` cannot be reused: repository history records that identity as stopped and archived.
`IDA-UI05a` was a different staff-queue draft that was never approved and was superseded. A
repository-wide exact search on this base finds no prior `IDA-UI06a`; this gate assigns that unused
identity only to public-header overflow containment. No prior receipt, branch or review is reused.

`IDA-UI03b` remains a separate different-email ownership-recovery problem. Frozen `IDA-UI03a2`
remains claim conversion. Neither is a baseline header prerequisite or promoted here.

## Candidate scoring and selection

`5 = best` for value/Phase C fit; `1 = smallest/easiest` for the other columns.

| Candidate                             | Value | Scope | Dependencies | Protected risk | Proof cost | Rollback | Phase C fit |
| ------------------------------------- | ----: | ----: | -----------: | -------------: | ---------: | -------: | ----------: |
| `IDA-UI06a` public-header containment |     4 |     1 |            1 |              1 |          3 |        1 |           5 |
| Member-dashboard loading continuity   |     3 |     2 |            2 |              1 |          3 |        1 |           4 |
| `T-118` broad `ui/crystal` primitives |     4 |     4 |            2 |              2 |          4 |        2 |           4 |
| `T-117` RSC/parallel-route/PPR shell  |     5 |     5 |            3 |              5 |          5 |        4 |           3 |
| `IDA-UI03b` different-email recovery  |     3 |     4 |            4 |              5 |          5 |        3 |           2 |
| Frozen `IDA-UI03a2` conversion        |     5 |     5 |            5 |              5 |          5 |        4 |           2 |

`IDA-UI06a` wins because it is the sole canonical remaining UI-tree defect, is one component plus
focused proof, and completes the public-entry seam before the requested member-dashboard work.
The loading candidate is deferred, not promoted; its first draft was never approved, committed,
pushed or made authoritative. `T-117` and `T-118` are broader architecture/design-system programs;
the remaining UI03 candidates change identity ownership or claim writers.

`T-115` describes an unstarted neutral-public-shell and shared-skeleton queue boundary; the
canonical architecture tracker is planning input, not promotion authority. It does not own this
already-rendered client header, its locale disclosure or its zoom/text-spacing reflow defect. Only
current repository authority plus an exact approved and merged `IDA-DG25` can authorize
`IDA-UI06a`. This slice neither consumes nor completes `T-115`, and does not start `T-116`,
`T-117` or `T-118`.

## Source audit and benchmark

Current source evidence:

- `apps/web/src/app/[locale]/components/home/header.tsx` owns the brand link, locale menu and login
  action. It is 73 lines and is the first unclipped overflow contributor in the A3 receipt.
- `header.test.tsx` proves the calm three-function header, four locale options, 44-pixel minimum
  target classes and no nested interactive controls, but it does not prove browser geometry.
- A3's exact-browser baseline is content-addressed by SHA-256
  `9bdf42ba1919cc23459c2005e6a209c21837ef8c5b94aef8e0b86baf6de09d4b` and records a 440 CSS-pixel
  overflow delta at EN/320 under the required presentation.
- The header source blob is exactly
  `e91cce39278ecb175ee87b675d1520f32a9d9717` at both A3 source head
  `2d3e3b3f5cb2c181005c574266a5b2f32da4e971` and this gate's full base SHA, so the
  content-addressed baseline remains applicable;
  a source change invalidates that reuse and stops implementation for fresh baseline proof.

Benchmarks observed at `2026-07-31T12:04:50Z`:

- GOV.UK Header keeps the masthead purpose narrow and separates additional navigation rather than
  overloading the header: `https://design-system.service.gov.uk/components/header/`.
- U.S. Web Design System Header recommends a simple header when few actions fit, preserves logical
  keyboard order and requires project-specific accessibility testing:
  `https://designsystem.digital.gov/components/header/`.
- IBM Carbon UI Shell Header collapses or stacks header items at smaller widths and preserves
  keyboard reachability, labeling and explicit header-action sizing:
  `https://carbondesignsystem.com/components/UI-shell-header/style/` and
  `https://carbondesignsystem.com/components/UI-shell-header/accessibility/`.

The exact schema-v1 UI/UX receipt is bound at
`/Users/arbenlila/.codex/task-artifacts/019fa824-2676-7c22-9dcb-d21af1c354e6/ida-dg25/ui-ux-benchmark-receipt-v1.json`;
its governance-check result is bound beside it as `ui-ux-governance-check.txt`. It must name
`gateId=IDA-DG25`, `soleSlice=IDA-UI06a`, this exact public-header seam, and one operator record per
GOV.UK, USWDS and Carbon with the observation time, source URL and URL receipt above. It must also
record `blockedSources=[]`, comparison criteria of narrow-width reflow, stable function priority,
keyboard/target preservation and absence of global overflow masking. Its numeric user outcome is
exact public-header document overflow at EN/320 with CSS zoom 2 and required text spacing:
unit `CSS pixels`, baseline `440` (`760 - 320`), target `0`, direction `lower`, measured after fonts
and two animation frames by `document.documentElement.scrollWidth - clientWidth` in the exact
browser collector. The broader acceptance matrix must pass all four locales at all four widths.
The receipt must contain Arben's genuine timestamped approval of the final exact gate bytes and
SHA-256; no prefilled or stale approval is valid. Use only principles; copy no words, layout,
branding, illustration or distinctive trade dress.

## Exact implementation writer map

1. `apps/web/src/app/[locale]/components/home/header.tsx`
2. `apps/web/src/app/[locale]/components/home/header.test.tsx`
3. `apps/web/e2e/gate/public-header-overflow.spec.ts`
4. `scripts/repo-size-budget.json` only through the unchanged deterministic size-sync command

One writer and one implementation worktree only. No overlapping writer is allowed.

First implementation action: add the focused RED browser contract for the exact locale/width/
zoom/text-spacing matrix and the RED unit class/structure assertions; only then change the header's
small-width reflow and compact-brand presentation.

## Contract graph

| Node/edge                             | Closed contract                                                         |
| ------------------------------------- | ----------------------------------------------------------------------- |
| localized public page → `Header`      | Existing public route, host and page content remain exact.              |
| `Header` → brand home link            | Same accessible `Interdomestik` name and `/` destination.               |
| `Header` → locale disclosure/list     | Same SQ/EN/SR/MK options, disclosure behavior, DOM order and labels.    |
| `Header` → login link                 | Same localized label, `/login` destination and keyboard order.          |
| header CSS → narrow presentation      | Local wrapping/compaction only; no body/root overflow suppression.      |
| header → browser geometry collector   | Exact fonts/two-frame/width/zoom/text-spacing evidence.                 |
| public page → existing E2E collectors | Intake, recovery, locale, no-JS and canonical ready behavior unchanged. |

Closure audit covers the sole importer/consumer family (localized public page), all three header
actions, open/closed locale-disclosure states, keyboard/tab order, visible focus, target geometry,
document geometry, all four message locales, forced colors, reduced motion, loaded fonts, baseline
ownership and existing public-page collectors. There is no store, API, data writer, auth/session
transition, shared runtime consumer, provider or special runtime primitive. The sole special proof
environment is the established exclusive Z620 browser lane named below. The task-owned ephemeral
Playwright config is evidence infrastructure outside the repository, not a runtime writer.

## Acceptance criteria, proof collectors and highest risks

| Acceptance criterion                                     | Collector                                                 | Environment      |
| -------------------------------------------------------- | --------------------------------------------------------- | ---------------- |
| Zero document overflow at SQ/EN/SR/MK × 320/360/390/430  | new `public-header-overflow.spec.ts` exact 16-case matrix | Z620 browser     |
| Exact CSS width, zoom 2, text spacing, fonts + 2 frames  | same spec asserts width/media identity and stabilization  | Z620 browser     |
| Brand/locale/login remain named, ordered and reachable   | header unit test plus keyboard/focus browser assertions   | Mac light + Z620 |
| Every action remains at least 44 unscaled CSS pixels     | browser bounding/client geometry assertions               | Z620 browser     |
| Locale disclosure stays inside document when open        | 16-case open geometry and option reachability             | Z620 browser     |
| No global/body/root overflow masking or hidden actions   | unit/static class assertions plus full document geometry  | Mac light + Z620 |
| Normal narrow and desktop appearance does not regress    | 320/390 unzoomed plus 1440 browser checks                 | Z620 browser     |
| Public intake/recovery/no-JS/canonical routes stay green | focused public E2E plus mandatory repository E2E gate     | Z620 + CI        |

The browser collector must run at literal CSS layout widths, assert `innerWidth`, paired media
query identity, loaded fonts and two animation frames, apply CSS `zoom:2` and WCAG text spacing,
then require both header and document `scrollWidth <= clientWidth`. It must not substitute a 2×
viewport, hard-code the A3 baseline, use screenshot-only judgment or tolerate positive overflow.
Chromium, Firefox and WebKit focused runs are required because this is a cross-engine CSS geometry
defect; the complete Phase C gate remains separate.

The cross-browser collector runs through one exact task-owned ephemeral Playwright config in the
Z620 evidence directory. It must use the new spec as its sole `testMatch`, an exact neutral
`http://ida.127.0.0.1.nip.io:<task-port>/<locale>` origin served by the canonical app at the exact
implementation head, actual Chromium/Firefox/WebKit projects, zero retries, no skips, and no
inherited tenant, `Host` or `x-forwarded-host` headers. A cheap pre-implementation collection
canary must prove the spec is the only collected test in all three projects, the neutral host is
reachable, the app marker is present, browser/tool versions match the environment fingerprint,
and runner disk/memory/lease thresholds pass. Record config and driver bytes/SHA-256, command,
browser versions, app head, environment fingerprint and results in the durable execution ledger.
Move the exact temporary config/driver/report artifacts to recoverable Trash at closeout and bind
the cleanup receipt. Do not mutate a tracked Playwright config, workflow, dependency or machine
host/trust setting; if that becomes necessary, stop and re-gate.

Collector mapping is explicit:

- the task-owned config collects only `public-header-overflow.spec.ts` on neutral `ida.*` in all
  three engines and proves the full locale/width/zoom/text-spacing/disclosure matrix;
- the repository default gate collects the same spec on the existing country-host Chromium
  projects as alias no-regression evidence without changing project headers;
- `public-entry-hero.spec.ts` preserves public-entry content, header focus and canonical actions;
- `front-door-session-context.spec.ts` preserves the neutral front-door/session boundary through
  its existing opt-in projects;
- `premium-free-start-recovery.spec.ts` preserves saved-progress resume/discard behavior; and
- `public-locale-no-js-shell.spec.ts` preserves every locale's useful server-visible fallback.

The new spec must derive its origin from the active Playwright project rather than hard-code an
authority host, and run the same assertions on either neutral or country-alias collection. A
collection canary, one engine, a country-host-only result, screenshot-only evidence or an inherited
tenant/forwarded-host identity does not satisfy neutral-host proof.

Highest risks are hiding overflow globally, visually removing the brand without an accessible
name, shrinking targets below 44 pixels, reordering keyboard navigation, clipping the open locale
menu, fixing EN while longer locale labels still overflow, or altering public intake/recovery.

## Responsive, accessibility and visual contract

- Preserve the existing dark header, shield mark, localized login text and calm three-function
  information architecture; this is containment, not redesign.
- At stressed narrow widths the shield may be the compact visual brand only if the brand link keeps
  the exact accessible name `Interdomestik`; the wordmark remains visible whenever geometry allows.
- Reflow by local header/container/action classes. Do not add client effects, resize listeners,
  viewport sniffing, text truncation of action labels, new copy or a JavaScript layout controller.
- The language control is an ordinary disclosure, not an ARIA menu button: retain a native button
  with `aria-expanded` and `aria-controls`; remove `aria-haspopup="menu"`, `role="menu"` and
  `role="menuitem"`. Enter, Space or click toggles it while focus remains on the trigger; the next
  Tab reaches the first locale link in DOM order. Escape from the trigger or any option closes the
  disclosure and returns focus to the trigger. Tab order remains brand → language → locale options
  when open → sign in; link activation keeps the existing locale and destination semantics.
- Browser and unit proof must assert the disclosure's closed/open `aria-expanded`, opening keys,
  focus placement, option labels/order/destinations, Tab entry, Escape close/focus return, visible
  focus and activation. The open disclosure stays inside the document.
- Preserve at least 44×44 unscaled CSS-pixel targets, visible focus, forced-colors usability and
  reduced-motion behavior.
- No `overflow-x-hidden`, `clip`, transform/translation, offscreen positioning or equivalent on
  `html`, `body`, the public page, header or action group may be used to conceal geometry.
- Keep `header.tsx`, its unit test and the new E2E spec each strictly under 150 lines.

## Forbidden surfaces, non-goals and stop conditions

Forbidden: `apps/web/src/proxy.ts`; routes, hosts and ready markers; public page content/intake;
anonymous recovery code or storage; auth/session/tenant; schema/RLS/migrations; draft/claim writers;
membership/billing/Paddle; messages/i18n values; dependencies/lockfiles; global CSS or layout;
other headers/portals; dashboard components; UI packages/tokens; CI/workflows; Vercel/provider/
deployment/production configuration; README; AGENTS; broad architecture docs.

Non-goals: public-page redesign; a hamburger or new navigation; wordmark/copy change; locale-set
change; login-flow change; `T-115`–`T-118`; member-dashboard loading; `IDA-UI03b`; `IDA-UI03a2`;
claim conversion; global responsive refactor; or a second product slice.

Stop and return to current authority before mutation beyond the RED collector if the fix needs a
fifth writer path, global CSS/layout, new copy, a new browser/runtime/persistence/privacy/
concurrency/provider/schema/routing/auth/tenancy/billing/state-transition primitive, a new shared
consumer, client effect, hidden interactive content, a new proof environment, an independently
invalidatable proof surface outside the approved matrix, a second same-slice authority addendum or
a second product outcome. Re-size at eight active engineering hours or twelve wall-clock hours
without a PR-ready exact head. After eighteen wall-clock hours, only already-scoped proof,
remediation, merge and closeout may continue; new behavior requires a split or fresh authority.

## Evidence and gates

Focused proof:

```sh
pnpm --filter @interdomestik/web test:unit --run \
  'src/app/[locale]/components/home/header.test.tsx'
# Z620: exact task-owned ephemeral config, neutral ida.*, all 3 engines, sole spec
pnpm --filter @interdomestik/web exec playwright test \
  --config "$IDA_DG25_EPHEMERAL_CONFIG"
# Existing repo projects/collectors; no tracked config mutation
pnpm --filter @interdomestik/web test:e2e -- \
  'e2e/gate/public-header-overflow.spec.ts'
pnpm --filter @interdomestik/web e2e:front-door
pnpm --filter @interdomestik/web test:e2e -- \
  'e2e/public-entry-hero.spec.ts' --project=ks-sq --project=mk-mk
pnpm --filter @interdomestik/web test:e2e -- \
  'e2e/gate/premium-free-start-recovery.spec.ts' \
  'e2e/gate/public-locale-no-js-shell.spec.ts' \
  --project=gate-ks-sq --project=gate-mk-mk
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm check:modularity-guard
pnpm repo:size:check
git diff --check
```

Mandatory Phase C proof: `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`, current-head
CI/E2E/Pilot, Sonar, CodeQL, gitleaks, pnpm audit, repository security, finalizer, and feedback sweep
after reviewer-generating contexts reach terminal state, quiescence, and zero unresolved threads.
Codex Security diff scan is explicitly waived by user instruction; repo-native security remains
mandatory.

Heavy browser/build/CD proof stays on exclusive `interdomestik-z620-staging`; GitHub-hosted Ubuntu
handles lightweight evidence; Mac is control/edit/light-proof only. Before Z620 work, prove at
least 30 GiB disk, 8 GiB available memory, online exclusive label and no conflicting heavy lease.
Before the single necessary exact-main CD, run the cheap exact-environment DNS/IPv4, Vercel auth/
connectivity, health/provenance, canonical-route browser and capacity/tool canary. Do not repeat a
manual full CD when targeted evidence is sufficient.

Senior review: Opus 5 is skipped because the user reported quota exhausted. GPT-5.6 Sol Max R0
rejected the unapproved dashboard-loading candidate for ID collision, incomplete consumer/proof
closure and failure to score this canonical residual after 768.996 seconds. GPT-5.6 Sol Max R1
then rejected this replacement until its cross-browser collection and locale-disclosure semantics
were executable and exact; this consolidated gate incorporates that terminal feedback. Only one
complete exact-artifact same-route disposition may follow this remediation; extending a running
timer must never resubmit the review. Request GitHub Copilot once on the implementation PR and
classify the result; do not duplicate it.

## Rollout, rollback and authority

After exact gate approval, passing receipts, authority PR merge and fresh resolver selection of
only `IDA-UI06a`, implementation still waits for a separately accepted exact runtime receipt.
Normal web rollout may occur only through the repository's existing governed pipeline; this gate
itself grants no deployment or production authority.

Rollback is the exact implementation-merge revert. Trigger on any positive required-case overflow,
hidden/clipped action, target below 44 pixels, inaccessible name/focus/menu, public-flow regression
or failed current-head evidence. There is no data rollback because this slice owns no data, schema,
persistence or provider effect.

On implementation merge, close the exact slice in current program/current tracker and canonical
architecture tracker with reviewed head, merge SHA, gates, reviewer/security/runtime/CD and
rollback disposition. Record that the saved-progress/public-entry UI tree is closed for the
same-account baseline, while `IDA-UI03b`, claim conversion and dashboard modernization remain
separate candidates. A pure docs closeout should use supported skip-CI semantics only after
implementation evidence is complete, while still waiting for required PR checks and any dynamic
CodeQL run. Promote no successor.
