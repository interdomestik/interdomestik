# IDA-DG22 Post-Grant Coherence Addendum

Status: R4 proposed; exact-byte user approval and canonical merge required before implementation

Revision: `R4`

Addendum ID: `IDA-DG22-A4`

Parent gate: `IDA-DG22`

Parent gate SHA-256:
`baf97ad76a21df381b806403dc50d2b477637e1e58c45c4ca2e16708113ab4a8`

Prior Web Locks addendum: `IDA-DG22-A2`

Prior Web Locks addendum R2 SHA-256:
`ebf579a54fb8bb3eec640d12d07b4f74c558ae6ce38a9b48047dd7abe4f0483a`

Sole implementation slice: `IDA-UI03a4`

Classification: bounded design-gate correction for the existing Tier-3 privacy-sensitive UI slice

Authority base: `682eaf66918e1738661a41d10bba87a612d991f5`

Runtime authorized by this docs-only addendum: `false`

## Decision

Amend only `IDA-DG22-A2`'s post-grant callback rule for the existing anonymous-draft Web Lock.
The callback may yield through exactly two sequential
`globalThis.setTimeout(callback, 0)` timer-task turns after one exclusive grant and before its
first storage read. This is the minimum empirically proven coherence window needed for Firefox to
expose a prior same-origin agent-cluster localStorage mutation to the new lock holder.

The callback remains one non-reentrant outer lock request around the complete
read/validate/compare/mutate operation. It may contain no asynchronous work other than those two
turns. After the second turn, it rechecks mounted generation and operation eligibility, then
captures a fresh actual wall-clock value and performs the complete storage sequence synchronously
without another `await`. The pre-lock timestamp remains the candidate's ordering timestamp; the
fresh value validates current expiry and prevents an already-expired candidate from being saved.

The two-turn hold is bounded by task count, not wall-clock time. Browser scheduling, debugger
pause, renderer stall, background throttling, freezing or operating-system suspension can delay
the holder's tasks. During that delay, sibling requests retain the existing five-second pending
acquisition timeout and fail closed without mutation. This is an explicitly accepted availability
residual. It does not permit an unlocked mutation, a stale overwrite, a false saved result or
discarding a newer candidate merely because its page is hidden or unfocused.

This addendum changes no product outcome, record, key, schema, TTL, copy, route, identity,
analytics, consent, server action or writer path. It does not authorize a second product slice,
generic concurrency utility, storage migration, cookie, IndexedDB, worker, service worker,
`BroadcastChannel`, dependency or architecture expansion.

## Failure evidence and classification

The last valid implementation checkpoint is clean local head
`bff8cd7540070e5545fdc1943e3eb8bf94883cb8`. It is unpushed and remains the implementation
checkpoint.

Exact-head GPT-5.6 Ultra review requested changes because the implementation's two awaited task
turns contradict `IDA-DG22-A2`'s literal synchronous/no-`await` callback rule. Removing the turns
is not safe: exact trustworthy-origin Firefox proof reproduced a stale localStorage cache after a
sibling holder wrote and released the same Web Lock. The later holder could then overwrite newer
data while reporting success. Exactly two post-grant task turns closed that reproduced race in the
complete Chromium, Firefox and WebKit proof.

The review also identified an availability risk: the current implementation clears the only
five-second timer after grant, then can hold the lock while its two tasks are delayed. That risk
cannot be represented as a bounded wall-clock hold. Abort cancels only pending Web Lock requests
and does not terminate an already-granted callback.

An attempted focus/lifecycle cancellation design was rejected before approval. Real browsers
permit visible but unfocused same-origin windows, while Playwright can emulate focus so multiple
pages report `document.hasFocus() === true`. More importantly, cancelling a newer candidate
because its page lost focus can allow an older focused candidate to commit, contradicting A2's
both-grant-order newest-record guarantee and the slice's recovery outcome. R4 therefore does not
gate data safety on focus or visibility.

Classification:

- `workflow/gate`: the proven cross-browser coherence behavior is outside A2's literal callback
  contract;
- `resource/availability`: a granted callback's task turns have no reliable browser wall-clock
  deadline;
- `authority correction required`: A2 simultaneously requires synchronous post-grant mutation
  and cross-agent-cluster newest-record protection, while exact Firefox evidence proves the
  synchronous post-grant localStorage read can be stale.

No standards claim is widened. Web Locks supplies exclusive ordering, not a guarantee that
localStorage caches across agent clusters become coherent before the next synchronous callback.
The two turns are an explicitly empirical supported-browser contract with fail-closed sibling
behavior, not a generic Web Storage atomicity or scheduling guarantee.

## Exact amended behavior

1. Every production mutation-capable recovery operation still makes exactly one request for the
   fixed `interdomestik:free-start:anonymous-draft:v1` exclusive lock.
2. Pending acquisition remains bounded to 5,000 ms by an abort signal. Timeout and supersession
   abort only a still-pending request.
3. After grant, the callback sets its granted state and clears the acquisition timeout before its
   two-turn coherence wait.
4. The holder yields through exactly two sequential `globalThis.setTimeout(callback, 0)`
   timer-task turns. `MessageChannel`, `scheduler.postTask`, microtasks or another task source are
   not equivalent evidence. No network, storage, user prompt, rendering wait, arbitrary delay or
   third task turn is allowed.
5. The lock remains held across both turns. Focus and visibility do not decide whether a candidate
   is eligible to complete.
6. After the second turn, the callback rechecks mounted generation, supersession and operation
   eligibility, then captures a fresh actual `Date.now()` before its first storage read. A failed
   recheck or non-finite/throwing clock is mutation-free and UI-inert.
7. A write retains its pre-lock captured timestamp solely for inter-candidate ordering. Existing
   storage is parsed and expiry/future-validated against the fresh post-turn execution time. After
   monotonic revision derivation, the would-be record must independently satisfy
   `revision <= executionNow + 60_000`, `expiresAt > executionNow` and
   `expiresAt - revision === ANONYMOUS_DRAFT_TTL_MS`. Any failure is stale/unavailable with no
   mutation or saved UI update; `expiresAt === executionNow` is the exact expired boundary.
8. The callback then performs the complete synchronous read → parse/validate → compare →
   `setItem()`/`removeItem()` sequence without another `await`. Internal storage primitives do not
   request a lock.
9. A grant is never reported as saved, removed or restored unless the synchronous task completed
   and its promise result still belongs to the current mounted generation.
10. A delayed or starved granted holder may retain the lock until JavaScript resumes. Sibling
    requests may fail closed at five seconds and may report recovery unavailable, but they perform
    no unlocked fallback or mutation.
11. When the holder resumes, it performs the current-generation/eligibility and fresh-time checks
    before storage access. If it was superseded, unmounted or already expired while stalled, it
    performs no storage mutation or saved UI update.
12. Once the holder releases, a later deliberate eligible sibling interaction follows the existing
    locked reconciliation rule before any new write. A failed sibling candidate is not replayed or
    labeled saved.
13. Missing/throwing Web Locks, inaccessible storage, callback failure or stale generation leaves
    the public organizer usable and recovery unavailable or UI-inert. No unlocked fallback is
    permitted.

These clauses replace only A2's statements that the outer callback is fully synchronous and
contains no `await`. Every other `IDA-DG22`, `IDA-DG22-A1`, `IDA-DG22-A2` and `IDA-DG22-A3`
requirement remains authoritative.

## Test-first evidence

The first runtime mutation after this addendum merges must update existing authorized tests before
production logic.

### Focused unit contract

Existing writer-map unit paths must prove:

1. the granted callback touches no recovery storage before both turns complete;
2. exactly two sequential `globalThis.setTimeout(callback, 0)` turns occur and no third turn or
   alternate task source is scheduled;
3. first-turn and second-turn barriers each retain the faithfully modeled queued lock while
   stalled; native Web Lock ownership is reserved for the browser proof;
4. a sibling request behind either barrier reaches the exact five-second timeout, reports
   unavailable and performs zero storage mutation;
5. releasing the barrier lets the still-current holder complete once and releases the lock;
6. generation supersession or unmount during either barrier makes later completion storage- and
   UI-inert;
7. the holder's acquisition timer is cleared after grant and does not falsely abort it;
8. pending request rejection, timer failure, callback failure and storage failure remain fail
   closed;
9. a first-turn and second-turn barrier crossing to one millisecond before the candidate expiry may
   still use the captured ordering time, while exact `executionNow === expiresAt` and every later
   value fail closed with zero mutation or saved UI state;
10. current stored-record expiry and future-clock validity are evaluated with fresh post-turn
    execution time; the would-be record separately proves the 60,000 ms future bound, unexpired
    result and exact TTL, while replacing the pre-lock ordering timestamp with fresh time is
    forbidden;
11. timer/fake-timer cleanup cannot produce a second completion;
12. both grant orders still leave the newest eligible record stored and secure-promotion removal
    still preserves a later edit.

### Trustworthy-origin browser contract

The existing task-owned HTTPS proof on exclusive `interdomestik-z620-staging` remains canonical.
It must rerun the complete recovery spec with zero retries in actual Chromium, Firefox and WebKit
and preserve:

- exact neutral origin `https://ida.127.0.0.1.nip.io:<task-port>`;
- `isSecureContext === true`;
- real `navigator.locks.request`;
- the exact official Playwright container image;
- no inherited tenant header and no policy skip;
- all same-context held-lock grant-order cases;
- Firefox newer-record survival in both grant orders;
- discard, reset, secure-promotion, cold-reopen and generic-tenant-negative cases.

Add or extend one existing browser case with a deterministic spec-local compiled-runtime seam. The
seam must:

1. be installed only by the recovery spec before the page runtime starts and leave no production
   branch, exported test hook or persistent browser state;
2. arm immediately before the recovery operation, intercept and hold the real first or second
   `globalThis.setTimeout(callback, 0)` coherence callback, and assert expected turn identity so an
   unrelated timer cannot satisfy the proof;
3. preserve real `navigator.locks.request` and prove the callback already owns the exact production
   lock;
4. start a sibling operation and prove it fails closed after the exact 5,000 ms pending budget with
   no storage mutation while the holder remains stalled;
5. release the captured callback, prove the still-current holder completes once, and prove the
   lock becomes available;
6. in at least one barrier phase, advance a spec-local clock seam past the captured candidate's
   exact TTL before release and prove the holder fails closed without storage mutation or a saved
   status;
7. repeat separately for first-turn and second-turn barriers;
8. restore `setTimeout`, `clearTimeout`, the clock and every lock-observation wrapper, then leave
   the page/runtime clean before the next phase.

Run both phases in Chromium, Firefox and WebKit. Merely closing a still-pending page or testing a
pre-grant timeout is insufficient. The proof may use only the existing exact recovery spec and may
not add a twentieth writer path. That new spec must first be reduced from its current 150 physical
lines and remain at most 149 lines after the seam is added, as required by active `AGENTS.md`.

## Required focused and mandatory gates

Focused proof first:

```bash
pnpm --filter @interdomestik/web test:unit --run \
  'src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery.test.ts' \
  'src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery-band.test.tsx' \
  src/lib/cookie-consent.test.ts
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm format:check
pnpm check:modularity-guard
test "$(wc -l < apps/web/e2e/gate/premium-free-start-recovery.spec.ts)" -le 149
pnpm repo:size:check
```

Then on the exact final implementation head:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

The complete three-browser HTTPS recovery proof runs once on the exact runtime head after focused
proof. A later test-only or deterministic size-metadata-only commit may reuse it only when exact
diff attribution proves runtime and browser-spec bytes unchanged.

Codex Security diff scan remains explicitly waived by user instruction. Repo-native
`security:guard`, gitleaks, CodeQL, `pnpm audit`, Sonar and current-head reviewer/security feedback
remain required.

## Writer ceiling and forbidden surfaces

The cumulative implementation ceiling remains exactly the existing 19 paths. This addendum adds
no path. Runtime remediation may touch only already-authorized recovery production/test paths and
the two A1-authorized cookie-consent paths for their separately reviewed defects.

All existing forbidden surfaces remain exact, including:

- `apps/web/src/proxy.ts`;
- canonical routes and every `*-page-ready` marker;
- auth, tenancy, routing, proxy, schema, RLS, billing and server actions;
- consent names, choices, attributes, retention, banner, analytics and telemetry;
- cookies or another persistent primitive for the anonymous recovery record;
- IndexedDB, worker, service worker, `BroadcastChannel`, dependency or reusable storage
  abstraction;
- a production test flag/hook, exported test API or spec seam that survives outside the one
  recovery spec;
- Z620 production execution or Mac Docker;
- another product slice or remaining UI-tree promotion.

Stop if safe coherence requires any forbidden surface, a twentieth writer path, a third task turn,
an arbitrary delay, an unlocked mutation, weakened newest-record protection or activity-based
candidate loss.

## Rollout, rollback and residual risk

Rollout remains the existing one-slice PR. No feature flag, data migration, server deployment,
production release or production data mutation is authorized here.

Before exposure, rollback is removal of the unmerged implementation. After exposure, rollback
must disable only new anonymous writes while retaining locked read/resume/discard and verified
secure promotion for the documented 30-day drain; it must not silently strand a browser copy.

Accepted residual risk is availability-only and is not described as a wall-clock bound. Exact
supported-browser coherence depends on the proven two-task behavior because Web Storage does not
define cross-agent-cluster locking or cache timing. A granted callback whose task source is
delayed or starved can retain the lock until JavaScript resumes; siblings may fail closed after
five seconds. No stale/unlocked mutation or candidate loss is accepted. This residual must be
reported at implementation closeout and rechecked when the supported browser matrix changes.

## Review and approval

This exact artifact requires:

1. SHA-256 and UTF-8 byte count;
2. exact-current GPT-5.6 Ultra review because Opus quota is unavailable;
3. explicit user approval of addendum ID, revision, byte count and SHA-256;
4. one docs-only PR with focused repository checks and required review;
5. merge to canonical `main`, followed by resolver/scorecard refresh;
6. implementation only if canonical authority still resolves exactly `IDA-UI03a4`.

Approval of this addendum does not approve another slice, any forbidden surface or production
release.
