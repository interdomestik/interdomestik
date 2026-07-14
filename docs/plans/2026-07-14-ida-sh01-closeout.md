# IDA-SH01 Closeout - No-JavaScript Locale Shell

Date: 2026-07-14
Authority consumed: `IDA-DG07`
Implementation PR: `#1345`
Implementation head: `bd471c15024ccc541aacb2093b9eb1b8a6396e1d`
Implementation merge/main SHA: `0728c1f8b7f2fc5e38de3b2b8b817bb848d6b6d6`

## Verdict

`IDA-SH01` is complete.

The implementation consumed the only corrective slice promoted by `IDA-DG07`
and restored the server-rendered locale page when JavaScript is unavailable.
This closeout promotes no replacement implementation slice. `IDA-UI01b`
remains preserved and frozen until a fresh current-authority decision explicitly
selects exactly one next governed slice.

## User-Visible Outcome

- The public locale page and ordinary Free Start category fallback are visible
  without JavaScript instead of remaining inside a hidden streaming segment.
- The same server-visible contract is proved for SQ, EN, SR, and MK at the
  approved mobile and desktop widths.
- JavaScript-enabled provider order and behavior remain unchanged.
- Existing public, member, agent, staff, and admin routes and clarity markers
  remain unchanged.

## Implementation And Verification

- Removed only the page-wide fallback-less `Suspense` wrapper from
  `apps/web/src/app/[locale]/_core.entry.tsx`; provider order and implementations
  were preserved.
- Added a real `javaScriptEnabled: false` Playwright gate covering the direct
  Free Start anchor, visible landmarks/categories, hidden-ancestor detection,
  non-empty body, and horizontal overflow across the approved locale/width
  matrix.
- Focused strict-navigation guard and no-JavaScript browser proof passed with
  two tests and zero failures.
- Local `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate` passed.
  The final local full gate passed `144` tests with `10` contract skips and zero
  failures; web coverage passed `2,848` tests with one skip and `84.81%` line
  coverage.
- Current-head PR checks were green before merge, including CI audit/static/unit,
  full PR E2E, Pilot Gate, SonarCloud, CodeQL, gitleaks, pnpm-audit, Dependency
  Review, OSV, Semgrep, commitlint, reviewdog, Vercel status, and
  `pr-finalizer`. The two skipped lanes were not applicable to this change.
- Copilot identified the raw-navigation convention violation in the new gate.
  Commit `bd471c150` replaced it with `gotoApp` and an explicit visible marker;
  the focused proof passed and the review thread was resolved. Final feedback
  intake reported zero blockers.
- Bounded Opus review returned ACCEPT with no blockers. The Sonnet retry was
  recorded as blocked by `reviewer_no_output_timeout`; the unavailable Gemini
  route was not treated as approval.

## Post-Merge Main Health

Post-merge checks for `0728c1f8b7f2fc5e38de3b2b8b817bb848d6b6d6`
are recorded before this closeout merges:

- main CI run `29342830342` passed, including audit, AI eval, static,
  unit/coverage, and the full E2E gate;
- Sonar Main Gate run `29342830061` passed;
- Secret Scan run `29342830175` passed;
- CodeQL runs `29342828582` and `29342828754` passed;
- staging CD run `29342830553` passed its Docker build, Vercel staging
  deployment, and staging release gate. Production evidence, build, deploy, and
  verification jobs were skipped because no production dispatch was requested.

No production workflow dispatch or production-alias change is authorized or
claimed by this closeout.

## No-Touch And Residual Boundary

The slice did not change `apps/web/src/proxy.ts`, route names, auth/session,
tenancy, database/schema/RLS, billing/Paddle, production aliases, public hero
copy or composition, German, flight activation, shared tokens, dashboards, or
the preserved `IDA-UI01b` implementation. It added no storage, mutation,
provider state, analytics event, cookie, or request payload.

Browser proof is representative rather than all-device or assistive-technology
certification. React may retain hidden transitional streaming duplicates after
hydration; assertions remain strict for visible surfaces, so two visible copies
continue to fail.

## Closeout Proof

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm repo:size:check`
- targeted Prettier verification for the closeout files
- worktree-scoped `next-slice.mjs`, expected to return
  `blocked_requires_current_authority` with `activeSlice=null`
