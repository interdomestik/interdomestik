# IDA-DG03 Member-Action Hero Render Design Gate

Status: complete
Slice: `IDA-DG03`
Owner: platform + product + design + qa
Phase: Phase C
Date: 2026-05-26
Authority: repo-canonical design gate. This gate closes the post-`IDA-AUTH01` state and promotes
exactly one bounded implementation slice, `IDA-MH02 Member-Action Hero Render Contract`.

Phase C constraints remain active: `apps/web/src/proxy.ts` is read-only, canonical `/member`,
`/agent`, `/staff`, and `/admin` routes remain fixed, and this gate does not authorize auth,
tenant, billing, schema, backend, Stripe, README, `AGENTS.md`, or architecture-doc changes.

## Source Inputs

- `IDA-MH01 Mobile Home + Adaptive Hero Resolver v0`, merged through PR `#863`, merge commit
  `4ec04de7cde991c55e8dfcd1b1b353e31fe54269`.
- `IDA-DG02 Auth Portal Visual Refresh Design Gate`, merged through PR `#864`, merge commit
  `1666fa71b7e716604528a9866294dacf7bf1f725`.
- `IDA-AUTH01 Portal Sign-In Visual Refresh v0`, merged through PR `#867`, merge commit
  `8e9ecab5aacb00daf8ee86d87137fde278851aa0`.
- Current member-home resolver and tests:
  `apps/web/src/components/dashboard/member-dashboard-view/hero-resolver.ts` and
  `apps/web/src/components/dashboard/member-dashboard-view/hero-resolver.test.ts`.
- Current member dashboard render test:
  `apps/web/src/components/dashboard/member-dashboard-view.test.tsx`.
- Current member-dashboard localized copy:
  `apps/web/src/messages/{en,sq,mk,sr}/dashboard.json`.

## Current State

`IDA-MH01` added a pure resolver for the required home hero states and integrated it into the
canonical `/member` dashboard. The resolver already differentiates visitor conversion states,
active member no-case state, active open-case state, `missing_documents` state, and
`authorization_needed` state. Current render proof covers active member/no case, inactive visitor,
active open case, and `missing_documents` behavior. `authorization_needed` behavior is
resolver-tested but does not yet have the same dashboard render-contract proof as the primary
active-case paths.

`IDA-AUTH01` then refreshed the sign-in portal shell and left the member-home implementation
unchanged. After that merge, there is no pending IDA implementation row in the active tracker.

## Decision

Promote exactly one next implementation slice:

`IDA-MH02 Member-Action Hero Render Contract`

The slice should close the remaining member-action render-proof gap for the IDA mobile home without
turning the resolver into a broad platform engine and without reopening member dashboard layout
scope.

## Authorized Scope

- Add focused render proof that `authorization_needed` produces the correct member dashboard hero
  state, primary CTA test id, href, and localized action copy.
- Keep or strengthen focused render proof that `missing_documents` uses the document-upload CTA
  rather than generic case continuation.
- Preserve the existing pure resolver contract and naming. Do not rename it to an engine.
- Preserve the existing canonical `/member` route, `member-dashboard-ready`, priority/secondary
  region markers, `dashboard-heading`, and one dominant hero CTA.
- Add or adjust i18n keys only if a focused test exposes a missing or unclear key in `en`, `sq`,
  `mk`, or `sr`.
- If production code already satisfies the render contract, implementation may be test-only plus
  tracker/program closeout proof.

## Blocked Scope

- `apps/web/src/proxy.ts` edits.
- Canonical-route renames, route group restructuring, or route bypasses.
- Auth/session, tenant, membership, billing, schema, backend, RLS, migration, Stripe, or Paddle
  changes.
- Broad member dashboard redesign, service taxonomy changes, new dashboard cards, new navigation,
  new backend state, or assistance/recovery workflow expansion.
- Visitor acquisition funnel changes beyond existing resolver test coverage.
- README, `AGENTS.md`, and architecture-doc edits.

## Copy Contract

The slice must preserve the existing forbidden-claim policy for member dashboard messages:

- no guaranteed compensation;
- no "we pay damages";
- no "you will win";
- no "we replace insurance";
- no insurer/broker framing.

Member-action copy must stay assistance/action oriented. For Albanian active-case language, the
current accepted direction remains:

- `Rasti juaj eshte ne trajtim.`
- `Hapi i radhes`
- `Shiko rastin`

Do not reintroduce active-member "join" or "activate membership" CTA copy for an active member.

## Acceptance Criteria For IDA-MH02

- Focused dashboard render tests prove `authorization_needed` renders the authorization hero state
  and CTA, including interactive accessibility role.
- Authorization matching breadth is protected for at least one non-canonical spelling covered by
  `AUTHORIZATION_STAGE_PATTERN`, preferably in dashboard render tests when feasible.
- Existing or strengthened focused tests prove `missing_documents` renders the document-upload hero
  state and CTA, including interactive accessibility role.
- Dashboard render tests explicitly prove active members in `authorization_needed` and
  `missing_documents` states do not see join or activate-membership hero CTA copy.
- Resolver tests remain green for all IDA-MH01 states.
- i18n keys remain complete for `en`, `sq`, `mk`, and `sr`.
- Dashboard message forbidden-claim tests remain green.
- No production behavior change is required if existing code already satisfies the contract.
- No changes to `apps/web/src/proxy.ts`, canonical routes, auth, tenancy, billing, schema, backend,
  Stripe, README, `AGENTS.md`, or architecture docs.

## Verification Expectations

Run the focused checks that match the final diff:

- `pnpm --filter @interdomestik/web test:unit --run src/components/dashboard/member-dashboard-view/hero-resolver.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/components/dashboard/member-dashboard-view.test.tsx`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm --filter @interdomestik/web lint`
- `pnpm i18n:check`
- `pnpm security:guard`
- `pnpm pr:verify`
- `pnpm e2e:gate`

Browser/mobile proof is optional for a test-only implementation. If production member-home UI
classes or copy density change, validate `360`, `390`, and `430` px mobile widths before PR
readiness.

## Reviewer Findings Incorporated

Sonnet 4.6 route: Copilot CLI after Claude CLI was unavailable.

Claude CLI blocker:

- `claude -p --bare --model claude-sonnet-4-6 --tools "" --no-session-persistence ...`
  returned `Not logged in`.

Copilot route:

- `copilot --model claude-sonnet-4.6 --effort low -p ... --disable-builtin-mcps --available-tools= --no-custom-instructions --no-color --no-remote --no-ask-user --allow-all-tools --stream off --silent --output-format text`.

Sonnet verdict: safe smallest next slice.

Findings folded into this gate:

- Blocker for implementation, not for promotion: `authorization_needed` lacks dashboard render proof.
  IDA-MH02 must add that test before merge.
- Hardening: prove the authorization stage matching breadth, either at resolver level or dashboard
  render level, so `authorization`, `authorisation`, and localized `autoriz` matching does not
  regress silently.
- Optional: make active-member non-conversion an explicit named invariant if the implementation diff
  already touches the dashboard render test.

Gemini Pro premium product/design review route:

- Gemini Pro 3.1 via `gemini --model gemini-3.1-pro` was not callable in this environment and
  returned `ModelNotFoundError`.
- Gemini Pro 3.1 via `gemini --model gemini-3.1-pro-preview` succeeded after MCP status noise.
- Verdict: no blockers; the gate is a sound, focused, low-risk next step.

Gemini findings folded into IDA-MH02:

- Hardening: `authorization_needed` and `missing_documents` dashboard render tests should assert
  primary CTA interactivity without forcing unnecessary role overrides on semantic links.
- Hardening: primary CTA mobile tap targets should remain at least `44x44` px if the
  implementation touches UI sizing or classes.
- Hardening: localized action-state copy should use administrative verbs and avoid legal-review,
  approval, or claim-outcome wording.
- Hardening: active-member anti-conversion proof should be explicit for member-action states so
  join or activate-membership hero CTAs cannot regress back into active-member flows.
- Hardening: authorization matching-breadth proof is highest-confidence at dashboard render level
  when bound to status/stage fields, not free-text descriptions or filenames.
- Optional: if IDA-MH02 changes copy or classes, validate mobile density at `360` and `390` px so
  the dominant CTA remains above the first fold.

## Promotion Result

`IDA-DG03` promotes `IDA-MH02 Member-Action Hero Render Contract`.

No runtime code changed in this design gate.
