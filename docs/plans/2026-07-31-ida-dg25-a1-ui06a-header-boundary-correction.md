# IDA-DG25-A1 — Header-boundary overflow correction

Status: proposed corrective current-authority gate; no canonical effect or resumed mutation until
exact Arben approval, A1-bound governance/admission evidence, docs-only merge, fresh exact-main
resolver/scorecard proof and an accepted replacement runtime receipt.

Canonical repo path after approval:
`docs/plans/2026-07-31-ida-dg25-a1-ui06a-header-boundary-correction.md`

Gate: `IDA-DG25-A1`

Sole implementation slice retained: `IDA-UI06a`

Classification: Tier 2 product UI/accessibility; corrective acceptance-boundary authority

Base authority merge: `b7f0ec39bd38cd675d45a2538d2a7ae737741aeb`

Runtime authorized: false

Deployment/CD/provider/staging/production authorized: false

## Decision and user value

Keep `IDA-UI06a` as the same single public-header containment outcome. Do not broaden it into a
homepage redesign or edit legacy homepage sections. Correct only the invalid full-document
pass/fail attribution in `IDA-DG25` because fresh implementation evidence proved that the header
and legacy page have independently invalidatable overflow contracts.

The implementation remains responsible for the brand link, ordinary locale disclosure and login
action in the existing public header at SQ/EN/SR/MK × 320/360/390/430 literal CSS-pixel widths,
under CSS zoom 2 plus WCAG text spacing, in Chromium, Firefox and WebKit. Closed and open header
states must remain inside the viewport, the header must not internally scroll, every interactive
target must remain at least 44×44 unscaled CSS pixels, and keyboard/focus/activation behavior must
remain correct. No global or local overflow mask may conceal a defect.

The observed legacy full-document overflow remains an unpromoted public-page accessibility
candidate. This gate assigns it no solution, ID, priority or successor position. Future current
authority must rescore it against all then-current product candidates. This gate does not prescribe
removal, replacement or redesign and does not authorize a second product outcome.

Primary user and business value remain those of `IDA-DG25`: an anonymous or returning person can
reach the canonical brand, language and sign-in functions on a narrow or magnified screen without
header-owned clipping, overlap or unreachable controls. The public intake, anonymous recovery,
saved-progress journeys and downstream routes remain unchanged.

## Exact supersession map

`IDA-DG25` remains historical authority. This A1 gate supersedes only the clauses listed below;
every unlisted `IDA-DG25` clause remains binding.

| `IDA-DG25` clause | A1 replacement |
| --- | --- |
| Outcome/value language requiring the header to make the entire document stop scrolling | Header-owned geometry, targets, hit reachability and disclosure behavior must pass; stressed legacy document overflow is mandatory diagnostic evidence, not UI06a pass/fail. |
| A3 attribution that treated the first visible header seam as the sole 760px document contributor | A3 remains the pre-change header-edge baseline only; fresh exhaustive current-header subtree geometry separates header violations from other document contributors. |
| UI/UX metric `documentElement.scrollWidth - clientWidth`, baseline `440`, target `0` | Metric is maximum header-owned violation in CSS pixels: `max(0, -header.left, header.right-innerWidth, header.scrollWidth-header.clientWidth, each-action edge violation, each normalized 44px deficit)`. A3 header-right baseline is `760.28125-320=440.28125`; target `0`; lower is better. |
| Acceptance table row and collector text requiring zero stressed full-document overflow | Require zero header-owned violation throughout the exact stress matrix. Require zero full-document overflow on the normal unzoomed 320/390/1440 no-regression frames where the current baseline is green. Record mandatory stressed root geometry and exhaustive header-subtree offender evidence without hiding legacy overflow. |
| Requirement that both header and document `scrollWidth <= clientWidth` under every stress case | Retain header `scrollWidth <= clientWidth`; replace the stressed document assertion with mandatory root telemetry plus exhaustive proof that no header-subtree box/scroll/hit target violates the viewport. |
| Closeout/rollback language treating all root overflow as UI06a regression | UI06a rollback triggers are the header-boundary, target, overlap/hit, disclosure/focus, public-flow and exact-head failures defined below. Legacy page findings remain separately unpromoted. |
| Business-value, selection and closeout claims that `IDA-UI06a` is the sole remaining UI-tree defect or closes the complete saved-progress/public-entry UI tree | `IDA-UI06a` closes only the public-header seam. The legacy public-page overflow signal remains unpromoted; no tree-wide closure, member-dashboard ordering or successor claim is authorized. |

The original contract graph, four runtime writers, user journeys, three-engine matrix, protected
surfaces, ordinary-disclosure semantics, no-mask rule, Phase C gates, cleanup obligations, stop
conditions and time ceilings remain binding except where the table above expressly corrects the
measurement boundary.

## Evidence and honest limits

Fresh exact-environment contradiction evidence is bound by SHA-256
`35df3e91298348e05f2e9d0554e9a9f7bdc66564b123ae71e371c02510339c1b` at
`/Users/arbenlila/.codex/task-artifacts/019fa824-2676-7c22-9dcb-d21af1c354e6/ida-ui06a/ui06a-authority-contradiction-r1.json`.
The diagnostic Chromium report is bound by SHA-256
`d5079a18697399a630c60e0d843e97c3926c94e496c468d039ba95e0fcc6e6f7`.

At neutral `http://ida.127.0.0.1.nip.io:3108/sq`, literal `innerWidth=320`, CSS
`zoom=2`, required text spacing, forced colors and reduced motion, the diagnostic observed:

- closed header: box `left=0`, `right=320`; `clientWidth=160`, `scrollWidth=160`; actions inside
  the viewport;
- open header: box `left=0`, `right=320`; `clientWidth=160`, `scrollWidth=160`; locale options
  `left=2`, `right=206`; actions inside the viewport;
- document: `clientWidth=320`, `scrollWidth=514`, with legacy decorative elements, later sections,
  pricing/membership cards and stressed headings among the recorded contributors.

This R1 diagnostic is contradiction-only evidence. It covers only Chromium/SQ/320, measured the
closed/open header before its later font/two-frame wait, did not normalize target dimensions for
zoom, and does not bind a clean implementation commit. It proves that the canonical stop condition
was necessary; it is not final GREEN acceptance and none of its pass assertions may be reused as
merge evidence.

Failure classification is `workflow_gate`, safe code
`FULL_DOCUMENT_LEGACY_OVERFLOW_OUTSIDE_WRITER_MAP`. `IDA-DG25` required stressed root geometry to
pass while forbidding every source path that owns the other contributors. Satisfying both clauses
would require unauthorized masking or broad page mutation. The stop condition therefore fired
correctly. This classification does not waive either the current header defect or the separately
observed legacy-page accessibility signal.

## Authority PR contract

The corrective docs-only authority PR has exactly three writers:

1. `docs/plans/2026-07-31-ida-dg25-a1-ui06a-header-boundary-correction.md`
2. `docs/plans/current-program.md`
3. `docs/plans/current-tracker.md`

`current-program.md` must append one superseding current-authority revision that names A1's exact
bytes/hash/approval and corrected metric, retains exactly `IDA-UI06a`, sets
`runtime_authorized:false`, and expects fresh resolver `ready` with exactly
`activeSlice.id=IDA-UI06a`. `current-tracker.md` must retain `IDA-DG25` as historical, add an
`IDA-DG25-A1` authority row, and supersede both active UI06a tracker/scorecard statements so they
reference the A1 hash, A1 UI/UX/admission receipts and header-owned acceptance rather than the old
full-document claim. No other row or slice may be promoted.

Before merge, require exact candidate bytes/hash and genuine Arben approval; a fresh schema-v1
UI/UX receipt and governance check bound to `IDA-DG25-A1`, this exact hash and the corrected numeric
metric; fresh slice admission bound to the same authority; formatting/diff/scope checks; current
GPT-5.6 Sol Max review with no blocker or major finding; repository PR checks and required review.
The mandatory Phase C contract remains required for the authority PR:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

After merge, refresh/check AI OS and run the exact-main resolver and scorecard. Expected repository
state is resolver `ready`, exactly `activeSlice.id=IDA-UI06a`,
`activeSlice.runtimeAuthorized=false`, and corrected scorecard `pass`. AI OS/Brain is advisory. A
known `DIRECT_REFRESH_BYPASS_DISABLED` result is recorded honestly and does not override current
repository authority when canonical resolver/scorecard identity is exact; any repository-authority
identity/hash mismatch, ambiguous active slice or other fail-closed AI OS authority conflict stops
runtime receipt issuance.

Authority-PR rollback is the exact docs-only merge revert plus a fresh resolver/scorecard check.
Reverting A1 does not reactivate or validate runtime receipt R1. This authority PR permits no CD,
runner build, provider contact, Vercel deploy, staging alias change or production action. If an
automatic CD starts, contain it and prove the exact checkout/registry/image/provider/deploy state.

## Replacement runtime receipt and checkpoint preservation

The previously accepted `IDA-UI06a-RUNTIME-R1` receipt is permanently superseded for all future
mutation and merge authority. It remains historical evidence only.

After A1 merge and exact resolver/scorecard proof, inspect the existing implementation branch and
worktree read-only. Create a content-addressed checkpoint manifest binding its exact branch,
worktree, status, current base, modified/untracked paths and SHA-256 for every dirty implementation
file. The accepted `IDA-UI06a-RUNTIME-R2` receipt must bind that manifest, the A1 hash, the new
exact-main base, the same four runtime writers, all forbidden paths, task identity, one writer and
the same worktree. Its first authorized mutation is controlled preservation/rebase of those exact
checkpoint bytes onto the A1 merge. Any byte/path mismatch stops rather than stashing, committing,
discarding or reconstructing evidence outside R2.

After rebase, rerun all final GREEN unit, browser and build evidence on the exact implementation
head. No pre-A1 build, R1 diagnostic, stale source result or partial-context review is merge proof.

## Corrected implementation writer and proof boundary

The exact runtime writer map remains unchanged:

1. `apps/web/src/app/[locale]/components/home/header.tsx`
2. `apps/web/src/app/[locale]/components/home/header.test.tsx`
3. `apps/web/e2e/gate/public-header-overflow.spec.ts`
4. `scripts/repo-size-budget.json` only through the deterministic size-sync command

The focused collector must use one task-owned ephemeral Playwright config outside the repository,
the neutral `http://ida.127.0.0.1.nip.io:<task-port>/<locale>` origin, actual
Chromium/Firefox/WebKit, zero retries, the sole tracked spec, no inherited tenant/`Host`/
`x-forwarded-host` headers, the exact implementation head and the established Z620 thresholds.

Build once outside Playwright with the exact canonical DB wrapper and requested public environment
stamp. Use a cheap external dev-server canary to diagnose geometry before the final production
build; the canary never counts as final acceptance. Do not allow Playwright's 300-second webServer
timeout to own a necessary production rebuild.

For every locale and stress width, stabilize fonts and two animation frames before each closed and
open measurement, then assert:

- literal viewport/media identity, CSS zoom 2, WCAG text spacing, forced colors and reduced motion;
- header bounding `left >= 0`, `right <= innerWidth` and own `scrollWidth <= clientWidth`;
- every brand/trigger/option/login rectangle is inside the viewport in its visible state;
- every visible action has unscaled `offsetWidth >= 44` and `offsetHeight >= 44`, or an equivalent
  rendered size divided by a measured effective zoom; both axes are required and raw post-zoom
  `getBoundingClientRect() >= 44` alone is forbidden;
- visible action rectangles do not overlap in two dimensions, and each center point resolves by
  hit testing to that action or its descendant;
- brand, locale and login names/destinations/DOM order remain exact;
- native locale button has `aria-expanded` and `aria-controls`, with no `aria-haspopup`,
  `role=menu` or `role=menuitem`;
- Enter, Space and click open while trigger focus remains; the next Tab focuses the first option;
  Escape from trigger or any option closes and restores trigger focus; visible focus and actual
  link/button activation are proven;
- no header/header-subtree box, internal scroll or hit target violates the viewport;
- mandatory root `clientWidth`/`scrollWidth` and exhaustive header-subtree offender telemetry is
  recorded for every stress case without deleting, hiding or filtering other page nodes;
- computed styles and a separate diff/scope audit prove no overflow masking, clipping,
  transform/translation concealment or offscreen positioning on root/body/page/header/action group.

Require zero full-document overflow on normal unzoomed 320/390/1440 frames where the baseline is
green. The collector must not inject a header-only stylesheet, replace the real header, enlarge the
viewport, hard-code expected geometry or use screenshots alone. Keep `header.tsx`, its unit test
and the tracked E2E spec each under 150 lines; simplify or decompose only within the existing writer
map and stop if a fifth runtime path becomes necessary.

Retain focused public-entry, locale/no-JS, front-door-session and saved-progress recovery proof.
Stage only the four intended runtime writers before repo-size sync. The complete risk-tier and
Phase C gates, exact-head CI/Sonar/CodeQL/gitleaks/audit/security, reviewer feedback, finalizer,
mergeability and zero unresolved threads remain mandatory. Codex Security diff scan remains
explicitly user-waived; repo-native security is not waived.

## Preserved semantics and forbidden surfaces

Preserve the dark header, shield, visible wordmark whenever geometry permits, localized sign-in
text, SQ/EN/SR/MK set, canonical destinations, visible focus, forced colors, reduced motion and the
ordinary-disclosure contract above. Preserve canonical routes, every `*-page-ready` marker, public
content/intake, anonymous recovery, saved-progress continuity and every completed slice.

Forbidden surfaces remain unchanged: `apps/web/src/proxy.ts`; routes/hosts/ready markers; public
page content and legacy homepage sections; anonymous storage/recovery; auth/session/tenancy;
schema/RLS/migrations; membership/billing/Paddle; draft/claim writers; messages/i18n values;
dependencies/lockfiles; global CSS/layout; shared UI tokens; other headers; CI/workflows;
Vercel/provider; deployment/production configuration; README; AGENTS; and broad architecture docs.

No `overflow-x-hidden`, `overflow-hidden`, `clip`, transform/translation, offscreen positioning or
equivalent concealment may be added to `html`, `body`, the public page, header or action group.
Local absolute disclosure positioning is permitted only when the full matrix proves every option
inside the viewport, reachable and non-overlapping, with no header internal scroll.

## Rollback, cleanup and stop conditions

Implementation rollback is the exact implementation merge revert. Trigger rollback or block merge
on any positive header-owned violation, normalized sub-44 target, overlapping/unreachable action,
disclosure/focus/activation regression, normal-presentation root overflow regression, public-flow
regression, protected-surface mutation or failed/stale exact-head evidence. No data, schema,
billing, auth, provider or production-data rollback is needed.

Preserve the original stop conditions. Stop and return to current authority before any mutation
that needs a fifth runtime writer, global CSS/layout, new copy, a new browser/runtime/persistence/
privacy/concurrency/provider/schema/routing/auth/tenancy/billing/state-transition primitive, a new
shared consumer, client effect, hidden interactive content, a new proof environment, an
independently invalidatable proof surface outside the approved matrix, another authority addendum
or a second product outcome. Re-size at eight active engineering hours or twelve wall-clock hours;
after eighteen wall-clock hours only already-scoped proof, remediation, merge and closeout may
continue.

At closeout, bind and move the exact task-owned Playwright configs, diagnostic driver/reports,
temporary Z620 checkout and other recoverable evidence artifacts through the skill cleanup receipt;
delete only exact merged branches/worktrees after identity and cleanliness checks. Preserve
unrelated stashes, branches, worktrees and user changes.

After `IDA-UI06a` closes, no successor is automatically promoted. The resolver may correctly
return `blocked_requires_current_authority`, `activeSlice=null`. The next valid action is a fresh
current-authority scoring pass across all then-current product candidates, including—but not
preselecting—the observed legacy public-page overflow signal.

This correction preserves one slice and its evidence checkpoints. It does not reopen completed
work, weaken header accessibility, authorize deployment/production or start a second slice.
