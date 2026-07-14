# IDA-UI01a Closeout - Help-First Public Entry

Date: 2026-07-14
Authority consumed: `IDA-DG05`
Implementation PR: `#1343`
Implementation head: `d58403037e7d9afcc7372846ba1df861f806f4a2`
Implementation merge/main SHA: `2f279fc6042f6be7f4de0c4fd87705d9485e1eee`

## Verdict

`IDA-UI01a` is complete.

The implementation consumed the only slice promoted by `IDA-DG05` and delivered
the approved help-first anonymous public entry on the completed M0-M5
architecture. This closeout promotes no replacement implementation slice.
Expected resolver state is `blocked_requires_current_authority`,
`activeSlice=null` until a fresh current-authority/design gate promotes exactly
one next governed action.

## User-Visible Outcome

- The anonymous public header and above-fold hero now lead with `NDIHMË TANI`
  and the personal question `Çfarë ju ka ndodhur?`.
- Car accident, injury, and property-damage rows are full-row links into the
  existing Free Start intake.
- Flight disruption remains visible and honestly noninteractive as
  `Së shpejti`.
- WhatsApp is presented as asynchronous contact with a distinct diaspora path,
  without a 24/7 or response-time promise.
- Emergency and privacy safeguards remain visible, while annual membership is
  the secondary commercial path.
- Equivalent message contracts are present for SQ, EN, SR, and MK, and the
  settled-member continuation remains intact.

## Verification And Human Disposition

- Focused unit and message proof passed `12` tests; focused public-entry browser
  proof passed `3` tests across the approved locale, mobile, accessibility,
  keyboard, contrast, reduced-motion, and overflow matrix.
- Local `pnpm pr:verify` passed, including `2,848` coverage tests plus one skip,
  `84.81%` aggregate line coverage, `142` full-gate browser tests plus eight
  not-applicable skips, and the `13`-pass PR smoke lane.
- Local `pnpm security:guard` passed, and independent `pnpm e2e:gate` passed
  with `142` passed, eight skipped, and zero failed.
- Current-head PR checks passed before merge: `26` successful, two
  not-applicable skips, and zero failed, including CI, full PR E2E, Pilot Gate,
  SonarCloud, CodeQL, gitleaks, pnpm-audit, Dependency Review, OSV, Semgrep,
  commitlint, reviewdog, and `pr-finalizer`.
- Copilot's one actionable keyboard-focus test comment and the Codex
  reduced-motion test comment were fixed and their threads were resolved before
  merge. SonarCloud reported zero new issues and zero security hotspots.
- Arben Lila approved the Chrome 200% zoom result, provisionally accepted the
  current SQ/EN/SR/MK copy without claiming professional translation
  certification, and accepted the current legal/commercial wording.
- Bounded Fable, Sonnet, Opus, Codex Sol Ultra, Claude frontend-design, and
  user-mediated Gemini findings were reconciled in `IDA-DG05`. The automated
  Gemini provider route remained accurately recorded as capacity-blocked.

## Post-Merge Main Health

Post-merge checks for `2f279fc6042f6be7f4de0c4fd87705d9485e1eee`
are recorded before this closeout merges:

- main CI run `29313368888`;
- Sonar Main Gate run `29313368920` passed;
- Secret Scan run `29313368891` passed;
- CodeQL runs `29313368322` and `29313368268` passed.

CD run `29313368902` completed successfully for staging on run attempt `3`.
The first attempt's staging Docker build was killed with exit `137` /
`ResourceExhausted: cannot allocate memory`. After explicit operator approval,
unused Docker state and six clean, consumed worktrees were removed while dirty
worktrees, volumes, and the active NurseConnect container were preserved. The
staging build then passed in job `87028682936`, and deploy job `87028708924`
passed Vercel deployment, health, build-provenance, and canonical-alias
verification for the merge SHA.

The first staging E2E attempt stopped on `P0.1` because the agent route briefly
returned the not-found marker, while the same account and route passed the
`P0.6` stress matrix later in that run. This was treated as a real blocker and
not hidden. An isolated failed-job retry passed the complete staging release
gate and artifact upload in job `87028682973`; the overall CD conclusion is
`success`. Production evidence, build, deploy, and verification jobs were
correctly skipped because this was a push-to-main staging run, not a version tag
or production workflow dispatch. No production alias changed.

## No-Touch And Residual Boundary

The slice did not change `apps/web/src/proxy.ts`, canonical routes, auth/session,
tenancy, database/schema/RLS, billing/Paddle, production aliases, below-fold
homepage content, shared tokens, role surfaces, or dashboards. It introduced no
new data store, mutation, provider state, or analytics event.

Browser proof is representative rather than assistive-technology or
all-physical-device certification. Current translations remain product-owner
accepted, not professionally certified. German public-journey localization and
all further public, member, agent, staff, or admin UI work require a fresh,
single-slice current-authority/design gate.

## Closeout Proof

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm repo:size:check`
- targeted Prettier verification for the closeout files
- worktree-scoped `next-slice.mjs`, which returned the expected
  `blocked_requires_current_authority` with `activeSlice=null`
