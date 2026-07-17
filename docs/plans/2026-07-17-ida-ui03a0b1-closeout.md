# IDA-UI03a0b1 closeout — neutral OTP truth and recovery

## Outcome

`IDA-UI03a0b1` is complete. The deliberate pricing Continue action now opens a
single neutral email/code boundary. UI and delivered-email copy in SQ, EN, SR
and MK explain that the code confirms the email and opens or creates an account;
they do not claim payment, active membership, claim entitlement, coverage,
benefits or an accepted case.

The active-page flow locks and masks the sent destination, supports Change email,
new-code cooldown and generic recovery, and blocks ordinary duplicate send,
verify and continuation actions. Sensitive state remains in React memory only.
The OTP sender uses content-free telemetry that omits recipient, code, subject,
message id and raw provider errors.

## Authority and merge

- Canonical design authority: `IDA-DG16 v0.4`, SHA-256
  `92598a166b3d68e36591d7a278bbbc85820d823bd4f74b94617a155e3fd0abfc`.
- Promotion PR: `#1367` / merge
  `3d30d145378669367df97094a969d7aeed641fc9`.
- Implementation PR: [#1369](https://github.com/interdomestik/interdomestik/pull/1369).
- Final implementation head: `9561c958f8011222b812a5b9fd625a274b14e4d8`.
- Merge-main SHA: `29de3fd464c07fb5383b10dc3ba74a46141aec7a`.
- No replacement implementation slice is promoted. After this closeout the
  resolver must return `blocked_requires_current_authority` with
  `activeSlice=null`.

## Scope and preserved contracts

The final diff uses exactly 13 production/i18n files, 6 test/spec files and the
separately authorized deterministic `scripts/repo-size-budget.json` metadata
slot. It contains exactly 16 authored focused test blocks, with matrix rows and
assertions kept inside those blocks, and completed within the 3-engineering-day
ceiling. Every new or extracted code file is at most 150 lines. Touched legacy
pricing and email paths are smaller than their base versions.

Supabase Auth remains the repository-declared identity/session system of record,
Better Auth remains the active orchestrator/execution path, and Drizzle adapter
tables are not reclassified. The implementation changes no auth route, provider
option/resource, tenant or default-public provisioning, verifier, rate limit,
session architecture, shared-auth API, schema/RLS/migration, proxy/routing,
Paddle, entitlement, checkout authority, upload, durable draft, claim handoff,
rollout or deployment behavior. `getActiveSubscription` remains the sole
membership-entitlement authority. The owned source/runtime architecture debt
remains open and was not represented as resolved.

## Verification

- `pnpm pr:verify`: PASS on final head; 600/600 web test files, 2,985 tests
  passed / 1 inventoried skip, 85.21% line coverage, RLS/contracts/build/bundle
  proof, 205 PR E2E tests passed / 9 contracted skips and 13 smoke tests passed /
  9 contracted skips.
- `pnpm security:guard`: PASS for the exact 20-file implementation diff.
- Standalone heavy-job-wrapped `pnpm e2e:gate`: PASS after repository doctor;
  205 passed / 9 contracted skips. Earlier competing-build SIGKILL, ENOSPC and
  sandbox Docker timeout receipts are preserved as infrastructure events, not
  product substitutions.
- Focused UI, callback and communications lanes were green, including the
  witnessed Playwright email-mock RED-to-GREEN correction and 12/12 final
  communications tests.
- Browser evidence covered SQ mobile and desktop Chromium, EN Firefox, SR
  WebKit and MK Chromium, plus keyboard/accessible names and focus, mobile,
  200% zoom, WCAG text spacing, reduced motion, forced colors and JavaScript-on /
  JavaScript-off behavior.
- Post-merge `main@29de3fd4` passed CI run `29558327808`, including unit job
  `87815249240` and DB-backed E2E job `87815249223`; Sonar Main Gate
  `29558327817`; CodeQL `29558327225`; and Secret Scan `29558327827`.

## Review disposition

- Copilot raised four actionable findings: email error-description scoping,
  content-free missing-id failure text, provider-throw/raw-error handling and the
  Playwright email-mock condition. All were reproduced or guarded test-first,
  fixed within the approved envelope, replied to with evidence and resolved.
  Its final current-head review covered 20/20 changed files with no new comment.
- The final feedback intake returned `blockerCount:0` with no unresolved review
  thread. Sonar current-head quality gate passed with zero new issues and zero
  hotspots; CodeQL, Semgrep, OSV, gitleaks, pnpm audit and repository security
  checks were green.
- A strict inline-only, hash-bound Opus packet avoided the prior worktree-file
  visibility failure. `claude-opus-4-8` returned a valid final-head PASS receipt
  at `20260717T054539`; it relied only on the inline packet and made no invalid
  filesystem claim. Prior missing/invalid Opus routes remain classified as such.
  Sonnet returned PASS; Gemini was unavailable on quota and Fable was unavailable,
  neither represented as PASS.
- Dependency Review and Supabase Preview were skipped by repository policy for
  this no-manifest/no-schema change. Vercel failed before deployment because the
  private organization is on a Hobby plan; it is classified as non-product
  evidence and not as a product or deployment pass.

## Operational evidence and future direction

Automatic CD run `29558327788` was cancelled before image build or deployment.
Registry login, image metadata/build and every staging/production deployment and
verification step were skipped or zero-step cancelled. No deployment or
production alias change occurred. Rollback remains a normal revert to parent
`175c5f8d439ea68f34b7fd9c2b4828bf2b44ce4c`.

Fresh AI OS observation
`d53ae2953bb16be95f30660107928633558e9d56481c661d29332a572df29bdf`
reported Interdomestik authority current, Brain current and the known advisory
`activeSlice=none` / runtime-not-authorized lifecycle lag; repository resolver
and canonical authority govern. Brain returned only general AGENTS layering and
did not resolve the Supabase/Better Auth mismatch. No token or time saving is
claimed. Unrelated NurseConnect, David and vault drift remains advisory.

## Closeout and next action

The canonical program and tracker consume the sole `IDA-UI03a0b1` promotion.
`IDA-UI03a0b2` remains ordered and unpromoted; `IDA-UI03a1`, `IDA-UI03a2`,
`IDA-UI03b`, `IDA-UI03a0c` and every other follow-on remain outside this child.
A fresh current-authority/design gate and separate child/worktree are required
before any follow-on implementation. Expected resolver state is
`blocked_requires_current_authority`, `activeSlice=null`.
