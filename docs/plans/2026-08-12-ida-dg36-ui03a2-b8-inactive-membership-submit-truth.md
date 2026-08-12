---
document_id: IDA-DG36-UI03a2-B8-INACTIVE-MEMBERSHIP-SUBMIT-TRUTH
date: 2026-08-12
status: consolidated_candidate_not_approved
authority: external_advisory_until_exact_hash_approval_and_docs_only_canonical_merge
base_sha: e374be8479d4191cb7b96d66d7b5836a403655be
resolver_before_gate: blocked_requires_current_authority
active_slice_before_gate: null
proposed_slice: IDA-UI03a2-B8-INACTIVE-MEMBERSHIP-SUBMIT-TRUTH
risk_tier: 2
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
value_mode_measurement: 3/3
---

# IDA-DG36 — UI03a2-B8 inactive-membership Submit truth

## Decision and authority boundary

Propose exactly one future Tier 2 product/copy/i18n/accessibility slice:
`IDA-UI03a2-B8-INACTIVE-MEMBERSHIP-SUBMIT-TRUTH`.

One user outcome only: when a verified inactive `member|user` resumes a retained saved
vehicle/property draft through the already-authorized manager-only route and no submitted case
exists, the disabled Submit explanation names inactive membership as the real blocker, states
that the saved draft can still be managed, and repeats that saving does not submit a claim.

This candidate is not repository authority. It authorizes no product branch, worktree, Brain
product session, active execution, E2E, product mutation, runtime, deployment or production
effect. Arben must approve the final exact identifier, UTF-8 byte count and SHA-256 before the
byte-identical artifact can enter one docs-only authority PR. Gate approval is not runtime
approval. Product work requires a later exact-main runtime receipt and separate exact approval
after the gate merges, governed publication succeeds and AI OS plus the resolver agree.

## Verified starting state and Value Mode controls

Observed 2026-08-12:

- Interdomestik `main == origin/main ==`
  `e374be8479d4191cb7b96d66d7b5836a403655be`; canonical main is clean.
- Canonical preflight passes. The only worktree is canonical `main`; local and remote
  `codex/*` namespaces are clean. Branch-hygiene report SHA-256 is
  `077645056354a6291ef5fe56faa721a304b56e9ed7a71cc164a57962abc2ce8d`.
- Canonical resolver returns `blocked_requires_current_authority`, reason
  `umbrella_without_concrete_promoted_slice`, source `docs/plans/current-tracker.md`,
  `activeSlice=null`.
- Workflow scorecard passes new-slice branch readiness and blocks only because no active slice
  and gate plan exist.
- Check-first AI OS observation
  `2b81f1efe59819959722203a0824ae4be9d8886e39c57cafdd7bad499e849101` proves
  Brain=current, Integrity=clear, zero blocking contradictions and verified M1-M7. M1 is
  `verified_current`; M2/M3 are `terminal`; M4-M6 report `no_qualified_candidate`; M7 reports
  `no_authorized_enrollment`. Interdomestik is authority=current, activeSlice=none and
  runtime=not_authorized. Atlas has no authorized M5/M7 role in this gate.
- Heavy-job controller preflight completed without acquiring a product lease. No Z620 work,
  build, product E2E or product mutation was consumed during discovery.
- User-owned `log.md`, Knowledge workspace changes and the Value Mode contract are preserved.

Value Mode orientation used exactly one focused Brain query and no recovery query/search:

- query: `Interdomestik Value Mode 3/3 next governed product slice current authority after
  IDA-UI03a2-B7 terminal closeout`;
- process wall: 1.754 seconds;
- retrieval latency: 517 ms;
- returned context: approximately 437 tokens;
- useful result: canonical current-tracker and current-program locators;
- authority result: locator-only; Brain neither selected nor promoted this candidate;
- recovery count: 0.

Repo `AGENTS.md`, current-program, current-tracker, architecture tracker, source and tests remain
final authority. No broad Brain retrieval loop was used. The repository-scoped
`interdomestik_qa` MCP is configured but is not callable in this task runtime, so exact shell
reads from canonical clean main are the recorded fallback; this does not weaken product gates.

## Repository-supported selection

Current-program/current-tracker Rev 221 consume completed
`IDA-UI03a2-B7-SAVED-DRAFT-DELETE-INDEPENDENCE-TRUTH` and require fresh current-authority
selection. Completed B1-B7 established:

1. one canonical numbered claim can be submitted from one complete owner-scoped saved draft
   without retyping its six facts;
2. the claim and source draft remain independent records;
3. the same owner/tenant restores the deterministic existing claim on retained-draft re-entry;
4. fresh submit and background lookup render distinct truthful success copy;
5. dirty-only Submit failure has a dedicated next-action explanation; and
6. both success origins explain that later draft editing or deletion does not change or delete
   the submitted case.

The remaining current component truth has one concrete cause-collapse. In
`DormantPreview`, `managerOnly=true` is passed only by the canonical server entry when all of
the following are already true: no active membership, exact `?mode=drafts`, neutral IDA host,
raw role `member|user`, and default public tenant. A resumed draft in this mode can be reviewed,
edited and deleted, but Submit remains disabled. The component currently gives this known
inactive-membership state the same generic explanation used for malformed, incomplete or
unsaved drafts.

The current source already owns the exact cause; this slice does not infer membership in the
client and does not introduce a new state. The smallest honest continuation is to select one
new locale-owned explanation only when `managerOnly` is true and no existing claim has replaced
the disabled state. Existing B4/B5 behavior remains higher precedence: when background lookup
finds the deterministic submitted case, the canonical link and existing-case truth replace the
disabled explanation even in manager-only mode.

Completed `IDA-UI06a`, `IDA-UI06b`, `IDA-UI03b`, `IDA-UI03a2-P0a2a`, B1-B7 and PR
`#1514` remain closed absent regression evidence.

### Candidate comparison

| Candidate | User value | Product writers | New trust/state contract | Decision |
| --- | --- | ---: | --- | --- |
| Inactive-membership Submit truth | Explains the exact blocker and next valid action in the existing inactive-member manager journey | component + 4 locales | none; uses existing server-owned `managerOnly` | Select |
| Incomplete-draft cause copy | Gives an active member a more specific completion action | component + 4 locales | cause precedence | Defer |
| Source-list claim-created badge | Shows linkage before resume | list UI + reader/projection | provenance/read contract | Defer |
| Persisted handoff/source linkage | Restores source context broadly | persistence/schema/readers | yes | Defer |
| Hero redesign | Broad anonymous experience | cross-component | separate phase | Exclude |
| Membership dashboard redesign | Broad authenticated information architecture | shared dashboard | separate phase | Exclude |

The selected candidate modifies one existing component branch and four existing locale files,
plus focused existing tests. It is the smallest remaining repo-supported user-visible product
truth and is credible for a 2-4 active-hour PR-ready target. It neither reserves a successor nor
claims completion of the full UI journey tree.

## Risk tier

**Tier 2 — product-facing workflow copy/i18n/accessibility; no protected runtime mutation.**

The visible and accessible explanation changes only for the existing manager-only branch. The
exact server membership decision, route admission, role/tenant/host predicates, saved-draft
lifecycle, existing-case lookup, Submit eligibility and every writer remain unchanged. Exact
cause precedence, locale parity, accessible description and one existing browser journey must be
proved. Any need to alter route, `proxy.ts`, auth, session, tenancy, membership resolution,
schema, RLS, billing, action, claim/draft reader or writer, provider, deployment or production
surface escalates and stops this gate.

## One user outcome

When the already-authorized inactive member manager journey displays a retained saved draft and
no submitted case exists, the disabled Submit control communicates all three truths:

1. active membership is required before claim submission;
2. the member can continue managing the saved draft while inactive; and
3. saving the draft does not submit a claim.

The message does not promise that membership activation is automatic, immediate, available in a
particular plan or sufficient if another requirement is later missing. It does not imply that
the draft is a claim, reserve coverage, start review or contact a team.

## Entry, transition and exit state

### Entry

- Authenticated raw role is exactly `member|user` in the default public tenant.
- The canonical server membership check returned no active membership.
- The request is the exact neutral-host `/:locale/member/claims/new?mode=drafts` entry already
  admitted by completed `IDA-UI03a5`/`IDA-UI03a6` authority.
- The verified owner explicitly opens Manage and resumes one owner-scoped saved vehicle/property
  draft.
- `managerOnly=true` reaches the existing Claim Draft Intake component.
- Existing B4 lookup may be checking, absent/unavailable or found. No new request is introduced.

### Single transition

When `managerOnly=true`, no found claim is present and the disabled action is rendered,
`DormantPreview` selects a new required `submitMembershipExplanation` value instead of generic
`submitExplanation`.

The fixed localized contract is:

- EN: `To submit a claim, you need an active membership. You can keep managing this saved
  draft; saving it does not submit the claim.`
- SQ: `Për ta dorëzuar kërkesën, ju duhet anëtarësim aktiv. Mund të vazhdoni ta menaxhoni këtë
  skicë të ruajtur; ruajtja e saj nuk e dorëzon kërkesën.`
- MK: `За да поднесете барање, ви треба активно членство. Може да продолжите да управувате со
  овој зачуван нацрт; неговото зачувување не го поднесува барањето.`
- SR: `Da biste podneli zahtev, potrebno vam je aktivno članstvo. Možete nastaviti da
  upravljate ovim sačuvanim nacrtom; njegovo čuvanje ne podnosi zahtev.`

The existing disabled button, `aria-describedby`, paragraph id, styling, keyboard behavior,
manager functions and generic/dirty explanation branches remain unchanged. The new string is
instructional status text, not an error alert.

### Exit

- The disabled Submit control remains disabled and has the exact localized explanation as its
  accessible description.
- Resume, edit, save, delete, load-more and different-email recovery behavior remain unchanged.
- No claim, reservation, event, audit, notification or membership mutation occurs.
- If B4 lookup returns a valid existing case, existing B5/B7 success truth and canonical claim
  link still replace the disabled state; no membership message remains visible.
- If the same member later gains active membership and enters the active route, existing generic,
  dirty, eligible and successful branches remain unchanged.

## Exact writer map

Production/i18n paths, exactly five:

1. `apps/web/src/components/claims/claim-draft-intake/dormant-preview.tsx`
2. `apps/web/src/messages/en/claims.json`
3. `apps/web/src/messages/sq/claims.json`
4. `apps/web/src/messages/mk/claims.json`
5. `apps/web/src/messages/sr/claims.json`

Focused existing test/spec paths, exactly four:

6. `apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`
7. `apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`
8. `apps/web/src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`
9. `apps/web/e2e/smoke/ida-dashboard-smoke.spec.ts`

Conditional deterministic metadata, only if unchanged generator proves inventory/size drift:

10. `scripts/repo-size-budget.json`

No file may be added, deleted or renamed. The writer map freezes after approval. Any tenth
non-metadata path or any unlisted writer stops implementation and returns for a future slice.

## Existing line-count and modularity boundary

Current exact-main counts before implementation:

- `dormant-preview.tsx`: 140 lines; the existing component-boundary guard requires strictly
  fewer than 150 lines, so the future version must remain at or below 149. Nine lines of
  headroom exist; reaching 150 is a hard stop because the guard is intentionally not a writer.
- `claim-draft-intake.test.tsx`: 150 lines; it may change existing collector values but may not
  grow.
- `saved-draft-submit.test.tsx`: 141 lines; replace the existing manager-only row rather than
  adding a duplicate matrix.
- `saved-draft-reentry.test.tsx`: 140 lines; replace the existing pre-found expectation rather
  than duplicating the case.
- `ida-dashboard-smoke.spec.ts`: 142 lines; one exact accessible-description assertion may be
  added while keeping the file at or below 150.

No refactor, helper extraction or file split is authorized unless this exact change cannot fit
the ceilings; that condition stops the slice instead of expanding it.

## Contract graph

### Nodes

- `N1 server-entry`: canonical inactive-member manager-only decision in `_core.entry.tsx`,
  read-only and unchanged.
- `N2 intake-prop`: existing `managerOnly` prop conduit through `index.tsx` and
  `main-panel.tsx`, unchanged.
- `N3 preview`: existing `DormantPreview` disabled-state branch; sole production writer.
- `N4 locale-store`: four serialized `claims.draftIntakeCopy` values.
- `N5 generic-cause`: all non-manager, non-dirty disabled causes keep
  `submitExplanation`.
- `N6 dirty-cause`: B6 dirty-only state keeps `submitUnsavedExplanation`.
- `N7 found-case`: B4/B5/B7 found state keeps canonical link and origin-accurate success.
- `N8 unit-collectors`: existing production-locale, disabled-cause and re-entry tests.
- `N9 browser-collector`: existing inactive-account dashboard-to-draft smoke path.
- `N10 protected-baseline`: route, membership, auth, tenant, claim/draft reader/writer and
  proxy contracts, unchanged.

### Edges

- `E1 N1 -> N2`: pass the existing server-owned manager-only boolean.
- `E2 N2 -> N3`: preserve the existing prop conduit without deriving membership client-side.
- `E3 N4 -> N3`: parse one new required localized key.
- `E4 N3 -> N4`: select `submitMembershipExplanation` only for manager-only disabled state.
- `E5 N5 -> N3`: generic malformed/incomplete/not-persisted causes remain generic.
- `E6 N6 -> N3`: ready-but-dirty cause remains higher-specificity dirty copy for active flow.
- `E7 N7 -> N3`: valid found case replaces all disabled explanations.
- `E8 N8 -> N3/N4`: unit proof binds cause precedence and all four locale values.
- `E9 N9 -> N1/N3`: browser proof binds server entry to visible/accessibility truth.
- `E10 N10 -> N1/N2/N3`: protected baseline remains read-only and unchanged.

### Closure

- Callers: `managerOnly` caller and prop conduit are enumerated; no new caller exists.
- Shared consumers: `ClaimDraftCopy` is consumed only by the existing intake component graph;
  all locale instances are updated atomically.
- Read/write/delete: four static locale values and one presentation branch change; zero runtime
  store read/write/delete is added.
- Mount/error paths: manager-only absent/error/found, active generic, active dirty and eligible
  branches are all represented.
- Capability requirements: ordinary focused unit/i18n proof plus existing governed browser/CI
  lane; no special provider, schema or deployment capability.
- Test collectors: production-locale collector, disabled-cause table, found-case precedence and
  inactive browser journey cover every changed edge.
- Baseline ownership: server entry owns membership truth; B4 owns found-case lookup; B5/B7 own
  success copy; B6 owns dirty copy; B8 owns only manager-only explanation selection.

## Acceptance tests

### Focused RED/GREEN

1. RED: manager-only row expects `submitMembershipExplanation`; current component still renders
   generic `submitExplanation`.
2. GREEN: manager-only disabled action uses the new value as its accessible description.
3. Generic not-persisted, missing-version, malformed-id and incomplete-draft rows remain bound
   to the existing generic explanation.
4. Active ready-but-dirty remains bound to B6 `submitUnsavedExplanation`.
5. Manager-only plus dirty draft still renders the membership explanation because inactive
   membership remains the server-owned necessary blocker; it does not reuse the active B6 copy.
6. Manager-only plus incomplete draft still renders the membership explanation while draft edit
   and save controls remain available.
7. Manager-only found-case lookup replaces the disabled state with B5/B7 existing-case truth and
   the canonical claim link; no membership explanation remains.
8. The existing single-line exact-array collector in `claim-draft-intake.test.tsx` is extended
   with `copy.submitMembershipExplanation` and all four approved expected strings. This exact
   collector—not generic i18n key parity—must fail if the serialized nested key is absent. The
   150-line file changes in place and does not grow.
9. Four production locale JSON payloads parse and contain the exact approved values; no required
   key is absent and EN/SQ/MK/SR meaning remains equivalent.
10. Existing boundary, submit, re-entry and locale tests remain green; no writer/lookup call is
   introduced by copy selection.

Focused command:

`pnpm --filter @interdomestik/web test:unit --run src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`

### Browser and exact-head proof

11. Existing `ida-dashboard-smoke` path signs in the same inactive member after a cold session,
   follows `member-draft-continuation`, opens Manage, resumes the exact saved draft and observes
   disabled Submit.
12. The disabled Submit accessible description equals the exact approved EN manager-only value.
13. Saved facts remain visible; `free-start-save-open` stays absent. That existing assertion,
    together with the unchanged `SecureSaveBand` branch that renders Save only under
    `!manageOnly`, pins the browser path to manager-only truth. No claim-created success appears.
14. The existing active-member gate assertion against generic SQ `submitExplanation` is outside
    the writer map by design: it proves active membership first, uses no `?mode=drafts`, and must
    remain unchanged and green.
15. Focused smoke uses task-owned `PW_PORT` from the first attempt and runs on governed Z620 via
    the heavy-job controller.
16. One and only one full exact-head CI E2E authority lane completes on the final product PR
    head. No rerun occurs unless head or covered contract is materially invalidated.

Browser command:

`pnpm --filter @interdomestik/web e2e:smoke:ida`

This is the canonical repository command from `apps/web/package.json`; a missing or skipped
required case is failure.

### Required repository/tier gates

- `pnpm i18n:check`
- `pnpm i18n:purity:check`
- `pnpm check:modularity-guard`
- `pnpm check:e2e-contracts`
- `node scripts/repo-size-budget-sync.mjs --check`; run unchanged tracked-only sync only if the
  approved diff changes deterministic metadata.
- `pnpm slice:verify`
- `pnpm security:guard`
- canonical Z620 `pnpm pr:verify:hosts` as the one supporting local composite required by repo
  policy, with no global injection of `IDA_HOST`, `PLAYWRIGHT=1` or other E2E-only environment
  into unit/coverage lanes.
- PR exact-head CI, Sonar, CodeQL, Semgrep, OSV, gitleaks, pnpm-audit, security, feedback intake,
  finalizer and the one full CI E2E lane.

Do not run Mac Docker or Mac heavy wrappers. Focused local unit/i18n checks may run on the Mac;
build, `pr:verify`, browser/E2E and RAM-heavy work run through the governed Z620 controller.

## Highest-risk cases

1. `managerOnly` is treated as a client-derived membership status instead of the existing
   server-owned decision.
2. The new copy appears for active members with an incomplete or malformed draft.
3. B6 dirty-only copy loses precedence for active members.
4. Found existing case remains accompanied by contradictory “activate membership to submit”
   text.
5. One locale says activation submits the claim, creates coverage or starts review.
6. The message suggests the saved draft is unavailable while inactive.
7. The new serialized key is absent in one production locale and React renders an empty
   accessible description; there is no EN fallback for this nested JSON string.
8. The disabled control loses its accessible description or changes focus/ARIA behavior.
9. Near-ceiling production/test files grow past the approved modularity boundary.
10. E2E-only environment is injected globally into `pr:verify`, repeating the B7 runner failure.
11. A product head changes after review or after the one full CI E2E lane.
12. Automatic CD reaches checkout/provider/deploy effects before containment.

## Accessibility and responsive contract

- Existing disabled button and `aria-describedby="claim-draft-submit-explanation"` remain
  unchanged; the exact localized cause is available to screen readers.
- The explanation is status/instruction text, not red validation error, `alert` or color-only
  signal.
- No focus movement is introduced. Background found-case still does not steal focus; deliberate
  submit success behavior stays unchanged.
- Existing 320/360/390/430 mobile wrapping, 200% zoom, WCAG text spacing, forced-colors,
  reduced-motion and keyboard behavior remain baseline requirements. The new strings must wrap
  inside the existing container without document overflow attributable to this slice.
- EN/SQ/MK/SR semantic parity is required. German is not part of the current product locale set,
  so this slice adds no fifth locale.

## Multi-tenant, security and privacy assessment

- Data ownership: unchanged owner-scoped saved draft and exact deterministic claim identity.
- Permission matrix: unchanged server entry admits only exact inactive `member|user`, default
  public tenant, neutral host and exact query; active members use the existing active path.
- Auth/session/tenancy: no writer path. Existing authoritative server decision is passed through
  unchanged.
- Routing/proxy: no route or `apps/web/src/proxy.ts` change; canonical `/member` surface and
  `new-claim-page-ready` marker remain.
- Schema/RLS/database: not touched. No new query, table, field, policy, migration or fixture.
- Billing/entitlements: no Paddle, plan, payment, activation or entitlement mutation. Copy says
  only that active membership is required.
- Privacy: no PII, claim narrative, membership detail, account state or foreign existence is
  exposed beyond the already-rendered own-session manager state.
- Audit/observability: no new event/log/metric; unit and browser selectors are adequate for this
  presentation-only truth.
- Abuse/fraud: copy cannot activate membership, create a claim or bypass eligibility. Tampering
  with client props cannot change server admission or any writer.
- Performance/cost: one string selection only; zero network, database, bundle dependency or
  provider cost.
- Concurrency/races: unchanged B4 lookup race handling and B1 writer; no new asynchronous path.

## Reviewer and evidence route

- One sole implementation writer after runtime approval.
- One bounded independent senior review. Use Claude Opus 5 when available; otherwise record the
  exact blocker and use only an already-authorized policy fallback. Do not run model maintenance
  or global configuration changes.
- Review focuses on cause precedence, manager-only authority, locale meaning, accessibility,
  exact writer map, near-ceiling files and no protected drift.
- One finding set permits one consolidated remediation pass. A substantive code/test/contract
  change receives one substantive re-review; further real defects stop `fix-first`.
- Request GitHub Copilot once after product PR open and use `@copilot review` only if the normal
  request does not persist. Unavailable is unavailable, not pass.
- Inspect Sonar, CodeQL, security, Copilot and review threads early and again at exact-head
  terminal quiescence. Merge only the current reviewed head with zero actionable unresolved
  feedback.
- Never send secrets, PII, claim narratives, membership records or private materials to an
  external reviewer. The packet is bounded to public code paths, diff and contract evidence.

## Publication, rollout and rollback

Before runtime:

1. exact-approve this immutable candidate;
2. create one clean task-owned docs-only authority worktree from then-current clean main;
3. materialize the byte-identical gate plus minimal current-program/current-tracker
   supersession and passing admission/UI-UX receipts;
4. run focused Tier 0 authority proof, bounded reviewer/feedback checks and merge exact head;
5. publish only through governed task publication, without direct refresh, AI OS repair or a
   fabricated product milestone;
6. require Brain=current, Integrity=clear, zero blocking contradictions, M1-M7 verified and exact
   AI OS/resolver agreement on this slice with runtime not authorized;
7. create an immutable exact-main runtime receipt and stop for separate exact approval.

After runtime approval, rollout is one normal web product PR with no feature flag, schema,
backfill, provider or deployment mutation. Automatic CD must be cancelled before checkout,
registry, provider, alias or deployment effects.

Rollback before product merge is deletion of only the task-owned product branch/worktree. After
product merge, rollback is one exact product-merge revert, triggered by wrong cause precedence,
misleading locale semantics, found-case contradiction, accessibility/layout regression,
unauthorized path drift or failed current-head evidence. No schema/data/provider rollback exists.

## Exclusions and non-goals

- No membership activation CTA, pricing link, dashboard redesign or billing behavior.
- No new incomplete-draft, malformed-id, unsupported-category or generic disabled-state branch.
- No claim-created badge, source/origin badge, list projection, search or broad provenance UI.
- No handoff-context persistence, source field, schema, read model or reverse lookup.
- No draft/claim reader or writer, eligibility, idempotency, lifecycle, retention or deletion
  change.
- No `apps/web/src/proxy.ts`, route, auth/session/OTP, tenant, membership resolver, schema/RLS,
  migration, billing/Paddle, provider, deployment or production mutation.
- No anonymous tree expansion, Hero redesign, broad membership dashboard or second journey node.
- No docs, CI, workflow, tracker cleanup, architecture cleanup or prerequisite promoted as
  product work.
- No AI OS/Brain/retrieval/KG/Atlas/persona/schema/dashboard/agent-count/workflow improvement.
- No Gemini maintenance/deletion, second writer or second slice.

## Stop conditions

Stop and return for fresh authority if:

- exact approved artifact/base/slice/writer map mismatches;
- Brain/Integrity/contradiction/M1-M7 checks fail or AI OS/resolver disagree;
- `managerOnly` no longer means the exact server-owned inactive-member manager path;
- final locale wording changes after exact approval;
- any route, entry, proxy, auth, tenancy, membership resolver, action, reader, writer, schema,
  RLS, billing, provider, CI/workflow, deployment or production file must change;
- a new key requires a fifth locale, new file, new dependency or tenth non-metadata writer;
- `dormant-preview.tsx` reaches 150 lines, any other touched near-ceiling file exceeds its
  existing 150-line ceiling, or a file grows without the approved bounded replacement strategy;
- generic, dirty or found-case precedence cannot remain unchanged;
- copy needs an activation CTA, plan promise, server action or second outcome;
- a new state, persistence, shared consumer, special environment or independently invalidatable
  proof surface appears;
- required test is skipped, reviewer/security/CI/Sonar/CodeQL/feedback/finalizer evidence is
  non-green or actionable feedback remains unresolved;
- final product head changes after the sole full CI E2E lane;
- PR-ready status is not credible within 2-4 active engineering hours;
- one consolidated remediation pass is exhausted and a real defect remains;
- a second slice or successor promotion appears.

## Residual risks

- Active members with incomplete/malformed drafts still receive the generic combined
  explanation; that is a separate possible product slice.
- The manager list still has no claim-created badge before resume; B4 restores a case only after
  resume, and broader provenance remains unpromoted.
- The message can explain the blocker but cannot activate membership; existing membership entry
  and billing journeys remain separate.
- Public benchmarks cannot access authenticated insurer manager screens. They support cause
  specificity and eligibility/next-action principles; repo source and tests own factual truth.
- Four serialized locale JSON values remain legacy structure. This slice changes one required key
  only and does not refactor serialization.
- Brain shortened orientation to one useful locator query but did not select the slice. Final
  `humanUseful` and `brainAuthorityCorrect` are recorded factually at closeout; ROI waits for the
  three-slice comparison and complexity caveats.

## UI/UX benchmark and better-than-baseline target

Observed 2026-08-12 from public official sources:

1. GOV.UK Design System, `Check a service is suitable`: ineligible users should be told why and,
   where possible, what to do instead.
   `https://design-system.service.gov.uk/patterns/check-a-service-is-suitable/`
2. GOV.UK Design System, `Error message`: general errors are less helpful; messages should be
   specific, concise and explain the correction, while eligibility states should not be styled
   as field errors.
   `https://design-system.service.gov.uk/components/error-message/`
3. Progressive, `How to report a claim online`: separates eligibility/coverage qualifications,
   review before submission and post-file claim tracking.
   `https://www.progressive.com/claims/faq/how-to-report-a-claim/`
4. GEICO, `How to report a car accident insurance claim online`: separates login/reporting,
   required information and post-completion claim management, with policy-scope qualification.
   `https://www.geico.com/claims/claimsprocess/online-claim-reporting/`

Comparison criteria are cause specificity, next-valid-action clarity, preservation of entered
work, no false eligibility/coverage promise and accessible relationship to the disabled control.

Numeric better-than-baseline outcome:

- metric: manager-only disabled Submit states that name the exact inactive-membership blocker
  and preserve saved-draft management truth;
- unit: covered state count;
- direction: higher;
- baseline: `0/1`;
- target: `1/1`;
- method: focused component matrix plus the existing cold-session inactive-member browser path.

Anti-copy/trade-dress boundary: use only general principles of specific cause explanation,
eligibility truth and next-action clarity. Do not copy operator wording, layout, branding,
illustration, interaction sequence, icons or distinctive trade dress.

## First implementation action after separate runtime approval

Write the RED expectation by replacing the existing `manager only` row in
`saved-draft-submit.test.tsx` so it requires the new localized key while every other row remains
unchanged. Run that focused file and retain the expected single-cause failure before editing
production or locale files.

## Bounded senior-review disposition

Claude Opus 5 completed one read-only repository-grounded design review through the governed
`opus-5-priority-read-grep` route in 365.372 seconds and returned `CONDITIONAL_PASS`. Its single
finding set was consolidated into this candidate without expanding the outcome or writer map:

1. manager-only plus dirty and manager-only plus incomplete states are now explicit membership-
   copy acceptance rows;
2. `dormant-preview.tsx` is correctly capped at 149 by the stricter existing boundary test;
3. the exact nested serialized-locale collector, rather than generic i18n parity, owns missing-
   key proof and prevents an empty accessible description;
4. the existing inactive smoke's absent Save control is named as manager-only browser evidence;
5. the current four-locale set and unaffected active-member SQ gate are stated explicitly; and
6. the canonical `e2e:smoke:ida` command replaces the provisional invocation.

The reviewer independently verified that `managerOnly` necessarily implies the server's failed
active-membership check and found no hidden route/auth/tenant writer, no unlisted TypeScript
consumer and no locale-semantic blocker. No second reviewer or review loop was opened. The final
exact candidate receives Arben's user-presence judgment before repository materialization.

## Exact approval boundary

After bounded senior review and one consolidated disposition, count this exact artifact with
`wc -c` and `shasum -a 256`. Approval must name exactly
`IDA-DG36-UI03a2-B8-INACTIVE-MEMBERSHIP-SUBMIT-TRUTH`, its exact UTF-8 byte count and exact
SHA-256. Any later byte change invalidates approval. Approval authorizes only docs-only authority
materialization; it never substitutes for the later exact-main runtime approval.
