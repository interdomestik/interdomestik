# IDA-DG22 Pre-membership Draft Continuity Design Gate

Status: review draft; promotion is not effective until the exact gate is approved by Arben,
reviewed, merged, and followed by fresh resolver and runtime-authority evidence.

Gate: `IDA-DG22`

Sole prospective implementation slice: `IDA-UI03a4`

Classification: product UI + privacy-sensitive browser persistence

Risk tier: Tier 3

Base: `4dbb1d094de4b1ae80c5e375d21a2a1f06fa6824`

Phase: Phase C

## Decision

Promote exactly one bounded product outcome: the neutral-IDA pre-membership Free Start organizer
must automatically preserve eligible vehicle/property facts on the current browser, offer an
honest resume-or-discard choice after an accidental exit or return, and remove the browser recovery
copy only after the existing verified-email secure save succeeds.

The complete in-scope journey is:

1. begin Free Start without an account or membership;
2. enter at least one eligible vehicle/property fact;
3. receive visible confirmation that a recovery copy exists only on this browser;
4. leave, reload, close the tab, or close the browser without pressing `Save securely`;
5. return on the same origin and browser within 30 days;
6. choose `Continue with these notes` or `Discard from this device`;
7. continue editing without re-entering the restored facts;
8. optionally verify the same email through the existing OTP seam and complete the existing secure
   save;
9. after and only after durable secure-save success, remove the device recovery copy while the
   owner-scoped server draft remains available across sessions/devices.

This is one product slice, not a new storage platform. It adds no anonymous server writer, account,
membership, claim, case, document, provider, schema, RLS, route, or tenant behavior.

## Why this supersedes the earlier unapproved candidate

The earlier local `IDA-DG22` / `IDA-UI05a` staff-queue scanability draft was never approved,
committed, pushed, opened as a PR, merged, or promoted. Arben clarified that the next required
business outcome is continuity of pre-membership notes when a user exits or forgets to save. That
clarification invalidates the earlier candidate selection before canonical authority.

The earlier candidate's Opus review remains historical selection evidence only. It is not review
or approval evidence for this gate. `IDA-UI05a` returns to an unpromoted candidate pool and no
tracker row may imply it was started or rejected as product work.

## Current journey truth

- `IDA-UI01` public vehicle → injury → property → flight selection continuity is complete through
  `IDA-UI01f`.
- `IDA-UI03a1` is complete and already provides optional deliberate secure save for pre-membership
  vehicle/property facts after neutral email OTP, same-email cross-session/device resume,
  owner-isolated manage/update/delete, and zero claim/member side effects.
- `IDA-UI03a3` is complete for an authenticated active member on `/member/claims/new`; it does not
  cover an anonymous accidental exit.
- Current `useOrganizerFlow` initializes category/step/facts only in React state. Before deliberate
  secure save, refresh or exit loses the values.
- Current copy explicitly says `Nothing has been saved automatically`; that statement is truthful
  now and must change only with this implementation.
- The existing secure store remains the sole cross-device authority. Browser recovery is a
  same-origin/same-browser convenience copy, not an account, secure vault, submitted response, or
  evidence store.
- `IDA-UI03a2` saved-draft-to-claim conversion remains frozen/blocked. `IDA-UI03b`
  different-email recovery and `IDA-UI03a0c` Paddle correlation remain unpromoted.
- PR `#1455`, `IDA-CD-DG02`, and `IDA-CD02` remain completed historical work.
- The pre-gate resolver state remains `blocked_requires_current_authority`, `activeSlice=null`.

## Whole-tree continuity rule

The broader UI tree is not declared complete merely because this slice closes accidental-exit
recovery. Canonical closeout must record:

- completed nodes reused without reopening: `IDA-UI01a`–`IDA-UI01f`, `IDA-UI03a1`, and
  `IDA-UI03a3`;
- the sole node consumed by this goal: `IDA-UI03a4`;
- remaining governed nodes that still need future current-authority decisions, including frozen
  `IDA-UI03a2` and unpromoted `IDA-UI03b`;
- an explicit statement that no second slice is promoted by this goal.

This preserves the full tree as a continuation sequence while obeying the one-slice execution
ceiling.

## Primary user and business value

Primary user: a person organizing vehicle or property facts on the neutral IDA public surface who
has not joined a membership and may leave before choosing secure save.

User value: avoid retyping the incident date, issue, counterparty, desired outcome, and bounded
summary after an ordinary same-browser return.

Business value: reduce preventable pre-membership abandonment while retaining an honest boundary
between device recovery, verified secure save, membership, and claim creation.

## Operator benchmark

Contemporaneous evidence is recorded in
`docs/plans/2026-07-28-ida-dg22-ui03a4-benchmark-approval.json`.

Three relevant operator patterns inform the design:

1. Typeform automatically keeps unfinished answers in the same browser for 15 days, explicitly
   states the same-device/browser and private-browsing limitations, and lets product owners disable
   the feature for privacy-sensitive forms.
2. Google Forms shows an explicit draft-saved state and keeps signed-in response progress for 30
   days, including cross-device continuation through identity.
3. GOV.UK One Login separates in-form progress from durable account save, offers save/return entry
   points, and warns when leaving would otherwise lose unsaved work.

Comparison criteria:

- whether ordinary exit/return avoids re-entry without falsely claiming cross-device durability;
- whether users can distinguish browser recovery from verified secure save and submission;
- whether expiry, discard, private/shared-device risk, and unavailable storage are truthful;
- whether successful identity-bound save removes the weaker device copy without data loss.

Numeric better-than-baseline outcome:

- metric: successful same-browser restoration after exit without deliberate secure save;
- unit: successful sessions out of 10 eligible seeded sessions;
- baseline: `0/10`;
- target: `10/10`;
- direction: higher;
- method: in a fresh anonymous neutral-IDA context, enter all six eligible facts, close the page
  without pressing secure save, reopen the same origin within the 30-day window, resume the offered
  recovery copy, and verify every fact and resume step. Repeat across the configured Chromium,
  Firefox, and WebKit lanes. Separate cases must prove expired, malformed, wrong-version,
  unsupported/injury, discard, and post-secure-save copies restore `0/1`.

Anti-copy boundary: use only abstract principles of automatic progress recovery, explicit save
status, bounded retention, and identity-bound cross-device promotion. Do not copy operator wording,
layout, branding, interaction geometry, illustrations, icons, motion, or trade dress.

## Exact browser data contract

The browser recovery record is one versioned JSON value in `localStorage` under a fixed,
Interdomestik-namespaced key. Browser origin isolation is the host boundary. Locale changes on the
same origin must not fork or duplicate the record.

Allowed payload:

- schema version;
- `vehicle` or `property` category;
- existing `issueType`, `incidentDate`, `counterparty`, `desiredOutcome`, and bounded `summary`;
- existing safe resume step: `category`, `details`, or `preview`;
- `updatedAt` and logical `expiresAt`.

Forbidden payload:

- injury/medical facts or category;
- generated result/claim pack, confidence, evidence checklist, letter, or timeline;
- email, OTP/code, user/session/member/tenant identifiers, cookies, auth state, or device
  fingerprint;
- claim/case/number/counter/event/audit/document/upload/notification/billing/provider data;
- arbitrary HTML, analytics identifiers, raw errors, or non-allowlisted fields.

Rules:

1. Write only after one meaningful eligible fact/category exists; never write an empty page shell.
2. Validate the complete record through a strict versioned parser before restore. Reuse the
   existing `freeStartDraftPayloadSchema` enum and field-limit contracts through read-only imports
   or derived schemas; do not duplicate a weaker issue/outcome/text contract.
3. Invalid JSON, unknown version, invalid category/issue pairing, over-limit text, or expired data
   is never rendered and is removed on the next organizer load.
4. The logical recovery window is 30 days from the latest accepted local edit. Browsers provide no
   native localStorage TTL: the UI may promise recovery for 30 days, while physical deletion of an
   expired value occurs when the organizer next loads or the user/browser clears site data.
5. Writes are synchronous and local only. No server action, fetch, beacon, analytics event, log, or
   audit row receives draft content.
6. Storage-disabled, quota, security, serialization, or write failures leave the current page
   usable and show no false `saved on this device` state.
7. Private/incognito mode, cleared site data, another browser/device, another origin, and browser
   policy may prevent recovery; copy must say so.
8. The same-browser copy is not encrypted at the application layer and may be available to another
   person using the same browser profile. Copy must recommend a private device and expose immediate
   discard.
9. One device draft is supported. A newer valid browser write replaces the prior local version.
   Multi-tab conflicts must not silently overwrite a newer stored timestamp: detect a newer
   persisted value, stop the stale write, and offer the latest recovery copy.
10. Existing server-side normalization and medical-token rejection remain authoritative when the
    user requests secure save. Local recovery never turns an invalid local record into a server
    write.

## Exact UI behavior

- A small recovery status appears inside the existing premium organizer hierarchy; it is not a new
  dashboard or hero.
- After the first accepted local write, visible copy says the notes are saved on this browser,
  identifies the 30-day recovery window, and distinguishes it from secure save.
- On return with a valid record, do not silently overwrite the page or immediately overwrite the
  record with empty initial state. Offer:
  - `Continue with these notes`;
  - `Discard from this device`.
- Resume restores category, all five fields, and the safe step. It never restores the generated
  result.
- Discard removes the local key and leaves a clean organizer. It does not delete an independently
  secure-saved owner draft.
- Existing `Save securely` remains deliberate. The sole local-copy clear trigger is the observed
  `draftLifecycle.state` transition from `saving` to `saved` with a non-null
  `draftLifecycle.active.id`. The unchanged lifecycle enters `saving` only for create/update;
  load/resume enters `loading`, so an `active.id` null-to-value transition alone is explicitly
  insufficient. OTP completion, `draftLifecycle.verified`, opening `Resume or manage`, loading or
  resuming an existing server draft, and any other `active` change are not clear triggers. If OTP,
  account context, validation, network, or server save fails, retain the local copy. Observe the
  previous state in the new recovery hook wired by `index.tsx`; no edit to
  `use-draft-lifecycle.ts` is authorized or required.
- `Start another draft` and an explicit local discard remove the device copy for the current
  organizer. Existing server draft deletion semantics remain unchanged.
- Injury remains available in the public journey but is explicitly excluded from device recovery
  and secure save; it must not write medical facts to localStorage.
- Generated result truth remains unchanged: it is temporary and not persisted.
- In all four locales, both `secureSave.status.idle` and `trustBoundary.body` must scope their
  no-automatic-save statement to the generated result and identity-bound secure save. No retained
  string may claim that nothing saves automatically while eligible facts are being recovered on
  this browser.
- SQ, EN, SR, and MK communicate equivalent recovery/storage boundaries. German remains outside
  pilot scope.

## Accessibility and responsive contract

- The recovery region has a programmatic heading and concise description.
- Initial discovery of a recovery copy does not steal focus. After deliberate resume or discard,
  status is announced politely; errors are not repeated on each keystroke.
- Resume and discard are keyboard reachable, have visible focus, and are at least 44 CSS pixels.
- DOM order remains recovery status → organizer step → secure save → trust boundary.
- At 320/360/390/430 CSS pixels and 200% zoom/text spacing, actions reflow without clipping or
  horizontal document overflow.
- Forced colors, reduced motion, light/dark modes where supported, and browser storage failure
  remain usable.
- With JavaScript disabled, no local-save promise or control is rendered; the existing temporary
  no-JavaScript fallback remains truthful.

## Exact implementation writer map

One writer in one fresh implementation worktree may change only:

### Production and locale paths

1. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/index.tsx` — wire the
   recovery lifecycle and leave the current 146-line entry smaller than it started;
2. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/use-organizer-flow.ts` — add
   only a passive typed local-record restore function with no mount effect, storage access, or
   default activation, and remain at or below 150 lines;
3. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery.ts`
   — new strict versioned browser-store contract, at most 150 lines;
4. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/use-anonymous-draft-recovery.ts`
   — new same-browser lifecycle hook, at most 150 lines;
5. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery-band.tsx`
   — new accessible recovery/status region, at most 150 lines;
6. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/free-start-view-model.ts` —
   extract existing label/contact/confidence composition so path 1 becomes smaller, at most 150
   lines;
7. `apps/web/src/messages/sq/freeStart.json`;
8. `apps/web/src/messages/en/freeStart.json`;
9. `apps/web/src/messages/sr/freeStart.json`;
10. `apps/web/src/messages/mk/freeStart.json`.

### Test and deterministic support paths

11. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery.test.ts`
    — new parser/storage/hook contract test, including the read-only imported member-claim consumer
    neutrality proof, at most 200 lines only if table-driven browser failure cases cannot remain
    readable under 150;
12. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery-band.test.tsx`
    — new focused UI/accessibility test, at most 150 lines;
13. `apps/web/src/app/[locale]/components/home/premium-free-start-organizer.test.tsx` — update only
    the device-recovery/trust assertion and keep this file no larger than its current 100 lines;
14. `apps/web/src/messages/free-start-premium-contract.test.ts` — add equivalent four-locale
    recovery truth/key coverage and remain at or below 150 lines;
15. `apps/web/e2e/gate/premium-free-start-organizer.spec.ts` — update only the prior
    `data-save-behavior` expectation and keep this file no larger than its current 118 lines;
16. `apps/web/e2e/gate/premium-free-start-recovery.spec.ts` — new exact browser journey, at most 150
    lines;
17. `scripts/repo-size-budget.json` — deterministic generator output only, and only if the
    unchanged repository-size generator requires it.

Any eighteenth implementation path stops and requires a new exact addendum. No existing 570-line
legacy shell test may grow; new focused proof owns the behavior.

## Shared-consumer confinement

`useOrganizerFlow` and `useDraftLifecycle` are also consumed by the completed authenticated
`apps/web/src/components/claims/claim-draft-intake/index.tsx` / `main-panel.tsx` flow. That member
surface remains read-only, `data-save-behavior="explicit-only"`, and behavior-neutral.

- `useOrganizerFlow` may expose only a passive typed restore function. It must not import the
  browser store, read/write localStorage, run a recovery mount effect, or enable recovery by
  default.
- `useDraftLifecycle` remains unchanged.
- Only the public home `index.tsx` may opt in by composing
  `use-anonymous-draft-recovery.ts` and invoking the passive restore function.
- Writer-map test path 11 must mount or instantiate the read-only member claim intake with a
  pre-seeded anonymous recovery record and prove that it performs no recovery storage read/write,
  renders no recovery band, leaves the record untouched, and preserves
  `data-save-behavior="explicit-only"`.
- If confinement cannot be proven without changing a member claim path, stop under the
  eighteenth-path and completed-slice protections; do not widen this gate.

## Forbidden surfaces

- `apps/web/src/proxy.ts`, canonical route names/groups, host evaluation, neutral OTP boundary,
  `*-page-ready` markers, and public-entry event/routing contracts;
- auth, Better Auth, Supabase Auth, OTP send/verify, sessions, cookies, membership, role,
  entitlement, branch, tenant, RLS, schema, migrations, database, seed, or grants;
- existing `free_start_drafts` server actions/repositories/table/audit behavior;
- claim/case creation, claim numbers/counters, submission, lifecycle/events, assignment, queues,
  detail pages, documents/uploads, AI, notifications, billing/Paddle, email, SMS, providers,
  analytics, deployment, aliases, runners, and production configuration;
- injury/medical persistence, generated-result persistence, device fingerprinting, encryption
  claims, anonymous server tokens, service workers, cookies, IndexedDB, new dependencies, or a
  generic persistence framework;
- `README.md`, `AGENTS.md`, architecture docs, frozen branches/worktrees, PR `#1455`,
  `IDA-CD-DG02`, and `IDA-CD02`;
- `IDA-UI03a2`, `IDA-UI03b`, `IDA-UI03a0c`, `IDA-UI05a`, or any second product slice.

## Acceptance evidence

### Browser contract proof

1. A first meaningful eligible edit writes exactly one strict versioned record and no other key.
2. Empty, injury, generated-result, identity, auth, tenant, membership, and claim facts are absent.
3. Valid partial and complete vehicle/property records round-trip exactly within normalization
   boundaries.
4. Malformed JSON, unknown version, expired records, issue/category mismatch, and over-limit text
   restore nothing and are removed on organizer load.
5. Disabled/quota/security-failing storage keeps the page functional and never reports a
   successful local save.
6. A newer multi-tab record blocks stale overwrite and offers the latest record.

### Journey proof

7. Anonymous user enters six facts, exits without secure save, returns in the same browser, sees
   the recovery choice, resumes all facts and the same safe step, and does not re-enter data.
8. Discard removes the local record and returns a clean organizer.
9. Successful existing secure save removes the local record only after the observed lifecycle
   transition `saving` → `saved` with a non-null `draftLifecycle.active.id`. An `active.id`
   transition by itself, OTP verification, `verified=true`, opening manage, `loading` → `saved`
   resume, and every failed OTP/server/account-context/validation save retain it.
10. A different browser context with empty storage does not see the device copy. The existing
    same-email secure-save C31 proof remains the cross-device path.
11. No claim, case, membership, payment, provider call, generated result, server draft, audit event,
    or analytics event is created by local recovery.
12. Existing secure-draft manage/update/delete behavior and current server validation remain
    unchanged.
13. The read-only member claim intake remains `explicit-only`: a pre-seeded anonymous recovery
    record causes no localStorage read/write or recovery UI and remains untouched.

### UI, copy, and accessibility proof

14. SQ/EN/SR/MK show equivalent same-browser, 30-day, private-device, clear-site-data, discard, and
    secure-save distinction.
15. Existing generated-result copy remains truthful and never says the generated result is stored.
    Across SQ/EN/SR/MK, `secureSave.status.idle`, `trustBoundary.body`, and the recovery band make
    the same distinction: eligible facts may recover on this browser, secure save is deliberate
    and identity-bound, and the generated result is never saved.
16. Recovery controls pass keyboard, focus, accessible-name, 320-pixel, 200% zoom/text spacing,
    reduced-motion, forced-colors, and no-overflow checks.
17. No JavaScript renders no recovery promise.
18. Existing public vehicle/property entry continuity, injury availability, flight journey, secure
    save, and `free-start-intake-shell` markers remain intact.
19. Only the exact writer map changes and every production/refactored file respects the modularity
    ceiling.

## Highest-risk cases

- anonymous notes are silently lost because the write is delayed until after page close;
- empty initial state overwrites a valid returned record before the user can resume it;
- browser copy is described as secure/cross-device/account-bound when it is not;
- localStorage retains health, generated-result, auth, tenant, or claim data;
- a shared-device user sees another person's notes without a visible warning/discard path;
- expired or corrupted attacker-controlled JSON reaches rendered inputs;
- secure-save failure clears the only recovery copy;
- resuming an existing server draft is mistaken for create success and clears unrelated local
  notes;
- successful secure save leaves duplicate local sensitive facts behind;
- a stale tab overwrites a newer local record;
- locale/host changes leak or fork data unexpectedly;
- local storage errors break the public organizer;
- new composition enlarges the 146-line entry or touches protected session/storage code;
- tests prove only a hook and not an actual close/reopen browser journey.
- the shared member claim intake silently activates anonymous browser recovery.

## Test-first and focused gates

The first implementation mutation must be test-only RED in
`apps/web/e2e/gate/premium-free-start-recovery.spec.ts`. It must enter all six vehicle/property
facts anonymously, close the page without choosing secure save, cold-reopen the public entry in
the same browser/origin at the fallback/category state, expect the recovery offer there, resume,
and assert all six facts plus the safe step. Current main must
fail because no browser recovery record or UI exists.

Before production mutation, audit the full `useOrganizerFlow`/`useDraftLifecycle`/secure-save
composition and every current `data-save-behavior`/temporary-truth consumer. Do not patch only the
first failing assertion.

Focused proof:

```bash
pnpm --filter @interdomestik/web test:unit --run \
  'src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery.test.ts' \
  'src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery-band.test.tsx' \
  'src/app/[locale]/components/home/premium-free-start-organizer.test.tsx' \
  'src/messages/free-start-premium-contract.test.ts'
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web test:e2e -- \
  --project=chromium e2e/gate/premium-free-start-recovery.spec.ts \
  e2e/gate/premium-free-start-organizer.spec.ts
pnpm check:modularity-guard
pnpm i18n:check
pnpm i18n:purity:check
```

Mandatory Phase C proof:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Required current-head remote evidence includes CI/static/unit, PR E2E, Pilot Gate, Sonar Quality
Gate with every new issue inspected, CodeQL, gitleaks, pnpm audit, dependency/security checks,
reviewdog, unresolved-thread count zero, `pr-finalizer`, mergeability, approvals, and external
deployment-context classification.

Codex Security diff scan is explicitly waived by user instruction. Repo-native security evidence
is not waived.

## Review and evidence routing

- Claude Opus 4.8 is the priority reviewer for this exact current gate and the later exact current
  implementation diff. Wait up to 20 minutes and extend once to 30 minutes only while genuinely
  running.
- If Opus quota or routing is unavailable, use GPT-5.6 Sol at max reasoning. Sonnet is only a
  trivial/low-risk fallback; Gemini may be an independent second privacy/product signal.
- Review must cover product truth, localStorage privacy/XSS/shared-device risk, parser/version/TTL
  behavior, multi-tab conflict, secure-save handoff, full dependency wiring, and test sufficiency.
- Any substantive remediation invalidates stale review and requires the same senior route or
  approved fallback on the complete current diff.
- Model review is advisory and does not replace repository gates, Sonar, CodeQL, security
  evidence, finalizer, or human approval.

## Runtime and runner authority

This gate is design-only. `runtime_authorized:false`.

After this gate merges, implementation may begin only when:

1. canonical main is clean and synced at the gate merge;
2. AI OS is refreshed and current;
3. both canonical-main and fresh-worktree resolver output select only `IDA-UI03a4`;
4. the workflow scorecard passes for the exact slice;
5. Brain product measurement is started for the Tier-3 privacy-sensitive product slice;
6. a separate exact runtime-authority receipt binds the base, branch/worktree, 17-path ceiling,
   browser key/schema/30-day boundary, first RED, forbidden surfaces, tests, and rollback.

Mac is limited to operator control, editing, and light focused proof; do not start Docker
Engine/Desktop. Use the configured heavy-job lease for local full gates. GitHub-hosted Ubuntu
remains the lightweight production-evidence lane.

This slice changes no CI/CD, runner, deployment, network, provider, or Vercel contract. Do not
invoke a manual full CD. If an unauthorized automatic CD starts, contain/cancel it and record
whether checkout, registry, image, provider, alias, deployment, or production steps occurred.

No Z620 staging build/deploy/rollback is required. If a required existing PR browser gate schedules
heavy Z620 work, first prove the exclusive runner is online, has at least 30 GiB free disk and 8
GiB available memory, and has no conflicting heavy-job lease.

## Rollout, rollback, and residual device data

Rollout is the implementation merge only. No production release, provider contact, alias change,
data migration, or external mutation is authorized.

Before any deployment under separate authority, verify the browser key/version and copy in a
preview environment. A code revert before exposure is a clean rollback.

If browser records have been exposed, rollback must not silently delete active user notes. The
rollback plan is:

1. disable new writes while retaining read/resume/discard and secure-promotion support;
2. allow the 30-day logical window to drain or ship an explicitly approved migration/tombstone
   behavior;
3. remove the recovery UI and code only after the residual key disposition is proven.

Because localStorage has no native TTL, a user who never revisits may retain an inert physical
value until browser/site-data cleanup. The application makes no remote-deletion claim for that
device. This residual is accepted only with truthful copy, minimal allowlisted facts, no health
data, and immediate discard.

## Non-goals

- automatic server autosave, anonymous server identity/token, background sync, service worker,
  cookies, IndexedDB, device fingerprint, or new dependency;
- injury/medical or flight-journey answer persistence;
- generated result/claim-pack persistence;
- real claim submission, draft-to-claim conversion, membership creation, billing, payment, or
  entitlement;
- different-email recovery, account merge, cross-device recovery without verified email, or
  generic tenant-host rollout;
- changes to `IDA-UI03a2`, `IDA-UI03b`, `IDA-UI03a0c`, or a second slice;
- route/proxy/auth/tenancy/schema/RLS/database/provider/deployment/runner changes;
- staff/agent/admin/member dashboard redesign or staff queue scanability.

## Stop conditions

Stop before mutation or merge if:

- Arben has not approved the exact gate hash and sole `IDA-UI03a4` slice;
- the UI/UX benchmark/approval checker is not `pass`;
- the resolver selects zero, multiple, or a different slice;
- the runtime-authority receipt is absent or mismatched;
- the current code needs an eighteenth path or any forbidden/protected surface;
- injury/medical data, generated result, account/tenant/session, or claim data is required in the
  browser record;
- local recovery cannot be implemented without false security/expiry/cross-device claims;
- the first exact browser RED does not reproduce the accidental-exit loss on exact current main;
- secure-save success/failure cannot be causally distinguished before local deletion;
- multi-tab newer-write protection cannot be proven;
- modularity, focused proof, mandatory gates, current-head review, security, Sonar, CodeQL,
  finalizer, or merge authority are not valid on the exact reviewed head.

## Review disposition

Claude Opus 4.8 exact-current review completed as follows:

- R0, 328.500 seconds: `BLOCKED` on clear-trigger precision and four-locale copy truth;
- R1, 338.183 seconds: `BLOCKED` because active-id alone also covered resume and the member claim
  shared consumer was not explicitly confined;
- R2, 232.570 seconds: `PASS`, no blocker or required hardening remains after binding
  `saving` → `saved` causality, passive public-only opt-in, member-flow neutrality proof, scoped
  four-locale copy, canonical validator reuse, and cold public-entry reopen proof.

The earlier `IDA-UI05a` Opus calls remain unrelated historical candidate evidence and do not review
this gate. The 300.459-second wrapper no-output failure is tooling evidence only, not a valid model
review and not part of the elapsed-time average. This receipt-only disposition update changes no
scope or product contract; exact-current final same-route confirmation remains required on the
resulting immutable gate hash before promotion.
