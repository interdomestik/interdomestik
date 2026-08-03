# IDA-DG22 Global Storage Denial Addendum

Status: approved scope; canonical merge required before implementation

Parent gate: `IDA-DG22`

Parent gate SHA-256:
`baf97ad76a21df381b806403dc50d2b477637e1e58c45c4ca2e16708113ab4a8`

Sole implementation slice: `IDA-UI03a4`

Classification: design-gate addendum for the existing Tier-3 privacy-sensitive UI slice

Authority base: `e7e3dd43042812d3460240a27fe26e84b5aee09f`

Runtime authorized by this docs-only addendum: `false`

## Decision

Extend the existing exact 17-path writer map by exactly two paths so the already-required global
browser-storage denial case can fail closed without crashing the public page:

18. `apps/web/src/lib/cookie-consent.ts`;
19. `apps/web/src/lib/cookie-consent.test.ts`.

This is not a replacement goal, a second product slice, a cookie redesign, or a generic storage
hardening project. It closes one acceptance blocker discovered while verifying the same
`IDA-UI03a4` journey.

Arben approved this exact two-path scope in orchestrator task
`019fa824-2676-7c22-9dcb-d21af1c354e6` on 2026-07-28 by answering `aprovohet` to the question that
named both paths and stated that the work remains the same `IDA-UI03a4`, with no replacement goal
and no second slice.

## Failure evidence and classification

The last valid implementation checkpoint is local clean head
`8d253a0289532869716d007f35482d09a512a5fb`; it remains unpushed. Its exact base-to-head diff has
17 authorized paths. Focused unit, type, lint, size, security and browser evidence from that
checkpoint remains valid except for proof downstream of the global-storage acceptance blocker.

An exact-browser probe replaced the global `window.localStorage` accessor with a
`SecurityError`-equivalent failure. The public page rendered its critical error boundary instead
of remaining usable. The complete related call surface shows:

- `getCookieConsent()` directly evaluates `localStorage.getItem(...)`;
- `setCookieConsent()` directly evaluates `localStorage.setItem(...)`;
- `useCookieConsent()` calls `getCookieConsent()` during the public-page mount;
- the cookie-consent banner calls `setCookieConsent()` after a deliberate choice;
- the existing cookie value is already the fallback read and durable consent representation.

Classification: `product defect` plus `scope_expansion_required`. It violates parent-gate browser
contract rule 6 and acceptance criterion 5. The GPT-5.6 Sol Ultra current-diff review classified
the crash as a P1 blocker. No remote implementation evidence is valid for merge until this root
cause is closed and the new exact head is re-reviewed.

## Exact amended behavior

1. Accessing the global `localStorage` property, reading its consent key, or writing its consent
   key may throw. None of those failures may escape `getCookieConsent()` or
   `setCookieConsent()`.
2. A storage read failure falls through to the existing cookie parser. A valid existing cookie
   remains readable; absent or invalid cookie input remains `null`.
3. A storage write failure does not prevent the existing consent cookie from being written and
   does not prevent the existing same-window update event from being dispatched.
4. Successful localStorage behavior, key, accepted values, cookie name, cookie attributes,
   subscription events and cross-tab handling remain unchanged.
5. The public page stays usable when the global accessor is denied. The anonymous draft recovery
   composition independently reports recovery as unavailable and must never claim a successful
   browser save in that state.
6. The existing `CustomEvent.detail` remains exactly the allowlisted in-process consent value
   `accepted` or `necessary`; removing or widening that detail is forbidden because existing
   same-window subscribers consume it.
7. No raw error, storage content, draft fact or browser capability detail is logged, externally
   transmitted, persisted outside the existing consent localStorage/cookie pair or exposed in UI
   copy. The bounded same-window event detail is not external egress and must remain unchanged.

The smallest safe implementation is a narrow fail-closed boundary around only the existing
consent-key localStorage read/write. It must not catch or suppress unrelated cookie/event defects.

## Test-first evidence

The first implementation mutation after canonical addendum merge is RED-only in
`apps/web/src/lib/cookie-consent.test.ts`:

1. a denied global storage accessor does not throw during `getCookieConsent()` and falls back to a
   valid cookie;
2. an available storage object whose `getItem()` throws does not escape and falls back to the same
   valid cookie;
3. a denied global storage accessor does not throw during `setCookieConsent()`, still writes the
   existing cookie and dispatches exactly one update event;
4. an available storage object whose `setItem()` throws preserves the same cookie and event
   behavior;
5. existing successful storage read/write and subscription cases remain green.

The already-authorized
`apps/web/e2e/gate/premium-free-start-recovery.spec.ts` must prove the actual public page remains
usable under global accessor denial, shows no false saved state, and keeps the organizer
interactive. This is evidence in an existing writer-map path, not a twentieth path.

Focused proof:

```bash
pnpm --filter @interdomestik/web test:unit --run src/lib/cookie-consent.test.ts
pnpm --filter @interdomestik/web test:unit --run \
  'src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery.test.ts' \
  'src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery-band.test.tsx'
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm --filter @interdomestik/web test:e2e -- \
  --project=chromium e2e/gate/premium-free-start-recovery.spec.ts
pnpm check:modularity-guard
pnpm repo:size:check
```

The parent gate's mandatory Phase C proof remains unchanged:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Codex Security diff scan remains explicitly waived by user instruction. Gitleaks, CodeQL,
`pnpm audit`, Sonar, repo-native security evidence, current-head reviewers, unresolved-thread
count zero and `pr-finalizer` remain required.

## Writer ceiling and forbidden surfaces

The cumulative implementation ceiling is exactly 19 paths: the parent's 17 paths plus the two
paths named here. Any twentieth path stops for fresh authority. Both added files are currently
below 150 lines and must remain at or below 150 lines.

All parent-gate forbidden surfaces and non-goals remain exact. In particular this addendum does
not authorize:

- `apps/web/src/proxy.ts`, routes, page-ready markers, auth, session, tenancy, schema, RLS,
  database, billing, membership or claim behavior;
- changing cookie names, attributes, retention, consent choices, banner UI/copy, analytics,
  privacy policy or cross-origin behavior;
- a reusable storage abstraction, new dependency, cookie/localStorage migration, telemetry,
  provider contact, deployment, release, runner or production mutation;
- `IDA-UI03a2`, `IDA-UI03b`, `IDA-UI03a0c`, `IDA-UI05a`, PR `#1455`, `IDA-CD-DG02`,
  `IDA-CD02`, or any second slice.

## Review, rollout and rollback

Claude Opus quota is exhausted. Per Arben's instruction, GPT-5.6 Sol Ultra is the required senior
route for the exact addendum and the remediated complete implementation diff. A stale or partial
review is invalid. Model review remains advisory and does not replace repository or GitHub gates.

This addendum changes no runner allocation. Mac remains operator/editing/light-proof authority;
GitHub-hosted Ubuntu remains lightweight production evidence; Z620 remains exclusive to the
established staging-heavy jobs and is not required for this focused addendum proof.

The remediation delta touches one production path and two test-only paths: the two newly
authorized cookie-consent files plus the already-authorized recovery E2E spec. A complete code
rollback reverts that three-path delta with no data migration or external cleanup. It restores the
pre-existing crash under globally denied localStorage, so it is mitigation only if the public
surface is simultaneously held from exposure under separate authority. Existing valid consent
cookies and localStorage values require no transformation.

## Stop conditions

Stop before implementation or merge if:

- this docs-only addendum has not merged on canonical main;
- a fresh runtime-authority rebind does not name the cumulative 19-path ceiling;
- the fix needs a third added path, changes consent semantics, or catches unrelated failures;
- the global-denial browser probe still reaches the critical error boundary;
- recovery reports saved/available while its storage is denied;
- focused, mandatory, current-head reviewer, Sonar, CodeQL, security or finalizer evidence is not
  valid on the exact reviewed implementation head.

This addendum preserves every valid checkpoint. It authorizes only the smallest root-cause fix and
does not restart verification that remains valid for unchanged files and environments.
