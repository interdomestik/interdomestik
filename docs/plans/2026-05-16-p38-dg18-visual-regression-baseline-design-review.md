# P38-DG18 Visual Regression Baseline Design Review

Status: review_draft
Slice: `P38-DG18`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-16
Authority: review draft. This document does not promote an implementation slice until approved.
Recommended implementation slice: `P38-CRM21 Visual Regression Baseline Infrastructure`
Promoted implementation slice: pending review

Status vocabulary: `review_draft` records a design awaiting reviewer approval; `complete` records an
approved design gate that may promote exactly one implementation slice. Tracker queue statuses remain
the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`; this design uses
`deferred` only as prose for non-promoted candidates, not as a tracker status.

## Status / Predecessor Closeout

`P38-CRM22 Forecast Snapshot Alerting` is complete through PR `#778`, merge commit
`7ad9aa8b528b6a25fc47875c23ca8c06350d2a5c`. The closeout sync landed through PR `#780`, merge
commit `7c525d13e682013654d3f57440f4e6fdaced8bcd`, and recorded the Notion proof page at
`https://www.notion.so/361036cff1f881879272c84b09d5dbf1`.

The CRM reporting and snapshot operations line now has:

- CRM05 reporting read-models and append-only forecast snapshot persistence.
- CRM12, CRM14, and CRM15 reporting UI across agent, admin, and staff surfaces.
- CRM16 supplemental CRM reporting charts with reduced-motion discipline.
- CRM20 branch-manager `/admin/crm` reporting split.
- CRM13 protected daily forecast snapshot scheduling.
- CRM18 admin-only forecast snapshot observability.
- CRM17 protected tenant-scoped forecast snapshot backfill.
- CRM19 admin-only dry-run-first backfill operator UX.
- CRM22 admin-only forecast snapshot alerting.

The remaining gap before more UI-heavy CRM work is visual proof. The CRM reporting surfaces now carry
tables, charts, branch-manager variants, observability, operator controls, and alert bands, but the
repo still has only an old quarantined claims visual spec and Darwin snapshots. CRM21 should establish
a bounded, Linux/Chromium CRM visual baseline workflow without changing product behavior.

## CI-Parity Tooling Status

The repo now has local CI-parity Docker tooling:

- `pnpm ci:local:quick`, `pnpm ci:local:pr`, and `pnpm ci:local:full` call
  `scripts/ci-local-parity.sh`.
- `docker-compose.yml` defines the `ci-parity` service under the `ci-local` profile.
- `docker/Dockerfile.ci-parity` uses Node 24 Bookworm and installs Chromium dependencies through
  Playwright `1.60.0`.

CRM21 should use this Linux substrate for committed baseline generation whenever possible. The repo
does not yet expose a first-class visual snapshot regeneration mode in `scripts/ci-local-parity.sh`;
the CRM21 implementation must add or document one narrow command for generating
`@crm-visual-baseline` snapshots inside `ci-parity`. If an operator cannot use `ci-parity`, the PR
must state the Linux substrate used and accept that reviewers may require regeneration on the
CI-parity runner before approval.

## Decision

Recommend exactly one bounded implementation candidate:

`P38-CRM21 Visual Regression Baseline Infrastructure`

The recommended slice adds an opt-in CRM visual baseline lane for existing CRM reporting surfaces. It
should standardize screenshot naming, snapshot storage, deterministic waits, dynamic masking, and a
narrow verification command. It must not redesign UI, add new routes, alter CRM route-core contracts,
or add visual checks to required merge gates in the first slice.

DG18 approval would permit a later implementation PR to update `docs/plans/current-program.md`,
`docs/plans/current-tracker.md`, and proof metadata for `P38-DG18` / `P38-CRM21`.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                   |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1    | `P38-CRM21 Visual Regression Baseline`             | Recommend. Reporting/ops UI is now broad enough to need deterministic visual proof.        |
| 2    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Valuable domain work, but less protective before the next CRM UI/admin slices.      |
| 3    | `P38-CRM09 Routing Admin UX And Rule Management`   | Defer. Requires CRM08 persistence first and would benefit from visual baseline discipline. |
| 4    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader confidence and explicit retirement proof.                |
| 5    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                     |

## Source Inputs

- `P38-DG12 Reporting Charting Foundation Design Review`, which reserved CRM21 after charting
  standardization.
- `P38-DG13 Admin Reporting Branch-Manager Surface`, which made `/admin/crm` role-variant visual
  proof necessary.
- `P38-DG17 Forecast Snapshot Alerting Design Review`, which left CRM21 as the top deferred
  infrastructure slice after CRM22.
- `docs/plans/current-program.md` and `docs/plans/current-tracker.md`, which record CRM21 as
  reserved and CRM22 as completed.
- `apps/web/playwright.config.ts`, which already sets `snapshotDir: './e2e/snapshots'`,
  `toHaveScreenshot.maxDiffPixelRatio = 0.1`, and reduced-motion browser context defaults.
- `apps/web/e2e/visual/claims-dashboard.visual.spec.ts`, the existing quarantined visual test with
  non-CRM Darwin snapshots.
- `apps/web/e2e/gate/admin-crm-reporting.spec.ts`, which proves existing admin and branch-manager
  CRM markers for screenshot waits.
- Existing CRM page-ready markers:
  - `agent-crm-page-ready`
  - `admin-crm-page-ready`
  - `staff-crm-page-ready`

## Implementation Scope For P38-CRM21

Allowed:

- Add a focused CRM visual baseline spec at `apps/web/e2e/visual/crm-reporting.visual.spec.ts`.
- Add small visual-test helper code under `apps/web/e2e/visual/` if it avoids duplicated waits,
  masking, viewport setup, or screenshot naming.
- Add a dedicated Playwright project named `crm-visual` or an equivalent narrow visual command that
  runs only CRM visual baseline tests tagged `@crm-visual-baseline`.
- Add a package script such as `e2e:crm:visual` in `apps/web/package.json`; add a root script only if
  the implementation needs a stable workspace-level command.
- Commit Linux/Chromium CRM visual snapshots under
  `apps/web/e2e/snapshots/visual/crm-reporting.visual.spec.ts-snapshots/`.
- Use existing login fixtures, seeded tenant data, canonical routes, and page-ready markers.
- Mask dynamic user/session content and any volatile timestamp/run-id regions before screenshot
  comparison.
- Update `scripts/repo-size-budget.json` only for the measured snapshot/docs delta if
  `pnpm repo:size:check` requires it.
- Update tracker/program proof only after this review draft is approved and the implementation PR is
  opened.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names, route authority, auth/session layering, or tenant isolation architecture.
- Schema/migrations, RLS policies, snapshot table shape, run-ledger tables, or seed data shape.
- Scheduler behavior, Vercel cron config, CRM17 public API contract, CRM19 backfill action semantics,
  alert rules, external notifications, queue workers, or all-tenant fleet work.
- Product UI layout, chart behavior, copy, route-core output shapes, business data derivation, or CRM
  authorization logic.
- Existing `apps/web/e2e/visual/claims-dashboard.visual.spec.ts` quarantine status or its existing
  Darwin snapshots.
- Required PR merge gates, Vercel deployment behavior, README, AGENTS.md, Stripe, or broad
  architecture docs.

## Visual Baseline Contract

CRM21 should create a visual baseline lane with constants in
`apps/web/e2e/visual/crm-visual-baseline.constants.ts`:

```ts
export const CRM_VISUAL_BASELINE_TAG = '@crm-visual-baseline';

export const CRM_VISUAL_BASELINE_MARKERS = [
  'agent-crm-page-ready',
  'admin-crm-page-ready',
  'staff-crm-page-ready',
] as const;

export type CrmVisualBaselineMarker = (typeof CRM_VISUAL_BASELINE_MARKERS)[number];
```

The first baseline matrix is intentionally small:

| Surface                   | Route        | Role             | Tenant/locale lane | Required marker                                    |
| ------------------------- | ------------ | ---------------- | ------------------ | -------------------------------------------------- |
| Agent CRM reporting       | `/agent/crm` | `agent`          | `gate-ks-sq`       | `agent-crm-page-ready`                             |
| Admin CRM reporting + ops | `/admin/crm` | `admin`          | `gate-ks-sq`       | `admin-crm-page-ready`                             |
| Admin CRM branch-manager  | `/admin/crm` | `branch_manager` | `gate-ks-sq`       | `admin-crm-page-ready` plus branch-manager markers |
| Staff CRM reporting       | `/staff/crm` | `staff`          | `gate-mk-mk`       | `staff-crm-page-ready`                             |

The cross-tenant split is deliberate: `gate-ks-sq` covers the Albanian/Kosovo tenant for agent and
admin role variants, and `gate-mk-mk` covers the Macedonian staff lane. The first slice should not
attempt all locales, all roles, all viewport sizes, or all dashboard states.

Tenant/project slugs are part of the baseline contract. `gate-ks-sq` and `gate-mk-mk` are expected
to remain stable across CI seed resets; any future slug rename, project rename, or snapshot suffix
change requires a coordinated baseline regeneration PR.

The branch-manager row depends on the deterministic E2E fixture user
`E2E_USERS.KS_BRANCH_MANAGER`, currently scoped to `tenant_ks` and `ks_branch_a`. CRM21 tests must
assert or rely on that explicit fixture rather than selecting the first available branch, so
branch-manager screenshots remain stable across seed ordering changes.

The first viewport is desktop Chromium only. Recommended dimensions are `1280 x 900`, using the
existing Playwright `Desktop Chrome` device as the base with explicit viewport override if needed.
The rationale is pragmatic rather than analytics-derived: `1280 x 900` captures the dense admin CRM
bands and chart/table rows on a common laptop-class desktop width without using a wide monitor that
would hide layout pressure. Mobile and tablet visual baselines require a later slice after the
desktop lane proves stable.

## Snapshot Naming And Storage

CRM21 must not reuse or rewrite the existing claims visual snapshots. New snapshots should be grouped
by spec:

```text
apps/web/e2e/snapshots/visual/crm-reporting.visual.spec.ts-snapshots/
```

Recommended screenshot names:

```text
agent-crm-reporting.png
admin-crm-reporting.png
admin-crm-branch-manager-reporting.png
staff-crm-reporting.png
```

The committed baseline must be generated on Linux/Chromium, preferably through the CI-parity Docker
workflow or the same Linux runner shape used by CI. CRM21 should not commit `*-darwin.png` CRM
snapshots. If local development on macOS produces Darwin snapshots, they are review artifacts only
and must not be committed.

The visual command should use a narrow selector:

```bash
pnpm --filter @interdomestik/web test:e2e -- --project=crm-visual --grep '@crm-visual-baseline'
```

Baseline creation should be explicit:

```bash
pnpm --filter @interdomestik/web test:e2e -- --project=crm-visual --grep '@crm-visual-baseline' --update-snapshots
```

Baseline regeneration policy:

- Baseline updates are PR-gated. CI must not auto-commit or auto-update snapshots.
- The PR author runs the approved `--update-snapshots` command and commits the resulting Linux
  snapshots.
- The PR description must include a one-line justification for each added or updated baseline PNG.
- The reviewer must render every added or updated PNG locally or from CI artifacts and acknowledge
  that the visual change is intentional; binary diffs alone are not reviewable enough.

## Determinism Rules

CRM21 visual tests must:

- use `gotoApp` and canonical locale-aware routes;
- wait for the route-specific page-ready marker before screenshots;
- wait for fonts with `await page.evaluate(() => document.fonts.ready.then(() => true))` inside the
  helper, then perform any page-stability wait through the helper rather than ad hoc sleeps;
- use reduced-motion context already configured in Playwright;
- avoid `networkidle` as the only readiness signal;
- mask `[data-testid="user-nav-email"]` and any visible account/session identifiers;
- mask timestamp/run-id regions in CRM18/CRM19/CRM22 bands when they cannot be stabilized by seeded
  data;
- capture `fullPage: true` only if the full route is stable; otherwise capture the page-ready region
  locator with a fixed viewport;
- keep `maxDiffPixelRatio` no looser than the existing global `0.1`; recommended first-slice target
  is `0.02` for CRM screenshots if CI-parity proves stable.

Volatile-region handling should follow this priority:

1. First, prefer deterministic seeded values or fixed test-time inputs.
2. Second, mask the volatile region with a Playwright `mask` selector.
3. Third, capture a narrower locator that excludes the volatile band.

Failed visual runs in CI must upload enough artifacts for remote diagnosis. Existing PR E2E already
uploads `apps/web/playwright-report` and `apps/web/test-results`; any CRM21 visual CI invocation must
reuse those paths or an equivalent artifact upload that includes expected, actual, and diff PNGs.

The implementation should add one helper at
`apps/web/e2e/visual/crm-visual-baseline.helper.ts`, such as:

```ts
export async function expectCrmVisualBaseline(
  page: Page,
  marker: CrmVisualBaselineMarker,
  screenshotName: string
): Promise<void>;
```

The helper should centralize marker waits, masks, viewport assumptions, and screenshot comparison
options. Tests should call the helper rather than duplicating screenshot configuration per role.

## Playwright Project Contract

If a new Playwright project is added, it should be named `crm-visual` and scoped to
`e2e/visual/crm-reporting.visual.spec.ts`. It should use the existing tenant base URL helpers, storage
state, and forwarded-host discipline rather than inventing a parallel launcher.

The `crm-visual` project should set a deterministic desktop viewport and visual retries explicitly.
Recommended first-slice policy is `retries: process.env.CI ? 1 : 0`, so a single noisy PNG comparison
does not fail an opt-in CI run while local runs still fail immediately.

The project must be opt-in for CRM21. It should not be included in `pnpm e2e:gate`, `pnpm pr:verify`,
`pnpm verify-slice -- --required-gates`, or merge gate defaults until a later gate promotes visual
baselines to required CI. CRM21 proves the command and committed baseline, not mandatory enforcement
across every PR.

If adding a project would create more config churn than value, the implementation may instead add a
narrow script that invokes the existing `gate-ks-sq` / `gate-mk-mk` projects with the
`@crm-visual-baseline` tag. Reviewers should reject any approach that makes quarantined or unrelated
visual tests run as part of the CRM21 command.

CRM21 must not bump `@playwright/test` or the Playwright browser major/minor version. Any future
Playwright major/minor bump requires a coordinated baseline regeneration PR because PNG output is
browser-version sensitive.

## Privacy And PII Rules

CRM21 screenshots are artifacts and must be treated as user-visible output. The committed snapshots
must not expose:

- raw email addresses, phone numbers, names, member identifiers, lead identifiers, deal identifiers,
  account identifiers, branch IDs, pipeline IDs, run IDs, request IDs, or free-text descriptions;
- authorization headers, secrets, request bodies, SQL errors, stack traces, `CRON_SECRET`, or
  `CRM_BACKFILL_CONFIRMATION_SECRET`;
- tenant-internal values that are not already safe aggregate UI copy.

Snapshot review should verify the image content manually in addition to test code. If a seeded user
email or volatile value appears in a snapshot, the implementation must add a mask or reduce the
captured region before approval.

`[data-testid="user-nav-email"]` is a visual-baseline mask contract. Renaming or removing it requires
a coordinated PR that updates the CRM visual mask selector and proves the new selector still masks
session identity.

## Acceptance Criteria

- `P38-CRM21` adds a dedicated CRM visual baseline spec or command tagged `@crm-visual-baseline`.
- The command captures exactly the approved first matrix: agent CRM, admin CRM, admin branch-manager
  CRM, and staff CRM.
- Screenshots wait on existing page-ready markers and do not weaken marker semantics.
- The lane is opt-in and is not added to required merge gates in the first slice.
- New CRM screenshots are committed as Linux/Chromium baselines, not Darwin baselines.
- Dynamic session/user content and volatile timestamps/run IDs are masked or excluded.
- Existing claims visual quarantine files and snapshots remain unchanged.
- No product UI, route-core, auth, tenancy, schema, scheduler, alerting, or backfill behavior changes
  are introduced.
- Repo-size budget is updated in the same PR if `pnpm repo:size:check` fails or the total committed
  PNG snapshot delta exceeds `50 KiB`; smaller passing deltas may leave the budget unchanged.
- Focused verification and scope audit pass with forbidden paths enforced.
- The PR includes manual-render acknowledgement for every added or updated baseline PNG.

## Coverage Discipline

Implementation proof should include:

- a visual test for each row in the first baseline matrix;
- a helper/unit or static test only if helper behavior is non-trivial;
- an E2E contract check proving the CRM visual spec is not marked `@quarantine` or `@legacy`;
- a repo-size check showing the snapshot delta is intentional;
- a scope audit that forbids product UI and route-core changes unless the approved implementation
  explicitly names a narrow exception;
- manual snapshot inspection recorded in PR notes, covering both visual intent and PII/volatile value
  masking.

The first slice does not need screenshot baselines for mobile, dark mode, every locale, every admin
severity state, every empty state, or historical CRM dashboards.

## Risks And Open Questions

- **Snapshot churn.** Browser, font, OS, and rendering differences can create noisy diffs. Mitigation:
  commit only Linux/Chromium snapshots and prefer CI-parity generation.
- **PII in images.** Screenshots can leak seeded account/session content. Mitigation: mask user nav
  and inspect committed images manually.
- **Volatile operational bands.** CRM18/CRM19/CRM22 timestamps and run IDs may change. Mitigation:
  mask volatile regions or capture stable subregions.
- **Repo-size growth.** PNG baselines are large compared with docs/tests. Mitigation: first matrix is
  four desktop screenshots only and repo-size budget must be explicit.
- **False confidence.** A small baseline does not prove every responsive state. Mitigation: record
  desktop-only scope and defer mobile/tablet expansion.
- **Gate instability.** Required visual gates can become flaky before the lane is proven. Mitigation:
  keep CRM21 opt-in in the first slice.

## Dependency / Sequencing

CRM21 depends on the completed CRM reporting UI and operations surfaces: CRM12, CRM14, CRM15, CRM16,
CRM20, CRM18, CRM19, and CRM22. It should land before CRM09 routing admin UX and other UI-heavy CRM
work so that future UI changes have a stable visual baseline.

CRM08 routing persistence can proceed independently from a domain perspective, but CRM21 is the
recommended next slice because it reduces visual regression risk before the next admin-facing CRM
workflow.

## Review Questions

1. Should CRM21 be the next promoted implementation slice instead of CRM08?
   - Author recommendation: yes. The CRM reporting/ops UI is now broad enough that visual proof
     should be established before more UI work.

2. Should the first visual lane be opt-in rather than a required merge gate?
   - Author recommendation: yes. Prove deterministic Linux/Chromium baselines first, then promote
     enforcement later if stable.

3. Is the first matrix sufficient?
   - Author recommendation: yes. Agent, admin, branch-manager admin, and staff cover the current CRM
     reporting role variants without exploding locale or viewport scope.

4. Should the implementation unquarantine the existing claims visual spec?
   - Author recommendation: no. Claims visual debt is separate and should not be folded into CRM21.

5. Should the implementation alter product UI or add new test IDs if screenshots are hard to mask?
   - Author recommendation: no for the first slice. Prefer existing markers and Playwright masks;
     bring any required UI-testability exception back for review.

6. Should CRM21 require CI-parity Docker for baseline generation?
   - Author recommendation: yes, use the existing `ci-parity` Docker substrate for committed
     baselines when available. CRM21 may add a narrow visual-regeneration command but should not
     broaden Docker infrastructure.

## Verification Plan

Draft-review PR verification:

```bash
git diff --check
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
pnpm repo:size:check
pnpm verify-slice -- --static
```

The draft-review PR should also run `interdomestik_qa.scope_audit` with allowed paths limited to this
design document and, if required by repo-size audit, `scripts/repo-size-budget.json`.

Implementation PR verification after approval:

```bash
pnpm --filter @interdomestik/web test:e2e -- --project=crm-visual --grep '@crm-visual-baseline'
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm check:e2e-contracts
pnpm repo:size:check
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
git diff --check
pnpm verify-slice -- --static
pnpm verify-slice -- --required-gates
```

`pnpm check:e2e-contracts` runs the E2E contract guard and quarantine-budget guard; for CRM21 it
should catch forbidden readiness patterns, project wiring regressions, and accidental
`@quarantine`/`@legacy` inventory drift.

If the implementation uses existing gate projects instead of a new `crm-visual` project, replace the
visual command with the approved narrow equivalent and keep the `@crm-visual-baseline` grep selector.

The implementation PR should run `interdomestik_qa.scope_audit` with allowed paths limited to:

- `apps/web/e2e/visual/`
- `apps/web/e2e/snapshots/visual/crm-reporting.visual.spec.ts-snapshots/`
- `apps/web/playwright.config.ts`
- `apps/web/package.json`
- `package.json`, only if a root visual script is added
- `scripts/repo-size-budget.json`, only if the measured snapshot delta requires it
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`

Forbidden paths should include `apps/web/src/proxy.ts`, `apps/web/src/app/`, schema/migration/RLS
paths, scheduler/cron config, README, AGENTS.md, Stripe, and broad architecture docs unless a later
review explicitly authorizes a narrower exception.

## Promotion Boundary

This review draft is docs-only and should not update `docs/plans/current-program.md` or
`docs/plans/current-tracker.md` until approved. The approval PR should flip DG18 to `complete`,
promote exactly one implementation slice (`P38-CRM21`), add the corresponding current-program and
current-tracker rows, and record predecessor proof.

The eventual sign-off table should record CRM05, CRM12, CRM13, CRM14, CRM15, CRM16, CRM17, CRM18,
CRM19, CRM20, and CRM22 as completed predecessors. CRM08, CRM09, CRM10, and CRM11 remain reserved.
Reserve `P38-CRM23 Mobile Visual Regression Baseline` and `P38-CRM24 Dark Mode Visual Regression
Baseline` as future visual-proof expansion slots, not part of CRM21.
CRM06 and CRM07 remain completed parallel-track dedupe/routing foundations for P38 and may be
acknowledged as non-blocking context.

## Approval Bar

DG18 should be approved only if reviewers agree that:

- CRM21 promotes visual baseline infrastructure, not product UI changes;
- the first matrix is intentionally small and role-representative;
- Linux/Chromium snapshots are the committed baseline target;
- the lane is opt-in in the first slice and not added to required merge gates;
- PII/volatile screenshot masking is part of the implementation contract;
- existing claims visual quarantine debt remains out of scope.
