# IDA-DG22 Web Locks Addendum

Status: R2 proposed; exact-byte user approval and canonical merge required before implementation

Revision: `R2`

Historical R1: 17,831 UTF-8 bytes / SHA-256
`ec478df602410c30cc94b4eca384c8fde5ae4bd56da55b1aa7c66aaf56e90424`, approved by
Arben at `2026-07-28T19:20:22Z`. R1 remains valid historical evidence but is not merge-ready
because exact-head GitHub review found that its default HTTP `*.127.0.0.1.nip.io` browser route
could exercise only the fail-closed branch rather than real Web Locks in every required browser.

Addendum ID: `IDA-DG22-A2`

Parent gate: `IDA-DG22`

Parent gate SHA-256:
`baf97ad76a21df381b806403dc50d2b477637e1e58c45c4ca2e16708113ab4a8`

Prior addendum: `IDA-DG22-A1`

Prior addendum SHA-256:
`28bbeabd728e1c5b6d170fc48c287ed4a2edfde945f6e308be883dc076865509`

Sole implementation slice: `IDA-UI03a4`

Classification: design-gate addendum for the existing Tier-3 privacy-sensitive UI slice

Authority base: `6dab9a6fa07182cd451a66eee95238de932de584`

Runtime authorized by this docs-only addendum: `false`

## Decision

Authorize the smallest standards-correct, same-origin serialization primitive for the existing
anonymous draft key: one fixed Interdomestik-namespaced Web Locks resource acquired through
`navigator.locks.request(..., { mode: 'exclusive' }, callback)`.

The lock may be used only around production mutation-capable critical sections for the
already-authorized anonymous recovery record. Each operation makes exactly one non-reentrant outer
lock request; its callback contains the complete synchronous read/validate/compare/mutate
sequence, contains no `await`, and internal storage primitives never reacquire the lock. Only lock
acquisition and scheduling are asynchronous. No draft content, lock state or browser capability
may leave the browser.

This addendum adds no writer path. The cumulative implementation ceiling remains exactly the 19
paths authorized by `IDA-DG22` plus `IDA-DG22-A1`. It is not a replacement goal, a second product
slice, a generic concurrency framework, a worker/storage migration, or architecture expansion
beyond this one key.

## Failure evidence and classification

The last valid implementation checkpoint is clean local head
`2f02bf4877b6a0a2ca22f861bfe498fe1383142f`; it remains unpushed. Focused unit, type, lint, size,
security and earlier browser evidence is preserved subject to the exact files and downstream
proof invalidated by later remediation.

Exact-current senior review proved that the current localStorage comparison is not an atomic
compare-and-swap:

1. two independent same-origin windows can both read record `R`;
2. each can accept its candidate as newer than `R`;
3. either `setItem()` can complete last;
4. the stale candidate can therefore overwrite the newer candidate while both callers report
   success.

The same race exists between an eligible edit and a secure-save/discard/reset removal. Strictly
increasing timestamps and an exact post-write comparison protect sequential discovery but do not
make the read/compare/mutate sequence atomic across agent clusters.

The WHATWG HTML Web Storage standard states that interaction with storage from multiple agent
clusters is not defined and authors are encouraged to assume there is no locking mechanism:
<https://html.spec.whatwg.org/dev/webstorage.html>.

The W3C Web Locks API provides an origin/storage-bucket-scoped coordination mechanism across tabs,
workers and agent clusters, with exclusive mode preventing simultaneous holders:
<https://w3c.github.io/web-locks/>.

Classification: `workflow/gate` plus `scope_expansion_required`. Parent rule 5 says writes are
synchronous and local only, while rule 9, acceptance criterion 6 and the stop condition require
provable newer-record protection across tabs. Repetition cannot close that standards boundary.

The exact-current review also found a separate `product defect`: after a valid local save, an edit
that becomes ineligible can leave the old local record and visible `saved` state while the current
edit is not persisted. That truth defect is already prohibited by parent rule 6 and requires no
new authority. Its valid → invalid → valid remediation remains mandatory.

After R1 approval, exact-head PR `#1475` review thread
<https://github.com/interdomestik/interdomestik/pull/1475#discussion_r3668651583> found a
`workflow/gate` plus `authority evidence gap`: the repository's default
`http://*.127.0.0.1.nip.io` host is not a trustworthy browser origin, so it cannot prove actual
Web Locks success semantics. The existing public cross-browser configuration also excludes this
recovery spec. R1 approval, exact-head checks and all unchanged implementation checkpoints remain
frozen; merge readiness, finalizer disposition and cross-browser evidence are invalidated only
for this gap.

A cheap exact-environment probe on exclusive `interdomestik-z620-staging` first proved that trying
to override the HTTP `Host` header while retaining a loopback URL is rejected by Chromium with
`ERR_INVALID_ARGUMENT`; that mechanism is forbidden rather than browser-special-cased. A second
probe proved the bounded standards-correct route: a task-owned HTTPS reverse proxy on
`ida.127.0.0.1.nip.io`, with an ephemeral one-day SAN certificate and
`ignoreHTTPSErrors:true`, preserved the neutral IDA host and produced
`isSecureContext === true` plus real `navigator.locks.request` in actual Chromium, Firefox and
WebKit. The full-app canary then returned HTTP 200 and visible `free-start-intake-shell` on `/en`
with the same origin and capability assertions in all three browsers. Fresh resource preflight
observed 45 GiB free disk and 25,030 MiB available memory; the exclusive runner was online,
idle and had no conflicting heavy-job lease.

## Exact amended behavior

1. One fixed, non-content-bearing lock resource name is used for the one anonymous draft key. The
   name must be Interdomestik-namespaced, constant and free of tenant, identity, incident or draft
   values.
2. Before requesting the lock, each candidate captures its normalized fingerprint, actual supplied
   wall-clock time and local generation. Every production write then performs
   read → parse/validate → recheck current generation/eligibility → compare → `setItem()` inside
   one exclusive callback. Internal read/compare/write primitives do not request the lock.
3. Every production removal for discard, deliberate reset, invalid-record cleanup or verified
   secure-save promotion performs read → parse/validate → compare/identity check → `removeItem()`
   inside one outer exclusive callback. Any production read path that may clean malformed, expired
   or otherwise invalid data—including initial load, storage-event reconciliation, resume and
   promotion reads—must use one mutation-capable critical section or a pure non-mutating
   inspection followed by one separately locked conditional cleanup.
4. A candidate that is older than the valid record observed after lock grant must not overwrite
   it. If the older candidate is granted first, it may commit only while still current locally;
   the later candidate may then replace it. If the newer candidate is granted first, the older
   candidate reports conflict/non-save. Both grant orders must leave the newest valid record
   stored, and a promise completion may publish UI state only for its still-mounted current
   generation.
5. Secure-save removal may delete only the exact eligible fingerprint whose server lifecycle
   completed `saving` → `saved` with a non-null active draft id. A concurrent later eligible edit
   survives and becomes the offered recovery copy.
6. Pending acquisition is bounded to 5,000 ms and uses an abort signal. A new generation aborts or
   supersedes older pending work. Unmount aborts pending requests and marks every later completion
   UI-inert. `AbortError`, timeout, accessor/request failure and callback rejection are caught and
   fail closed. Abort cancels only a still-pending request; after grant it is ignored, so the
   synchronous callback rechecks mounted generation and eligibility before its first mutation.
   The request promise is awaited/caught before reporting success.
7. Missing, inaccessible, throwing or rejected Web Locks support makes anonymous recovery
   unavailable and fail closed. The page and organizer remain usable; no unguarded mutation,
   false saved state or silent fallback is allowed.
8. There is no localStorage spinlock, memory mutex, `BroadcastChannel` protocol, worker,
   IndexedDB fallback or best-effort unlocked path.
9. After a valid save, if the current edit becomes ineligible, recovery copy must stop claiming
   that the current edit is saved. The last valid local copy may remain available without being
   mislabeled. The ineligible transition supersedes/aborts every pending eligible write. A later
   eligible correction starts a new generation and resumes locked saving.
10. Existing schema, TTL, strict parsing, content limits, medical screening, normalized
    fingerprint, resume/discard semantics and four-locale product truth remain unchanged except
    for truthful ineligible-current-edit status.
11. A temporary lock/storage denial may report recovery unavailable but must not poison later
    eligible interaction. After availability returns, reconciliation under the lock must restore
    the unchanged valid record or offer a newer record written by another tab before any new write.
    A later deliberate eligible edit may retry only from that reconciled state; no denied candidate
    is replayed or labeled saved before its locked write succeeds.
12. The existing bounded future-clock rejection remains exact. A record timestamp more than
    60,000 ms ahead of the supplied current time is invalid and any cleanup is locked/conditional;
    the exact `now + 60,001 ms` boundary must be proven. If an existing record at
    `now + 60,000 ms` would require a monotonic candidate at `now + 60,001 ms`, the writer must not
    persist or report success until actual supplied wall-clock time makes the candidate valid.

## Test-first evidence

The first implementation mutation after canonical addendum merge is RED-only inside existing
writer-map test paths.

### Trustworthy-origin cross-browser contract

The configured proof for this slice is the existing recovery spec executed through an exact,
task-owned ephemeral Playwright configuration on exclusive `interdomestik-z620-staging`. It must:

1. start the canonical app on a task-isolated loopback port;
2. create a task-temporary one-day self-signed certificate whose SAN is exactly
   `ida.127.0.0.1.nip.io`, without installing it into any machine or browser trust store;
3. expose the app through a task-isolated HTTPS reverse proxy at
   `https://ida.127.0.0.1.nip.io:<task-port>`, preserving that neutral `Host` value upstream and
   setting only truthful `x-forwarded-proto:https` / `x-forwarded-host` evidence headers;
4. configure actual Chromium, Firefox and WebKit projects with `ignoreHTTPSErrors:true`, an exact
   generic non-IDA project `baseURL`, the HTTPS neutral-IDA origin as the spec's explicit IDA
   target, the exact recovery spec as their only `testMatch`, zero retries, no inherited tenant
   header and no policy skip;
5. propagate the project `ignoreHTTPSErrors` value inside writer-map path 16 to every manually
   created `BrowserContext`, including anonymous and no-JavaScript contexts; this must be
   spec-local and may not change the shared anonymous-context helper or add a twentieth path;
6. assert before every recovery-enabled IDA path that the visible route returns 200, the
   `free-start-intake-shell` marker is visible, `location.origin` is the exact HTTPS neutral IDA
   origin, `window.isSecureContext === true` and `navigator.locks.request` exists;
7. run the complete recovery spec, including every same-context held-lock barrier, in all three
   projects; recovery-enabled paths use the HTTPS IDA target, while the existing generic-tenant
   negative remains on the configured non-IDA origin and must still prove recovery absent; and
8. record the ephemeral driver/config bytes, SHA-256, commands, browser versions, app head, proxy
   authority and results in the task evidence ledger, then remove the certificate, key, proxy,
   config and report artifacts from active task/run directories through exact recoverable task
   cleanup.

The existing authorized E2E path may accept the exact HTTPS origin/scheme from task-scoped
environment input instead of hard-coding HTTP. This is evidence wiring inside writer-map path 16,
not route authority. The repository Playwright configuration, `apps/web/src/proxy.ts`, machine
trust store, DNS, `/etc/hosts`, dependencies and workflows remain unchanged. A `Host` override,
plain HTTP for a recovery-enabled IDA path, a loopback-only canary, isolated browser contexts, a
fail-closed-only result or a configuration that does not collect this spec in all three browser
projects does not satisfy the proof.

### Atomic two-context proof

The existing recovery browser spec must create two actual same-origin pages/windows inside one
Playwright `BrowserContext` and its default shared storage bucket. Separate isolated browser
contexts do not satisfy this proof. Both pages must observe the same seeded record `R`, request the
same fixed lock name and use a deterministic held-lock barrier. Proof must show:

1. the second callback cannot enter while the first holds the exclusive lock;
2. older-first then newer and newer-first then older grant orders both retain the newest record;
3. each caller's result is truthful for the record/generation observed at its own completion;
4. the latest valid record is offered for recovery;
5. the result repeats in configured Chromium, Firefox and WebKit lanes.

Additional same-context two-page held-lock barriers must cover both orderings for:

1. verified secure-save removal versus a later eligible edit;
2. discard and deliberate reset versus a later eligible edit;
3. conditional cleanup of malformed JSON, empty string, expired data and `now + 60,001 ms` data
   versus a concurrent valid write.

In every removal/cleanup race, a later valid edit survives, a removal never deletes a different
record, and neither caller reports a false state.

### Fail-closed and truth proof

Focused unit/component/browser evidence must prove:

1. missing `navigator.locks`, a throwing accessor and a rejected request keep the organizer usable
   and never mutate storage through an unlocked path;
2. valid → invalid changes remove the current `saved` claim without deleting the last valid copy;
3. invalid → valid correction resumes saving and reports saved only after the locked write
   succeeds;
4. lock wait, storage failure, conflict, discard/reset and secure-save success/failure cannot
   produce stale saved/resume copy;
5. the existing global-localStorage-denial, expiry, malformed, medical, category/issue mismatch,
   shared-member neutrality and cold-return journeys stay green.
6. an empty-string value is treated as present malformed data and removed under the lock; only
   `getItem() === null` means the key is absent.
7. temporary lock/storage denial followed by restored availability reconciles both an unchanged
   valid record and a newer record written by another page before a new eligible edit can save;
   stale hidden `knownRecord`/offer state cannot conceal or overwrite either copy.
8. a record at `now + 60,001 ms` is rejected and conditionally removed under the lock, without
   deleting a valid record concurrently written by another page.
9. with actual time fixed and an existing record at exactly `now + 60,000 ms`, the next writer
   cannot derive/persist `now + 60,001 ms` or report success against the derived revision time.
10. a deterministic held-lock component lane covers rapid A → B edits, eligible → ineligible,
    discard/reset, unmount, request rejection, timeout and `AbortError`. Superseded pending
    callbacks are aborted or no-op on grant; late promise completions never mutate UI for an old or
    unmounted generation.

Focused proof:

```bash
pnpm --filter @interdomestik/web test:unit --run \
  'src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery.test.ts' \
  'src/app/[locale]/components/home/free-start-intake-shell/anonymous-draft-recovery-band.test.tsx'
pnpm --filter @interdomestik/web test:unit --run \
  src/lib/cookie-consent.test.ts \
  src/components/guest-intent/premium-free-start-organizer.test.tsx
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm --filter @interdomestik/web test:e2e -- \
  e2e/gate/premium-free-start-recovery.spec.ts
pnpm check:modularity-guard
pnpm repo:size:check
```

The ordinary focused command remains useful for same-browser regression, but merge evidence must
also include the exact trustworthy-origin three-browser invocation defined above. Browser proof
is one Z620 heavy lease and is rerun only when the implementation head, recovery spec, ephemeral
driver/config, browser image/version or app/proxy environment changes.

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

The cumulative implementation ceiling remains exactly 19 paths. This addendum authorizes Web
Locks remediation only inside already-authorized recovery implementation/test/E2E paths. Any
twentieth path stops for fresh authority.

Task-owned ephemeral certificate/key, HTTPS reverse-proxy driver, Playwright configuration and
reports under the runner's exact temporary evidence directory are not repository writers. They
must be content-addressed in the evidence ledger and moved out of active task/run directories to
an exact recoverable Trash location at closeout. Final Trash purge is not authorized by this
addendum. These artifacts do not authorize changes to repository configuration, workflow, proxy,
DNS or machine trust.

The authority PR itself may update `scripts/repo-size-budget.json` only to the exact deterministic
inventory required after adding this document. That file is already parent writer-map path 17;
the metadata-only sync adds no runtime behavior, implementation path or separate authority.

All parent-gate and `IDA-DG22-A1` forbidden surfaces and non-goals remain exact. In particular this
addendum does not authorize:

- `apps/web/src/proxy.ts`, routes, page-ready markers, auth, session, tenancy, schema, RLS,
  database, billing, membership or claim behavior;
- a new package, dependency, Web Locks polyfill, service/shared worker, IndexedDB,
  `BroadcastChannel`, storage schema/key/TTL migration or reusable concurrency abstraction;
- server coordination, content synchronization, cross-device recovery, telemetry, analytics,
  logging, provider contact, deployment, release, runner or production mutation;
- changing cookie consent, OTP, secure-draft server actions or shared member intake behavior;
- `IDA-UI03a2`, `IDA-UI03b`, `IDA-UI03a0c`, `IDA-UI05a`, PR `#1455`, `IDA-CD-DG02`,
  `IDA-CD02`, or any second slice.

## Runtime and runner authority

This docs-only addendum keeps `runtime_authorized:false`. Implementation may resume only after:

1. Arben approves the exact addendum bytes/SHA-256;
2. the docs-only authority PR passes focused checks/review and merges on canonical main;
3. AI OS/Brain refresh and resolver select exactly `IDA-UI03a4`;
4. a fresh runtime receipt binds the same 19-path ceiling and this exact addendum hash.

Runner allocation remains unchanged. Mac is for operator/editing/light proof, GitHub-hosted Ubuntu
for lightweight production evidence, and exclusive `interdomestik-z620-staging` for configured
staging-heavy/CD/browser proof. No production execution moves to Z620.

Before the trustworthy-origin proof, Z620 must freshly satisfy 30 GiB disk, 8 GiB available
memory, online exclusive-label and no-conflicting-heavy-lease floors. The HTTPS proxy and
certificate are browser-test evidence only: they may not bind a public interface, contact Vercel,
mutate an alias/provider, deploy, install a root certificate or change production execution.

## Rollout and rollback

This is same-origin browser-only behavior with no data migration, backend state, feature flag,
provider call or deployment topology change.

Rollout is limited to the already-authorized public organizer composition. Exact-browser proof must
pass before merge. If configured WebKit, Firefox or Chromium lacks the required semantics,
recovery fails closed and the slice stops rather than falling back to unlocked storage.

Before any browser exposure, code rollback may revert the Web Locks/async/truth remediation with
no residual record. After any browser record has been exposed, rollback must never restore an
unlocked path or strand existing notes. Safe mitigation:

1. disable only new anonymous writes while retaining locked read/resume/discard and verified
   secure-promotion support;
2. preserve truthful recovery UI for the existing 30-day logical drain, or use a separately
   approved migration/tombstone;
3. remove recovery UI/code only after residual-key disposition is proven.

A user who never revisits may retain an inert physical localStorage value until browser/site-data
cleanup because localStorage has no native TTL. The application makes no remote-deletion claim.
Existing verified-email secure save remains available; no server cleanup is required.

## Review

Claude Opus quota is exhausted. Per Arben's instruction, GPT-5.6 Sol Ultra is the required senior
route for the exact addendum and the remediated complete implementation diff. A stale or partial
review is invalid. Model review remains advisory and does not replace repository or GitHub gates.

Review must cover the standards boundary, lock scope/name, atomic mutation graph, unmount/queue
races, fail-closed behavior, valid → invalid → valid product truth, secure-save handoff, full
dependency wiring, trustworthy-origin transport, exact three-browser spec collection, ephemeral
artifact custody/cleanup, test determinism, privacy and the unchanged 19-path ceiling.

## Stop conditions

Stop before implementation begins if:

- the exact addendum hash is not user-approved and canonically merged;
- runtime authority does not bind exactly `IDA-UI03a4`, this addendum and the existing 19 paths;
- `navigator.locks` is missing or cannot prove exclusive cross-agent serialization in any
  configured browser;
- the trustworthy-origin capability/app canary cannot satisfy the exact HTTPS neutral IDA,
  route-marker, secure-context and Web Locks prerequisites in any required browser;
- the evidence requires a `Host` override, plain HTTP for an IDA recovery-enabled path,
  repository Playwright/proxy/workflow changes, shared-helper mutation, machine trust-store
  installation or a twentieth writer path.

Stop before implementation merge if:

- the full recovery spec is not collected in actual Chromium, Firefox and WebKit, any
  recovery-enabled path does not use the exact HTTPS neutral IDA origin, the generic-tenant
  negative does not remain on a non-IDA origin, or any lane proves only fail-closed behavior;
- the ephemeral driver/config bytes and SHA-256 are not recorded, or the exact active-artifact to
  recoverable-Trash cleanup receipt is missing;
- any mutation can reach localStorage outside the exclusive lock;
- lock failure falls back to an unlocked write/removal or reports saved;
- temporary denial permanently poisons later eligible recovery or replays an uncommitted candidate;
- a pending or late callback mutates storage/UI for a superseded or unmounted generation;
- nested/reentrant acquisition can deadlock the exclusive lock;
- a stale write can overwrite a newer valid record;
- secure-save/discard/reset can remove a later eligible edit;
- valid → invalid → valid UI truth cannot be represented without false saved/loss claims;
- the fix needs a twentieth path, dependency, worker, storage migration or forbidden surface;
- focused, mandatory, exact-browser, current-head reviewer, Sonar, CodeQL, security or finalizer
  evidence is not valid on the exact reviewed implementation head.

This addendum freezes and reuses every valid checkpoint. It authorizes only the smallest
standards-correct coordination primitive and truthful-state remediation for the same
`IDA-UI03a4`; it does not restart verification, reopen completed work or promote a second slice.
