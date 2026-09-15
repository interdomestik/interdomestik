# Member Case Detail Continuity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents
> available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Continue the case-first member workspace into the mounted claim detail with strong case
identity, a same-locale return, and native navigation among existing progress, evidence, history and
messages while preserving every established case contract.

**Architecture:** Keep `MemberClaimDetailOpsPage` as the mounted orchestration authority. Extract one
client presentation component for the identity header, actions and section navigation; keep action
derivation, message focus/scroll behavior, translated status/tracking values and all claim content in
the parent. Add stable semantic wrappers around existing content rather than adding tabs, navigation
state, data fetching or shared panel APIs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, next-intl navigation and
messages, Tailwind CSS, Radix-based `@interdomestik/ui`, Vitest/Testing Library, Playwright.

**Execution skills:** @superpowers:subagent-driven-development, @superpowers:test-driven-development,
@superpowers:verification-before-completion.

**Design authority:**
`docs/superpowers/specs/2026-09-15-member-case-detail-continuity-design.md`

---

## File map

- Header component/test: identity, same-locale return, existing actions and native links.
- Mounted Ops page/test: existing orchestration/content, semantic targets and reduced-motion focus;
  parent growth is zero.
- Four claims catalogs: seven parity-matched labels.
- Existing Vault-consent gate and detail golden: deterministic and conditional mounted proof.
- Existing E2E resolver/test: exact fail-closed corpus admission.
- Budget, this plan, current program and tracker: capacity/evidence only.

Never edit proxy/routes, the route page, dormant V2, shared panels, auth/tenant/RLS/query/schema,
document lifecycle, billing or deployment.

## Chunk 1: Implement and prove the bounded continuity slice

### Task 1: Freeze approved capacity and helper advice

**Files:**

- Modify: `scripts/repo-size-budget.json`
- Modify: `docs/plans/current-tracker.md`
- Verify: `scripts/ci/repo-size-capacity-schema.test.mjs`
- Verify: `scripts/ci/repo-size-capacity-evaluator.test.mjs`

- [ ] **Step 1: Verify the approved fixed-point allocation**

Confirm 63,000 bytes/4 files: docs 28,500; messages 4,000; source 8,000; tests 22,500.
Existing CI reuse gains exactly 2,000 (resolver 500; test 1,500); budget self-delta is 64,723. Use no
reserve, deletion credit, relaxed limit or unrelated writer.

- [ ] **Step 2: Run the capacity contracts**

Run:

```bash
pnpm repo:size:check
node --test scripts/ci/repo-size-capacity-schema.test.mjs scripts/ci/repo-size-capacity-evaluator.test.mjs
```

Expected: repo budget passes and all 19 capacity tests pass.

- [ ] **Step 3: Collect the required disjoint helper advice**

Record actual Sonnet implementation and Gemini synthetic-test identities, accepted/rejected advice
and no paid fallback in the tracker. Helpers cannot edit or widen scope.

- [ ] **Step 4: Commit capacity and the reviewed plan**

```bash
git add scripts/repo-size-budget.json \
  docs/superpowers/plans/2026-09-15-member-case-detail-continuity.md \
  docs/plans/current-tracker.md
git commit -m "docs: plan member case detail continuity"
```

Expected: commit succeeds; status is clean.

### Task 2: Build the extracted identity and navigation header with TDD

**Files:**

- Create: `apps/web/src/features/member/claims/components/MemberClaimDetailHeader.test.tsx`
- Create: `apps/web/src/features/member/claims/components/MemberClaimDetailHeader.tsx`
- Modify: `apps/web/src/messages/en/claims.json`
- Modify: `apps/web/src/messages/mk/claims.json`
- Modify: `apps/web/src/messages/sq/claims.json`
- Modify: `apps/web/src/messages/sr/claims.json`

- [ ] **Step 1: Add the four catalogs with the same seven leaf keys**

Add this object under `claims.detail` in every locale:

```json
"continuity": {
  "backToWorkspace": "Back to member workspace",
  "caseLabel": "Case",
  "sectionNavigation": "Case sections",
  "progress": "Progress",
  "evidence": "Evidence",
  "history": "History",
  "messages": "Messages"
}
```

Use these reviewed translations, preserving the same keys:

```text
EN: Back to member workspace | Case | Case sections | Progress | Evidence | History | Messages
MK: Назад кон членскиот простор | Случај | Делови од случајот | Напредок | Докази | Хронологија | Пораки
SQ: Kthehu te hapësira e anëtarit | Rasti | Seksionet e rastit | Ecuria | Dëshmitë | Kronologjia | Mesazhet
SR: Nazad u prostor za članove | Slučaj | Odeljci slučaja | Napredak | Dokazi | Hronologija | Poruke
```

- [ ] **Step 2: Write the failing header test**

Mock the locale Link as an anchor and the upload dialog as in the page test. Render long ID
`case-with-a-very-long-reference-123456789`, title `Delayed flight`, status `Evaluation`, upload and
message actions. Assert logical return `href="/member"`; exact title/ID/status; labelled `Case
sections` nav; ordered hrefs `#member-claim-detail-{progress,evidence,history,messaging}`; enabled
message; upload receives the exact ID; message click calls once; upload/back icons are aria-hidden.

- [ ] **Step 3: Run the header test to verify it fails**

```bash
pnpm --filter @interdomestik/web test:unit --run \
  src/features/member/claims/components/MemberClaimDetailHeader.test.tsx
```

Expected: FAIL because `MemberClaimDetailHeader.tsx` does not exist.

- [ ] **Step 4: Implement the minimal header**

Create a client component with this public interface:

```tsx
interface MemberClaimDetailHeaderProps {
  claimId: string;
  title: string;
  status: MemberClaimDetailOpsClaim['status'];
  localizedStatusLabel: string;
  uploadAction?: OpsActionConfig;
  secondaryActions: OpsActionConfig[];
}
```

Use locale-aware `Link` only for `/member`; render exact identity and `OpsStatusBadge`; render the
existing upload and already-bound actions; export one frozen fragment-ID const used by a labelled
list of plain anchors; use solid `Card`, wrap-safe and visible focus-ring classes. Stay below 300
lines; import no data, routing state or shared-panel internals.

- [ ] **Step 5: Run focused header and locale proof**

```bash
pnpm --filter @interdomestik/web test:unit --run \
  src/features/member/claims/components/MemberClaimDetailHeader.test.tsx
pnpm i18n:check
pnpm i18n:purity:check
```

Expected: focused test and both locale checks pass with EN/MK/SQ/SR parity.

- [ ] **Step 6: Commit the extracted header**

```bash
git add apps/web/src/features/member/claims/components/MemberClaimDetailHeader.tsx \
  apps/web/src/features/member/claims/components/MemberClaimDetailHeader.test.tsx \
  apps/web/src/messages/en/claims.json apps/web/src/messages/mk/claims.json \
  apps/web/src/messages/sq/claims.json apps/web/src/messages/sr/claims.json
git commit -m "feat: add member case continuity header"
```

### Task 3: Integrate stable semantic targets and reduced-motion focus with TDD

**Files:**

- Modify: `apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx`
- Modify: `apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.tsx`

- [ ] **Step 1: Add failing integration assertions for target identity and DOM order**

Add seven translation mocks. Render two ordered public notes, running SLA/active trust, accepted
recovery, allowance 1/1/2, one document and a progress note.

Assert the four targets exist once, carry exact IDs and localized accessible names, and appear in the
same order as header links. Use `compareDocumentPosition` to assert the progress summary precedes the
single Case Companion card and the history events retain input order. Add explicit assertions for the
exact ID, `Evaluation`, formatted date, description, amount and currency. Retain progress note, SLA,
support URL, recovery, allowance, both uploads and `allowInternal={false}` checks.

Add an absent-condition assertion using the default fixture:

```tsx
expect(screen.queryByTestId('member-claim-recovery-decision')).not.toBeInTheDocument();
expect(screen.queryByTestId('member-claim-matter-allowance')).not.toBeInTheDocument();
expect(screen.queryByTestId('member-claim-latest-update-note')).not.toBeInTheDocument();
```

- [ ] **Step 2: Add the reduced-motion failing assertion**

Mock `window.matchMedia('(prefers-reduced-motion: reduce)')` with `matches: true`, click the header
message action and assert:

```tsx
expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
expect(screen.getByTestId('member-claim-detail-messaging')).toHaveFocus();
```

Keep the existing default-motion test and its `behavior: 'smooth'` assertion. Restore both DOM and
media mocks in `finally` blocks.

- [ ] **Step 3: Run integration tests to verify red state**

```bash
pnpm --filter @interdomestik/web test:unit --run \
  src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx
```

Expected: FAIL for the missing header/targets and reduced-motion `auto` behavior.

- [ ] **Step 4: Integrate the header and semantic wrappers**

Keep actions, translations, timeline mapping, message ref/callback in the parent. Replace old header
with `MemberClaimDetailHeader`. Use its exported IDs on: a progress section containing only summary
then Case Companion; evidence section; existing message section retaining test ID/ref/tabIndex; and
timeline `aside`. Give each localized label and `scroll-mt-24`; preserve all child props/order; change
no shared panel.

Use this exact motion branch in the existing message action:

```tsx
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
messagingSectionRef.current?.scrollIntoView({
  behavior: reduceMotion ? 'auto' : 'smooth',
  block: 'start',
});
messagingSectionRef.current?.focus();
```

The modified parent must be smaller in bytes than its capacity baseline and remain semantically
equivalent for every existing conditional card.

- [ ] **Step 5: Run focused component and capacity proof**

```bash
pnpm --filter @interdomestik/web test:unit --run \
  src/features/member/claims/components/MemberClaimDetailHeader.test.tsx \
  src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx
pnpm repo:size:check
```

Expected: both files pass and repo-size reports no positive growth for the parent.

- [ ] **Step 6: Commit the mounted integration**

```bash
git add apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.tsx \
  apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx
git commit -m "feat: connect member case detail sections"
```

### Task 4: Prove the actual mounted page and reconcile the E2E fingerprint

**Files:**

- Modify: `apps/web/e2e/gate/member-vault-consent-display.spec.ts`
- Modify: `apps/web/e2e/golden/member-claim-detail-ops.spec.ts`
- Modify: `scripts/ci/main-e2e-reuse.mjs`
- Modify: `scripts/ci/main-e2e-reuse-cli.test.mjs`

- [ ] **Step 1: Extend the deterministic isolated-fixture gate**

Inside `withMemberVaultConsentFixture`, assert the return link resolves to the test project's locale
prefix and the four navigation links target the exact fragments. Before activation, focus each link,
assert it is focused, and assert computed style exposes a non-`none` outline or box shadow. Activate
each link with the keyboard and assert the URL hash plus target visibility. Preserve the existing
consent visibility/security assertions.

Add a second deterministic locale-continuity test in the same isolated fixture. In the KS project,
navigate the same claim through SQ and EN; in the MK project, navigate it through MK and SR. Use
`gotoApp` with `routes.memberClaimDetail(context.claimId, locale)`, assert the locale-specific return
label and exact destination (`/sq/member`, `/en/member`, `/mk/member`, `/sr/member`), and assert all
four locale-specific navigation labels. This gives mounted EN/MK/SQ/SR proof without changing tenant
resolution or adding projects.

For viewports 320×740, 390×844, 768×1024 and 1440×900, assert the header, nav and all four targets
remain within document width. At 200% browser zoom, repeat the 320 CSS-pixel overflow assertion. Set
dark color scheme and verify the solid header is visible. Emulate reduced motion, invoke Send message,
and assert the messages target receives focus. Do not assert computed color values or animation
timing.

- [ ] **Step 2: Strengthen the golden continuity assertion**

When the existing golden claim link is present, additionally assert the return link, exact case ID,
labelled section nav, all four targets, progress-before-Case-Companion order, Ops timeline and
documents. Keep its current safe no-claim logging; deterministic coverage comes from the gate
fixture, not this optional branch.

- [ ] **Step 3: Run the focused mounted tests**

Use the repo's isolated E2E database and standard port 3000. Seed and verify the mandatory contract,
then run the gate file under gate projects and the golden file under its normal projects (which pull
in the setup dependencies). Run these exact commands:

```bash
pnpm --filter @interdomestik/database seed:e2e
pnpm --filter @interdomestik/web exec playwright test \
  e2e/gate/seed-contract.spec.ts --project=gate-ks-sq --project=gate-mk-mk
pnpm --filter @interdomestik/web exec playwright test \
  e2e/gate/member-vault-consent-display.spec.ts --project=gate-ks-sq --project=gate-mk-mk
pnpm --filter @interdomestik/web exec playwright test \
  e2e/golden/member-claim-detail-ops.spec.ts --project=ks-sq --project=mk-mk
```

Expected after adding the second gate test: seed contract passes 8 cases, detail gate passes
4 project cases, and golden continuity passes 2 project cases plus the two setup dependencies. No
golden test is silently excluded by the gate-only `testMatch`.

- [ ] **Step 4: Commit only the E2E corpus**

```bash
git add apps/web/e2e/gate/member-vault-consent-display.spec.ts \
  apps/web/e2e/golden/member-claim-detail-ops.spec.ts
git commit -m "test: cover member case detail continuity"
```

- [ ] **Step 5: Record and admit the exact E2E tree**

Run `git rev-parse HEAD:apps/web/e2e`. Add only that returned 40-character tree SHA to
`E2E_TREE_SHAS`, with comment `Member case detail continuity`. Add a resolver test that supplies the
same literal SHA through the existing dependency fixture and expects `commandChain: true` or the
normalized eligible decision. Do not replace or loosen any existing digest, repository, event,
workflow, project or database check.

- [ ] **Step 6: Run resolver failure/success contracts**

```bash
node --test scripts/ci/main-e2e-reuse-cli.test.mjs
pnpm repo:size:check
```

Expected: the known new tree passes, the existing unknown-tree test still fails closed, and capacity
passes.

- [ ] **Step 7: Commit the exact fingerprint**

```bash
git add scripts/ci/main-e2e-reuse.mjs scripts/ci/main-e2e-reuse-cli.test.mjs
git commit -m "test: admit member detail e2e corpus"
```

### Task 5: Consolidate review and deliver the protected product PR

**Files:**

- Modify: `docs/plans/current-program.md`
- Modify: `docs/plans/current-tracker.md`
- Review: all paths listed in the file map

- [ ] **Step 1: Run the complete focused suite**

```bash
pnpm --filter @interdomestik/web test:unit --run \
  src/features/member/claims/components/MemberClaimDetailHeader.test.tsx \
  src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx
pnpm i18n:check
pnpm i18n:purity:check
node --test scripts/ci/main-e2e-reuse-cli.test.mjs
pnpm plan:audit
pnpm repo:size:check
```

Expected: every command passes without changing tracked files.

- [ ] **Step 2: Obtain fresh independent Astra/high review**

Give the reviewer the exact base `06d90f570d8757764a9fac8124ee924bd3b8aa1f`, reviewed spec,
implementation plan, final diff and focused evidence. Require read-only findings ordered by severity
for mounted authority, contract preservation, native links, localization, accessibility, conditional
states, tests, capacity and E2E resolver safety. Consolidate accepted corrections before final proof;
rerun only affected focused tests.

- [ ] **Step 3: Update canonical evidence**

Record actual helper identities, focused counts, mounted viewport/locale evidence, independent review
disposition and current source/config/environment identity in the tracker. Keep the slice
`in_progress` until protected merge and exact-main health. Run `pnpm plan:audit` and commit:

```bash
git add docs/plans/current-program.md docs/plans/current-tracker.md
git commit -m "docs: record member detail continuity evidence"
```

- [ ] **Step 4: Freeze inputs and run final required proof once**

Confirm clean standard port 3000, isolated E2E database, uploads disabled, adequate disk/jobs,
unchanged `next-env.d.ts`, and no task-owned background process. Then run exactly once for the frozen
source/config/environment:

```bash
pnpm pr:verify
pnpm security:guard
```

Expected: both pass. Do not rerun the included E2E gate for identical inputs.

- [ ] **Step 5: Open and inspect the protected PR**

Push the branch, open one ordinary product PR, and inspect substantive current-head review bodies,
inline findings, annotations and all required checks. Resolve accepted findings before finalizer
execution. Merge only with expected-head protection after required checks are green.

- [ ] **Step 6: Verify exact-main health and clean up**

Fetch protected main, verify the merge SHA and all required exact-main checks including Sonar main
gate, then update the tracker through the normal follow-up authority if required. Stop only
task-owned processes and verify the task worktree is clean. Do not deploy or select the next slice.
