---
title: IDA-DG32 UI03a2-B4 Re-entry Existing Claim Truth
date: 2026-08-10
status: prospective_review_accepted_exact_hash_candidate
authority: advisory_until_exact_approval_and_merged_repo_promotion
runtime_authorized: false
promoted_slice: IDA-UI03a2-B4
risk_tier: 3
base_sha: ea7c76d2d96a3644fadd06c5920478bb5faa8a4c
owner: product + privacy + security + accessibility + qa
---

# IDA-DG32 — UI03a2-B4 re-entry existing-claim truth

## Decision boundary

This is one prospective docs-only authority candidate. It proposes exactly one product
slice:

`IDA-UI03a2-B4 — when the verified owner resumes a saved Free Start draft that already
created a canonical claim through B1, show the existing canonical claim link without
requiring another submit action`.

This candidate is not repository authority and grants no runtime authority. It must be
approved by exact UTF-8 byte count and SHA-256, reviewed, merged through one docs-only
authority PR, published through the governed task path, and selected alone by the
canonical resolver before a separate exact runtime receipt can be prepared. Product code
must not be written before that runtime receipt is separately approved.

The design-gate mutation itself is Tier 0. The prospective product slice is classified
as Tier 3 because it introduces a fresh authenticated, owner- and tenant-scoped claim
lookup and therefore touches privacy/PII access semantics even though it changes no auth,
tenant, route, schema, RLS, claim-writer, event, audit, billing or provider contract.

## Verified starting state

- Canonical main and `origin/main` are equal at
  `ea7c76d2d96a3644fadd06c5920478bb5faa8a4c`; the canonical main worktree is clean.
- AI OS observation `e33c3e053c637e23e5caf405de34f53646afd5c2870a1ebd7d352982d3aa165b`
  passed check-first with Brain current, Integrity clear, zero blocking contradictions,
  M1 verified current, M2/M3 terminal, M4-M6 no qualified candidate and M7 no authorized
  enrollment. Interdomestik reports no active slice and runtime not authorized.
- The canonical resolver returns `blocked_requires_current_authority`, reason
  `umbrella_without_concrete_promoted_slice`, `activeSlice=null`, from the final marker in
  `docs/plans/current-tracker.md`.
- B1, B2 and B3 are complete. B1 created canonical submitted claims from complete saved
  drafts using a deterministic claim primary key; B2 and B3 corrected post-submit and
  pre-submit truth. No completed slice is reopened.
- A detached non-main worktree at
  `/Users/arbenlila/.codex/worktrees/c8b4/interdomestik-crystal-home` contains user-owned
  changes to `pnpm-lock.yaml` and `pnpm-workspace.yaml`. It is not part of this candidate,
  must not be deleted or overwritten, and blocks authority-branch creation until its owner
  resolves or explicitly authorizes a lossless disposition.
- Brain discovery was current but off-target twice, first returning historical decisions
  and then historical promotion gates. Under the bounded recovery rule no further Brain
  retrieval is allowed for selection. Repository authority and current source govern.

## Why this is the smallest valuable continuation

B1 intentionally left one visible gap: after a successful submit, its success link lives
only in client component state. The saved draft itself survives exit and re-entry, and the
canonical claim survives, but reopening the same saved draft renders the submit action
again. Pressing it is server-idempotent and returns the same claim, yet it asks the user to
repeat an action that has already succeeded and can look like a second submission.

The B1 gate explicitly deferred source badges and searchable `origin_ref_id` linkage. B3
explicitly excluded success-state and claim-link persistence after re-entry. This candidate
selects only the smallest part of that deferred space: an exact same-owner re-entry lookup
for the already-persisted deterministic B1 claim identity. It does not create a generic
source badge, searchable origin, list projection, dashboard redesign or new writer.

Rejected alternatives:

1. Persist `origin='free_start_draft'` and `origin_ref_id` through the canonical submit
   writer. Rejected for this slice because it changes the shared claim writer and durable
   source-link contract and requires broader migration/backfill/consumer proof.
2. Add a claim badge to every saved-draft list row. Rejected because it creates a list-wide
   projection/N+1 or join contract and a second UI surface.
3. Change only success copy. Rejected because B2 already made the copy truthful and copy
   cannot survive component remount.
4. Auto-navigate to the claim. Rejected because it removes deliberate user control and
   changes route-transition behavior.
5. Reuse the create action as an automatic mount effect. Rejected because a read must never
   be capable of creating a claim.

## One user outcome

Primary user: the verified default-public-tenant owner who resumes a vehicle/property
saved Free Start draft on the existing canonical member intake surface, whether the owner
remains access-active or is now in the existing manager-only/inactive state. This retains
the exact neutral-home/access-tenant boundary already enforced by B1.

Outcome: if that exact owner and tenant already have the canonical B1 claim deterministically
derived from the resumed draft id, the resumed preview shows the existing canonical claim
link automatically. The user does not press Submit again. The source draft remains an
independent editable/deletable record and no claim state changes.

Numeric target: reduce deliberate submit activations needed after re-entry to reach the
already-created claim from baseline `1` to target `0`. The focused browser test measures
this by leaving the intake, reopening the same saved draft and asserting that the canonical
claim link appears while the submit action is absent and the create action is not invoked.

## Entry, transition and exit state

### Entry

- Existing canonical member intake route and neutral-host authority are unchanged.
- Existing server-governed draft lifecycle has resumed one owner-visible persisted draft
  and supplied its UUID to the preview.
- The client supplies no owner, tenant, membership, claim, claim number, origin, route,
  branch, agent or status selector.
- The draft may be active-submit-eligible, manager-only/inactive, dirty or later edited.
  Those properties do not alter an already-created claim.

### Transition

1. A dedicated read effect runs only for a syntactically valid persisted draft UUID. The
   existing `activeDraftId:activeDraftVersion` key remounts the preview after each successful
   save, so the bounded lookup runs once for each mounted draft version, not once per route
   session. It never retries automatically.
2. The server action strictly parses that UUID, resolves the authenticated action context,
   and verifies exact session tenant, actor and fresh Free Start context equality using the
   same authority seam as B1.
3. It derives the exact B1 claim primary key from the ordered tuple
   `[tenantId, actorUserId, normalizedDraftId]` using the existing SHA-256/JSON algorithm.
   The draft UUID is lowercased before hashing. Existing B1 claims remain compatible because
   successful B1 resume used the stored generated lowercase text id; mixed-case client input
   could not match that stored text row and therefore could not create a B1 claim.
4. It performs one bounded claim read by exact primary key plus explicit tenant and owner
   predicates and returns only id and validated claim number.
5. The lookup never calls the draft resume writer, canonical submit writer, idempotency
   reservation, event/audit/notification path, cache revalidation or any mutation.
6. A stale response is ignored after draft id/version change or component unmount.

### Exit

- Found: the existing B2 success truth and canonical `goToClaim` link render; the submit
  control is absent.
- Absent: the existing B1 eligibility logic renders the enabled or disabled submit state
  unchanged.
- Lookup unavailable/malformed/authority mismatch/invalid claim number: no claim link or
  existence signal renders. The existing explicit idempotent submit path remains available
  only when its original eligibility rules permit it.
- No state writes, route transition, automatic navigation, event, audit, notification,
  claim lifecycle change or draft mutation occur during lookup.

## Frozen identity and authority contract

The source of truth for the returned link is the persisted claim row identified by the
same deterministic primary-key contract B1 already uses for creation and recovery. This
gate promotes that identity only as a same-owner, same-tenant, single-active-draft re-entry
lookup. It does not promote generic source provenance.

The server must require all of the following before returning a link:

- authenticated session actor id exists;
- action tenant equals session tenant;
- fresh Free Start context owner equals the session actor;
- fresh context home/access tenant equals the action tenant under the existing B1 boundary;
- input is one strict UUID and contains no extra fields;
- derived claim id matches one row selected by id, tenant id and owner user id;
- claim number is non-null and passes the canonical claim-number validator.

No row or malformed row returns the same bounded `claim:null` result. Raw database errors,
claim fields, title, category, facts, other-owner existence and tenant state never cross the
action boundary. A cryptographic collision is treated as a residual theoretical risk; the
explicit tenant/owner predicates and canonical number validation still apply.

This candidate changes no RLS policy and does not rely on RLS alone. The existing runtime
role posture requires explicit tenant and owner predicates. `apps/web/src/proxy.ts`, route
guards, session layering and tenant resolution remain read-only and unchanged.

## UI and accessibility state machine

`idle -> checking -> found | not_found`, with result provenance
`background_lookup | user_submit`.

- `idle`: no lookup for missing or malformed draft id.
- `checking`, currently submit-eligible: render the existing submit label as a disabled
  `aria-busy` control. Do not announce success and do not show a claim link before return.
- `checking`, currently ineligible or manager-only: preserve the existing B3 disabled
  control, `submitDisabled`, `aria-describedby` and `submitExplanation` byte-for-byte. The
  lookup adds no temporary submit affordance for an inactive, dirty or incomplete state.
- `found`: reuse existing localized B2 success and `goToClaim` strings. Render the current
  focusable canonical claim link and no submit button. A background lookup result may use
  the current polite status announcement once but must not move focus; a user-initiated
  successful submit retains the existing focus-to-success behavior. `found` is a complete
  presentation override: suppress the ineligible `copy.truth`, disabled submit control and
  `submitExplanation` so manager-only or later-dirty drafts cannot show contradictory
  submitted/not-submitted truths together.
- `not_found`: absent, malformed-row, authority-failure and unavailable/error outcomes are
  intentionally indistinguishable at the UI boundary. Restore the exact current B1/B3
  eligibility and disabled explanation. A conscious submit remains safe because B1 returns
  the existing claim on retry.

The first mount does not steal focus. The hook carries result provenance so the existing
focus effect runs only for `user_submit`, never for `background_lookup`. The background
link remains in normal reading order and its existing polite status semantics may announce
the restored truth without focus theft. The effect is cancelled on unmount or draft switch
so draft A cannot render claim B or vice versa. A save-induced version remount performs one
new lookup; while it runs, the eligible/ineligible branch truth above remains authoritative.
Existing keyboard, 390 px, 200% zoom, text-spacing, forced-colors and reduced-motion
contracts remain unchanged.

The existing `data-testid="claim-created-success"` is retained for compatibility even when
the claim was found rather than created in this component session. The reused B2 sentence
begins with the truthful past-tense `Case submitted`; it is less explicit than new re-entry
copy but is accepted to keep locale bytes unchanged. Any later copy improvement is a
separate slice.

No new locale key or product copy is authorized. Existing EN/SQ/MK/SR B2 success and claim
link labels are reused byte-for-byte. German remains excluded.

## Exact writer map

Production paths — maximum four, frozen:

1. `NEW apps/web/src/actions/claims/saved-draft-claim-identity.ts`
   - Owns the deterministic B1 claim-id derivation and exact tenant/owner claim read.
   - Extracted from the existing action to avoid growth and permit one read-only consumer.
2. `MOD apps/web/src/actions/claims/create-from-saved-draft.ts`
   - Imports the extracted identity/read helper without changing creation behavior.
   - Adds one strict read-only exported action for existing-claim lookup.
   - Must remain at or below its current 149 lines. If extraction plus the new action cannot
     meet that ceiling without changing the B1 writer contract, implementation stops.
3. `NEW apps/web/src/components/claims/claim-draft-intake/use-saved-draft-claim.ts`
   - Owns lookup lifecycle, stale-response cancellation, result provenance and the complete
     existing B1 client submit lifecycle: pending guard, failure, success and exactly-once
     deliberate submit. The canonical server writer remains unchanged.
4. `MOD apps/web/src/components/claims/claim-draft-intake/dormant-preview.tsx`
   - Consumes the hook and renders checking/found/not-found states using existing copy.
   - Must finish below its current 149 lines; logic extraction must make it smaller.

Focused test/spec paths — exactly five, frozen:

1. `NEW apps/web/src/actions/claims/saved-draft-claim-lookup.test.ts`
2. `NEW apps/web/src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`
3. `MOD apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`
4. `MOD apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.boundary.test.ts`
5. `MOD apps/web/e2e/gate/member-claim-draft-intake.spec.ts`

The E2E file must remain at or below its current 150 lines by consolidating the duplicated
manage-open/resume setup around its current final re-entry block. Its current terminal
assertion that `claim-draft-submit` is enabled after re-entry is explicitly authorized to
invert: the replacement must prove the same canonical claim link is present,
`claim-draft-submit` is absent and the source draft remains listed. This is an intended B4
behavior change, not weakening. Existing B1 double-click/failure/focus proof in
`saved-draft-submit.test.tsx` must be updated for the lookup module mock and remain green;
B2 copy and B3 ineligible truth assertions remain byte-equivalent.

The boundary test changes are also exact and frozen: add the new hook to the permitted
component graph; retain the existing `/callback/i` deny pattern and prove the hook does not
introduce `useCallback`; repoint the direct database-access guard from the extracted code in
`create-from-saved-draft.ts` to `saved-draft-claim-identity.ts`; and retain every existing
line-ceiling and forbidden-import guard. The unmodified
`claim-draft-intake.test.tsx` remains a required green dependency collector, not a writer
path. If it requires an edit, that is a sixth test/spec path and the slice stops.

Conditional metadata path — not product behavior:

- `scripts/repo-size-budget.json` only if deterministic staged-tree inventory requires the
  canonical sync. It is not a product outcome and cannot authorize another file.

Every new production file stays below 150 lines. Existing production files must be smaller
or no larger than their 149-line base. Discovery of any fifth product path, new locale path,
new shared consumer or need to enlarge an existing file stops the slice for a fresh gate.

## Contract graph

Nodes:

- `N1` existing member claim-draft preview entry.
- `N2` `use-saved-draft-claim` client lookup plus existing deliberate-submit controller.
- `N3` strict existing-claim server action.
- `N4` existing authenticated action/session and fresh Free Start context resolver.
- `N5` deterministic B1 identity helper.
- `N6` canonical `claim` table exact row read.
- `N7` existing B1 canonical create action, unchanged fallback writer.
- `N8` existing B2 success/link presentation.
- `N9` focused action/component/boundary tests.
- `N10` one existing member claim-draft E2E collector on governed Z620/CI.

Edges:

- `N1 -> N2`: mounted active draft id starts one bounded lookup lifecycle.
- `N2 -> N3`: calls only the strict draft UUID lookup action.
- `N3 -> N4`: resolves actor, tenant and fresh context; mismatch fails closed.
- `N3 -> N5`: derives the exact stable B1 claim identity.
- `N5 -> N6`: reads one id+tenant+owner row and canonical claim number.
- `N6 -> N3`: returns found or indistinguishable null; no mutation edge exists.
- `N3 -> N2`: returns bounded claim identity or null.
- `N2 -> N8`: found renders existing success/link without focus theft and suppresses the
  draft-only truth banner, disabled control and submit explanation.
- `N2 -> N7`: only a later deliberate click on the existing eligible submit state may call
  the unchanged writer; lookup never calls it. The hook extraction preserves B1's
  exactly-once pending guard, failure retry and user-submit focus provenance.
- `N9 -> N2/N3/N4/N5/N6/N7/N8`: focused proof covers authority, no-write and UI states.
- `N10 -> N1/N8`: browser proof covers exit/re-entry and zero repeated submit activation.

Closure:

- Callers: exactly one UI hook calls the lookup; the existing create action is the only
  writer and is not called automatically.
- Shared consumers: none beyond the one preview entry.
- Read/write/delete: one claim read; zero lookup writes/deletes; existing deliberate B1
  create remains unchanged and independently tested.
- Mount/error paths: eligible and ineligible initial check, found, not-found,
  stale response after unmount, draft switch, save-induced version remount and explicit
  submit are all specified.
- Capability requirements: authenticated context and governed Z620 browser lane only.
- Test collectors: action, hook/component, boundary and one existing E2E spec.
- Baseline ownership: B1 owns deterministic creation/idempotency, B2/B3 own copy, existing
  draft lifecycle owns save/resume/edit/delete, and this slice owns only re-entry lookup.

## Acceptance matrix

All required tests are fail-closed; a skipped required case is failure.

1. Strict input: malformed UUID, extra fields and missing input return no claim and perform
   no session-sensitive database read.
2. Authority: missing session, session/action tenant mismatch, owner mismatch and access
   tenant mismatch return no claim and reveal no existence detail.
3. Exact read: query contains exact deterministic id, tenant and owner predicates with
   limit one; RLS is not the sole filter.
4. Valid found: only id and canonical validated claim number return.
5. Invalid/absent/error: absent row, null/malformed claim number, authority failure and
   database/action error all collapse to the same `not_found` client state and expose no
   link, raw error, title, facts, tenant or owner state.
6. No mutation: lookup does not call draft resume/create/update/delete, submit core,
   idempotency reservation, event, audit, notification or cache revalidation.
7. Legacy compatibility: a claim created by the merged B1 lowercase stored-id algorithm is
   found without backfill, schema update or origin fields. Fixed vectors cover lowercase
   legacy input and mixed-case UUID normalization to the same derived identity.
8. Initial UI: a valid eligible persisted draft renders one disabled busy submit control
   until lookup resolves. A valid ineligible/manager-only draft preserves the existing B3
   disabled label and explanation during lookup. Neither branch renders success early.
9. Found UI: active and manager-only/inactive default-public-tenant owner states both render
   the existing success and canonical claim link, with no submit control and no automatic
   navigation. The found presentation suppresses `copy.truth`, the disabled draft control
   and `submitExplanation`, so submitted and not-submitted truths never render together.
   Background discovery may announce the restored status once but does not move focus;
   user submit success still does.
10. Not-found UI: current active complete/saved/clean eligibility enables submit; current
    dirty/incomplete/missing/manager-only states remain disabled with B3 truth.
11. Unavailable UI: unavailable, authority-failure and malformed outcomes are
    indistinguishable from an absent row. No false success renders; explicit B1 submit
    remains possible only under its existing eligibility and remains idempotent.
12. Race/UI isolation: a late response after draft A unmount cannot render in draft B; a
    lookup and deliberate submit cannot produce duplicate client calls. Found-then-save
    version remount performs exactly one fresh lookup, preserves branch truth while pending
    and returns the same link without another deliberate submit.
13. Re-entry E2E: create one canonical claim, leave the intake, reopen the same retained
    draft in a fresh navigation, observe the same canonical link without clicking Submit,
    and confirm the source draft remains present.
14. Regression: existing B1 double-click/response-loss/user-submit-focus behavior, B2
    success truth, B3 disabled availability truth and canonical claim page link remain
    green. B4 adds only a read affordance to B3's manager-only state; it does not enable
    submit or alter B3 eligibility. When a claim is found, the complete success presentation
    override described in item 9 is authorized to replace B3's draft-only banner/control/
    explanation while eligibility itself remains unchanged. That override and the current
    E2E re-entry submit-enabled assertion inversion are the only authorized UI behavior
    changes.
15. Scope: exact frozen paths only; protected paths, locales, schema, migrations, RLS,
    claim writer, routes, auth and deployment have zero diff.

Focused commands are derived after exact runtime approval, but the expected first lanes are
the two new Vitest files, the boundary test, focused member claim-draft E2E, modularity,
DB-access guard, architecture/scope and repository-size checks. Final repo policy remains
`pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`; heavy commands run only through
the governed controller. Exactly one full exact-final-head CI E2E authority lane completes.
No evidence reruns without changed head/surface/environment or substantive remediation.

## Highest-risk cases

1. Foreign existence leak: controlled by normalized derived actor-bound id plus explicit tenant/owner
   predicates and indistinguishable null results.
2. Automatic write on mount: controlled by a separate read-only action and tests proving
   zero submit/mutation dependencies.
3. Stale cross-draft result: controlled by hook cleanup/generation binding and draft-switch
   tests.
4. False success from malformed claim row: controlled by canonical claim-number validation.
5. Submit flash/double action: controlled by eligibility-specific checking truth until
   lookup resolves and current B1 client/server idempotency afterward.
6. Inactive-member overclaim: found only proves an existing submitted case. It does not
   claim active membership, coverage, acceptance, payment or eligibility for new submit.
7. Deterministic identity drift: helper extraction must be byte/behavior-equivalent and
   existing B1 identity/recovery tests remain green.
8. File-ceiling pressure: the hook intentionally absorbs B1's existing client submit state,
   pending guard, failure and success logic so the new states do not grow the 149-line
   component; existing B1 submit tests are the regression guard. Helper/hook extraction
   must keep both touched 149-line production files no larger, including the server action;
   no incidental broad refactor is allowed.

## Privacy, security, abuse and retention

- Returned data is limited to claim id and validated claim number for the authenticated
  owner and tenant. No claim facts, category, title, description, documents, status history,
  other owner, staff, agent or tenant data are returned.
- Arbitrary UUID probing can only derive candidate ids under the attacker's own actor and
  tenant tuple; the exact owner predicate prevents cross-owner disclosure. The read action
  has no dedicated rate limiter: `runAuthenticatedAction` supplies auth/tenant/RBAC but not
  throttling. This is accepted for one own-actor primary-key read per id/version mount, with
  no automatic retry; tests prove one call per mount. A public/anonymous action is not added.
- No new PII is persisted, logged, cached, emitted, indexed or sent to reviewers. The
  action must not log the draft UUID or claim number on expected null/error paths.
  Existing `runAuthenticatedAction` Sentry user/tenant scope is still set for each action
  call; this is existing behavior and not a new data field or logging contract.
- Existing draft and claim retention/deletion remain independent. Deleting the draft does
  not delete the claim. No reverse lookup after source deletion is introduced.
- No feature flag is required because lookup failure degrades to current B1 behavior and
  rollback is code-only.

## Performance, resilience and operations

- One extra server round trip and one primary-key claim query occur for each persisted draft
  id/version preview mount, including a save-induced version remount; no list-wide query,
  background polling, retry loop or N+1 behavior is introduced.
- Query result cardinality is zero or one. Target server lookup p95 is below 250 ms in the
  focused environment; no new latency telemetry or production alert is justified for this
  bounded read.
- Network/database/action failure renders no false success and leaves the deliberate
  idempotent submit path intact. No retry loop runs automatically.
- Existing Sentry/error handling must not receive raw claim/draft content. Unexpected action
  exceptions are bounded at the client and do not trigger repeated calls.
- Support can reproduce using the existing owner draft and claim routes; no admin/support
  diagnostic, runbook, queue or operator tool changes are authorized.

## UI/UX benchmark, observed 2026-08-10

Official current observations:

1. Progressive's official claim-reporting page separates reporting from viewing an
   existing claim and states that a filed claim can be tracked online or in the app:
   `https://www.progressive.com/claims/faq/how-to-report-a-claim/`.
2. GEICO's official Claims Center presents separate `Report an Incident` and `Track A
   Claim` actions and requires an existing claim number for secure tracking:
   `https://www.geico.com/claims/`.
3. State Farm's official existing-claim page routes an already-filed claimant directly to
   claim tracking and asks for claim identity rather than another filing action:
   `https://www.statefarm.com/claims/check-existing-claim`.

Comparison criteria: separation of new submission from existing-claim access; number of
user actions after re-entry; truthful identity/authorization boundary; no duplicate-filing
affordance; keyboard and mobile clarity.

Better-than-baseline outcome: `repeat submit activations after re-entry`, count, lower is
better, baseline 1, target 0, measured by the focused fresh-navigation browser case.

Anti-copy boundary: use only the principle that an existing claim should lead to tracking
rather than a second filing action. Do not copy operator wording, page structure, layout,
branding, icons, illustrations, interaction sequence or trade dress.

Blocked source classes: authenticated post-login operator claim pages are not inspected;
public official pages are used only for the bounded principle above. A structured UI/UX
receipt with these observations and the exact Arben thread approval must pass the advisory
checker before authority promotion.

## Reviewer and evidence disposition required

Before recommending exact approval:

- Senior design review: Claude Opus 5, one bounded 30-minute process, exact current packet,
  no edits. Findings are consolidated once.
- Second signal: Gemini 3.1 Pro Preview or approved equivalent because the prospective
  product slice is Tier 3 privacy-adjacent. Unavailable is recorded as unavailable, never
  pass.
- Reviewer matrix: security/auth/tenancy, privacy, maintainability/modularity, performance,
  product/UX/accessibility, tests/E2E and gatekeeper scope.
- Design finding disposition records blocker/hardening/optional/rejected with exact section
  and remediation. A substantive design change requires rerunning only the affected design
  reviewer route.

After runtime approval, implementation review requires the policy senior route, Tier 3
second signal, diff-scoped security scan when available, GitHub Copilot, Sonar, CodeQL,
repo-native security, feedback/thread intake and finalizer on the exact current PR head.
Unavailable surfaces remain explicit. No reviewer grants repo or runtime authority.

## Completed design review disposition

- Senior reviewer R0: Claude Opus 5, bounded packet/read-grep route, `378144 ms`, `REVISE`.
  The frozen test map was expanded from four to its final five paths; the existing E2E
  assertion inversion, eligibility-specific checking state, focus provenance, one lookup
  per mounted draft version, lowercase UUID normalization, helper naming and no-dedicated-
  rate-limit posture were made explicit. This was one consolidated scope-preserving pass.
- Initial Gemini packet attempt: blocked because the reviewer could not read the ignored
  packet from its first path. It is recorded as invalid/unavailable evidence, never pass.
- Tier 3 second signal: Gemini 3.1 Pro Preview, bounded exact-artifact route, `39038 ms`,
  `PASS`; privacy, identity, no-write, four-product/five-test closure and rollback were
  accepted with no approval-blocking finding.
- Senior reviewer exact-current follow-up: Claude Opus 5, bounded packet/read-grep route,
  `400264 ms`, `REVISE`. It found one real presentation contradiction for `found` in the
  manager-only state plus missing exact boundary-test and server-line-ceiling language.
  The candidate was hardened in place without adding a writer, test path or outcome.
- Senior affected-section re-review: Claude Opus 5, same bounded route, `201983 ms`,
  `PASS`. It verified the complete `found` presentation override, accessibility provenance,
  exact boundary-test edits, 149/150-line ceilings and acceptance/stop consistency against
  current source. It reported no remaining approval blocker and no scope expansion.
- Non-blocking disposition: the per-file writer-map ceilings govern over the intentionally
  broader generic stop sentence; no ambiguity exists at implementation. The existing
  boundary count-of-two assertion intentionally constrains the hook to one import and one
  call of the create action. Both are accepted invariants, not remediation requests.

This review history authorizes only exact-hash consideration of this external candidate.
It does not create repository authority or runtime authorization.

## Admission and execution policy

Prospective admission shape:

- Product outcomes: 1.
- Product writer paths: 4.
- Test/spec writer paths: 5.
- Conditional metadata paths: 1.
- Independently invalidatable proof surfaces: 3 — exact authority/no-write action tests;
  client state/accessibility/boundary tests; one browser re-entry plus exact-head gates.
- Shared runtime consumers beyond entry: 0.
- Special proof environments: 1 — governed Z620 for focused browser/parity evidence.
- Contract graph closure, highest risks, rollback, acceptance matrix and stop conditions are
  specified.

Before authority PR, the user-owned detached worktree blocker must be resolved losslessly
and branch hygiene must pass. After exact design approval, Z620 may be woken only through
the governed power/controller path for the cheap hostname, Docker, disk/memory and
connected/listening canary. A passing admission receipt and exact UI/UX approval receipt
must exist before promotion. Sleeping Z620 before approval is not a failure and is not
represented as `ready`.

Execution after separate runtime approval:

1. Register active execution for this task and exact worktree.
2. Initialize one schema-v2 external execution ledger and one prospective Brain product
   session; Brain remains advisory.
3. Create one fresh `codex/ida-ui03a2-b4-reentry-claim-truth` worktree from then-current
   clean synced main.
4. Write RED tests first, beginning with the read-only authority/no-write action cases.
5. Implement only the frozen map; stop on a fifth product path or contract expansion.
6. Run focused evidence first. Use the heavy-job controller and governed Z620 path for
   build/E2E/`pr:verify`; Mac remains control/light writer and runs no Docker.
7. Consolidate reviewer findings in one remediation pass. Repeat affected reviews only
   after substantive remediation.
8. Complete one full exact-final-head CI E2E lane. Rerun only invalidated evidence.
9. Merge only exact reviewed head with CI, Sonar, CodeQL, security, Copilot/feedback and
   finalizer green or explicitly classified under policy.
10. Contain automatic CD before checkout/build/provider/deploy effects; no deployment or
    production mutation is authorized.
11. Merge closeout, publish one stable-evidence milestone through the governed path, close
    Brain/ledger, clear execution, idle controller, sleep Z620, remove only B4 task-owned
    refs/worktree/artifacts and verify clean synced main plus terminal resolver. Do not
    start another slice.

## Rollback and compatibility

Before runtime, discard the external candidate or revert only its future docs-only
authority merge. During implementation, revert the exact frozen product/test paths on the
dedicated branch. After product merge, rollback is one product-merge revert.

No database, data, claim, draft, event, audit, provider or deployment rollback is required
because the lookup writes nothing. Claims created by B1 remain ordinary canonical claims.
Legacy B1 claims are compatible without backfill because their persisted primary keys were
created by the same deterministic algorithm. Claims created by other paths remain
unaffected and are never returned for a saved-draft lookup.

If the helper extraction is reverted, B1 creation must retain the exact deterministic
identity behavior. Rollback proof compares pre/post deterministic ids for fixed
tenant/actor/draft fixtures.

## Non-goals

- No new claim creation behavior, claim-writer argument, origin or `origin_ref_id` write.
- No generic source badge, searchable origin, reverse lookup or list-wide claim projection.
- No saved-draft list redesign, membership dashboard redesign or Hero redesign.
- No automatic navigation, toast system, route, proxy, auth/session/OTP or tenancy change.
- No schema, migration, RLS policy, index, event, audit, notification or cache contract.
- No draft create/update/delete/resume semantic change and no browser storage change.
- No claim tracking/dashboard/detail redesign and no agent/staff/admin surface.
- No new locale key, copy rewrite, German, injury/health, uploads/documents or AI behavior.
- No billing/Paddle, provider, deployment, production, CI/workflow or infrastructure work.
- No reopening B1, B2, B3, UI06a, UI06b, UI03b or P0a2a without regression evidence.
- No Gemini maintenance, deletion or model/configuration change.

## Stop conditions

Stop and return one consolidated fresh gate if:

- a fifth product path, a sixth test/spec path, a new locale key or any protected path is required;
- exact claim lookup cannot remain read-only or requires draft/claim mutation;
- deterministic B1 identity cannot be extracted byte/behavior-equivalently;
- current source shows a valid B1 claim cannot be resolved by exact id+tenant+owner without
  generic origin linkage, schema, migration or shared writer change;
- an inactive/manager-only owner cannot truthfully access the existing canonical claim;
- lookup requires route/proxy/auth/session/tenant architecture or exposes foreign existence;
- the E2E file cannot remain at or below 150 lines without weakening proof;
- any new/substantially refactored production file exceeds 150 lines or either touched
  149-line production file is not smaller/no larger;
- admission is not ready, Z620 is not connected/listening when required, or the user-owned
  detached worktree cannot be resolved without unauthorized loss;
- AI OS is stale, Integrity is not clear, a blocking contradiction exists, M1-M7 is
  unverified, or AI OS and resolver disagree after promotion;
- exact runtime approval, one-writer/fresh-worktree discipline, current-head reviewer,
  Sonar, CodeQL, security, Copilot/feedback, finalizer or sole full-E2E evidence cannot be
  proven;
- PR-ready throughput is no longer credible within 2-4 active engineering hours;
- a second user outcome, proof environment or material addendum appears.

## Residual risks

- The deterministic identity is an algorithmic source relation rather than a persisted
  generic `origin_ref_id`. This is accepted only for same-owner B1 re-entry and guarded by
  lowercase/mixed-case fixed-vector compatibility tests; broader provenance remains a
  future slice.
- Each successful save remounts the preview and performs another bounded lookup. A found
  link may temporarily return to the eligibility-specific checking presentation before the
  same link reappears; no false success or submit enablement is shown during that interval.
- On lookup outage, the old idempotent Submit interaction remains visible for eligible
  active users. It is safe but does not achieve the zero-action target during that outage.
- Background discovery of the existing link does not move focus. Its existing polite status
  may announce the restored truth once, and the link remains in normal reading order; this
  avoids disruptive focus movement but may still be less prominent than deliberate submit.
- Authenticated operator benchmark pages remain unavailable, so public official pages prove
  only the separation principle, not visual equivalence.
- The user-owned detached worktree is an external namespace blocker. This candidate does
  not authorize deleting, overwriting, rebasing, stashing or committing its changes.

## Exact approval boundary

This candidate grants no authority by existing. After bounded review and one consolidated
remediation, Arben's approval must name exactly:

`IDA-DG32-UI03a2-B4-REENTRY-EXISTING-CLAIM-TRUTH`, its final UTF-8 byte count and final
SHA-256.

Only then may the lossless namespace blocker be resolved under explicit authority, the
admission/UI-UX receipts be finalized, and one docs-only authority PR be created. Product
coding remains stopped until merged authority, governed publication, exact AI OS/resolver
agreement and a separately exact-hash-approved runtime receipt.
