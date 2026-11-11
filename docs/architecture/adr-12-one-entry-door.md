---
status: accepted
date: 2026-11-11
owner: platform + architecture + qa
tracker: docs/plans/current-tracker.md
---

# ADR-12: One Entry Door

## Status

Accepted (2026-11-11, owner). Step 2 dependency implementation is authorized in the bounded one-door increment; merge, deployment and later proxy/auth/billing changes require their existing explicit authority.

## Context

Owner goal, 2026-11-11: **“we need to deliver a clear one entry door!”**

Neutral credential login is delivered, but this does not establish universal canonical ingress. The one-door inventory 2026-11-11 records baseline `e7898061bcb1fa52f4af730361962b0b2327b2bf`: aliases still serve application surfaces, influence admission, generate links and underpin required gates. Its deployed environment, DNS and Paddle settings were not inspected.

**Owner fact, 2026-11-11: production has no real users, only test users.** Customer migration and communication, continuity of real sessions, bookmarks, installed PWAs and emails in flight are therefore outside required cutover work. Re-qualify this scope before cutover if real users onboard. Security proofs, canonical redirects, provider/Paddle configuration consistency and test-fixture continuity remain required.

Current recognition includes several default/configured hosts, `VERCEL_URL` and a broad `ida.` classifier; aliases are classified first. The existing redirect is flag-dependent and preserves arbitrary query parameters. See [tenant-front-door.ts:49](../../apps/web/src/lib/tenant/tenant-front-door.ts#L49), [tenant-host-aliases.ts:93](../../apps/web/src/lib/tenant/tenant-host-aliases.ts#L93) and [ida-live-login-cutover.ts:68](../../apps/web/src/lib/tenant/ida-live-login-cutover.ts#L68).

The current program selects RC3.1/S8 and credits bounded neutral-entry delivery; it does not select complete alias retirement. See [current-program.md:19](../plans/current-program.md#L19) and [current-program.md:506](../plans/current-program.md#L506). Reconcile the approved priority and sequence in the first implementing PR, preserving genuine prerequisite dependencies. Do not create a standalone program/tracker bookkeeping PR.

## Decision

### 1. Exactly one serving door per environment

| Environment | Canonical application door                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Production  | `https://ida.interdomestik.com`                                                                             |
| Staging     | `https://staging.interdomestik.com`, explicitly named by `IDA_HOST`                                         |
| Local       | One configured origin using `ida.127.0.0.1.nip.io` or `ida.localhost`, with the development scheme and port |

Both local names remain supported as alternative configurations. Each local deployment selects one canonical browser origin, including scheme and port; other admitted local names redirect to it. Secure-context journeys must use a browser-trusted canonical origin. Bind addresses and readiness probes must not become additional functional application doors.

Public pages, login, registration, authenticated role flows, application APIs and PWA entry use that environment’s door. Production and staging require HTTPS. Staging never falls back to production.

Host admission uses exact environment-specific configuration. An arbitrary `ida.` prefix or `VERCEL_URL` does not admit another application door. Immutable deployment URLs remain deployment identifiers, not alternative product entry points. Unknown or conflicting host authorities fail closed.

### 2. Authority originates only from verified session identity

Authenticated authority originates only from the verified session identity through the established authorization boundary. Preserve session-checked super-admin delegation and durable case-scoped grants, including their target, resource, expiry and revocation restrictions.

Host, tenant cookie, header, query and body values never independently establish, replace or override authority. A requested resource or delegation target remains untrusted input to the existing session-bound authorizer.

Preserve role, branch, ownership, assignment and RLS checks, and ADR-01’s distinct home/storage, access, booking, membership/legal and recovery-legal contexts. Missing or invalid authority denies the requested operation.

Ordinary credential login remains neutral and requires no tenant chooser. Credentials resolve the identity; the validated session determines its canonical destination. Deliberately supplied sign-in context may only constrain admission: a conflict denies login rather than selecting another identity.

Preserve the existing session-authority boundary in [tenant-authority.server.ts:26](../../apps/web/src/lib/tenant-authority.server.ts#L26).

### 3. Country and pilot aliases are redirect-only

Recognized `ks.`, `mk.`, `al.` and `pilot.` hosts, including configured and local equivalents, are compatibility redirects to the environment’s door.

- Only explicitly permitted GET/HEAD requests redirect, preserving approved path, locale and validated continuation parameters. Use temporary 307 redirects with explicit non-cacheable behavior during the pilot; 308 requires a later owner decision. Authentication/token redirects remain non-cacheable; permanent redirects require a stable target and rollback compatibility.
- The only permitted tenant-bearing redirect parameter is ADR-06’s `default_booking_tenant_id`, derived from a recognized alias and validated server-side. Arbitrary incoming tenant selectors are not forwarded as authority.
- The door revalidates booking context before consuming it. A redirect never establishes identity or authenticated tenant scope.
- Alias hosts must not render application pages, execute auth/API handlers, serve the application manifest/service worker or set/refresh tenant cookies.
- Unsafe methods are denied without executing application effects; this ADR does not authorize replaying credential or mutation bodies across origins.
- Enforcement must cover APIs and dotted/static paths, which the current general proxy matcher excludes. See [proxy.ts:9](../../apps/web/src/proxy.ts#L9).

No functional alias exception survives completed cutover. Before ingress enforcement, repair both admin evidence-upload paths and anonymous lead ownership in `leads.core.ts` / `tenant-request.ts`. Prove supported IDA operations and correct ownership without alias-derived authority or an implicit KS business default.

See [evidence-upload.ts:79](../../apps/web/src/features/admin/claims/actions/evidence-upload.ts#L79) and [upload API:46](../../apps/web/src/app/api/claims/evidence-upload/_core.ts#L46).

Regenerate test sessions through authentication on the door. Do not broaden session-cookie domains or transfer sessions through URLs.

### 4. Pre-session classification is explicit and separate

Anonymous IDA entry starts with no account, access or legal tenant.

For anonymous tenant-classified records, the server accepts either a validated booking hint or a deliberate user choice from supported, active onboarding tenants. The approved public-onboarding allowlist is exactly `tenant_ks`, `tenant_mk` and `pilot-mk`, each active at submission. Ordinary MK and MK pilot are visibly distinct choices. The server validates eligibility and rejects missing, malformed, unsupported or conflicting classification before any tenant-scoped effect. Ambient cookies, headers, locale and public-default fallbacks do not classify these records.

New-account registration, social and OTP onboarding carry this classification through a validated onboarding intent and revalidate it before account creation. It cannot grant privileged roles, reclassify an existing identity or override a subsequently validated session. Country choice is distinct from ordinary login.

Neutral `free-start.submit` reservations retain the existing `tenant_ks` technical partition, with a null actor and active-partition authorization. This exception applies only to informational idempotency bookkeeping; it establishes no account, access, booking, membership, legal or lead ownership.

Preserve existing reservation rows, keys and collision protections. Explicitly qualify retries of historical MK-partition test reservations across cutover and rollback; this ADR authorizes neither rebucketing nor cross-scope replay. Harmless public input requires no early country questionnaire.

See [free-start submit:40](../../apps/web/src/actions/free-start/submit.core.ts#L40), [onboarding-authority.ts:87](../../apps/web/src/lib/auth/onboarding-authority.ts#L87) and [leads.core.ts:24](../../apps/web/src/actions/leads.core.ts#L24).

### 5. Generated links use one deployment origin

Every application destination uses the environment’s canonical door: activation/invite/reset and notification emails; sponsor, referral and tracking links; sitemap, robots and metadata URLs; PWA identity/start/navigation; auth callbacks; and Paddle checkout/recovery returns.

Tenant classification may affect validated content, locale or booking context, but never the destination origin. Remove country-host, `www` and unrelated production fallbacks. Browser-origin rewriting is allowed only when the browser origin is already the canonical door; otherwise it must use the configured deployment origin.

Paddle dashboard settings and `PADDLE_DEFAULT_PAYMENT_LINK_KS/MK/AL` must agree with the deployment door while preserving required return paths and existing provider URL validation.

Affected inventory anchors include [email-link-origins.ts:138](../../apps/web/src/lib/email-link-origins.ts#L138), [public-links.ts:11](../../apps/web/src/lib/public-links.ts#L11), [sitemap.ts:3](../../apps/web/src/app/sitemap.ts#L3), [manifest.json:4](../../apps/web/public/manifest.json#L4) and [get-payment-update-url.ts:104](../../packages/domain-membership-billing/src/subscription/get-payment-update-url.ts#L104).

Preserve tenant-specific provider configuration and legal identity. Provider webhooks retain signature verification and resolved ownership; they do not acquire user-session authentication requirements.

### 6. Configuration is a validated contract

- Staging requires `IDA_HOST=staging.interdomestik.com`; missing or invalid configuration fails deployment validation.
- `KS_HOST`, `MK_HOST`, `AL_HOST` and `PILOT_HOST` must never normalize to the door host or ambiguously identify the same alias host. Prefer leaving unnecessary staging overrides unset.
- `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL` and any configured `NEXT_PUBLIC_SITE_URL` must resolve to the same canonical deployment origin.
- Auth base URL, trusted-origin admission and generated destinations must agree with that origin. Local configuration admits only the selected local door for functional entry.
- Validate build-time and runtime agreement. Do not infer deployment identity solely from `NODE_ENV`, falsify `VERCEL_URL` or treat committed CD wiring as proof of deployed values.
- `FEATURE_IDA_LIVE_LOGIN_CUTOVER=false` cannot reopen functional aliases after completed cutover.

Alias/door collisions are currently dangerous because alias classification runs first. See [tenant-front-door.ts:66](../../apps/web/src/lib/tenant/tenant-front-door.ts#L66).

### 7. Required evidence proves the door

Required canonical-door evidence begins with the functional-dependency increment and expands with each subsequent change. Positive journeys use no injected tenant selectors, forwarded-host overrides or credential-body tenant selection. Fixtures select identities independently of request authority. Explicit admission-constraint and hostile-input tests remain.

Preserve every existing role/resource allow-deny case, cross-tenant and cross-branch negative, and relevant restricted-role RLS proof. Record actual tenant IDs and executed scenarios; project names, locales and aggregate pass counts do not establish coverage.

Required evidence includes:

- Normal-UI credential entry and canonical role arrival; all existing nine-role claim-list, claim-detail, document and messaging isolation matrices run on the door without weakening their allow/deny expectations.
- Cross-tenant, cross-branch, ownership, assignment and restricted-role denials; stale tenant cookies and hostile hints cannot change session authority.
- Admin uploads on IDA, reset/invite/email destinations, registration/OTP classification, checkout/recovery returns, logout and canonical PWA entry.
- Alias evidence proves exact redirects and safe continuation, authentication/mutation denial without effects, callback handling, API and dotted/static/PWA coverage, and hostile Host/forwarded-host handling.
- Configuration failures for missing staging `IDA_HOST`, alias collisions and inconsistent deployment origins.

Existing header-free cases are a foundation, not complete proof: [front-door-neutral-entry.cases.ts:58](../../apps/web/e2e/gate/front-door-neutral-entry.cases.ts#L58). Required selection and hosted smoke currently remain alias-oriented: [playwright.config.ts:257](../../apps/web/playwright.config.ts#L257), [e2e-pr.yml:111](../../.github/workflows/e2e-pr.yml#L111) and [apps/web/package.json:27](../../apps/web/package.json#L27).

Retire alias-serving assertions and alias-based journey gates only when equivalent door coverage is required and passing. Retain alias redirect/denial assertions and all isolation negatives. Use test fixtures to qualify continuity; the owner-confirmed absence of real users removes customer-continuity obligations, not these security checks.

#### Pilot coverage contract

Keep complete role/isolation coverage across KS and MK. KS carries the broadest product regression suite; MK retains core journeys, every unique MK role case and all isolation obligations. `pilot-mk` retains its own supported journeys and isolation coverage.

| Actual tenant | Required roles and fixture identities                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `tenant_ks`   | `tenant_admin` (`KS_ADMIN`), `global_support` (`GLOBAL_SUPPORT`), `branch_manager`, `staff`, `agent`, `member`           |
| `tenant_mk`   | `admin` (`MK_ADMIN`), `super_admin` (`SUPER_ADMIN`), `auditor` (`AUDITOR`), `branch_manager`, `staff`, `agent`, `member` |
| `pilot-mk`    | `admin`, `staff`, `agent`, `member`, using `PILOT_MK_*`; include both pilot agents                                       |

These are **17 seeded role–tenant combinations**. Preserve assigned/unassigned staff, active/inactive agent links, other-client ownership, empty/other-member cases and existing lifecycle cases. Both pilot agents are required relationship variants. Sources: [role fixtures:71](../../packages/database/src/e2e-role-fixtures.ts#L71), [MK/pilot identities:23](../../packages/database/src/e2e-users.ts#L23), [KS identities:114](../../packages/database/src/e2e-users.ts#L114) and [support/auditor identities:256](../../packages/database/src/e2e-users.ts#L256).

For every listed combination, prove canonical authentication, loaded session identity/actual tenant/role, expected landing or denial, session continuity and logout. Operational roles also execute their supported journey. Retain SQ execution for KS, MK for ordinary MK and existing EN pilot execution; locale never selects authority.

Preserve every resource-specific row of the [claim-detail](../../apps/web/e2e/gate/nine-role-claim-access.cases.ts#L39), [claim-list/API](../../apps/web/e2e/gate/nine-role-claim-lists.cases.ts#L45), [document](../../apps/web/e2e/gate/nine-role-document-access.cases.ts#L29) and [message](../../apps/web/e2e/gate/nine-role-message-access.cases.ts#L20) matrices. For example, MK staff’s document row denies every catalogue document while its message row permits the MK case; a generic role check cannot replace these distinctions.

Mandatory isolation evidence covers all six directed boundaries:

| Actor tenant | Foreign target tenant |
| ------------ | --------------------- |
| `tenant_ks`  | `tenant_mk`           |
| `tenant_mk`  | `tenant_ks`           |
| `tenant_ks`  | `pilot-mk`            |
| `pilot-mk`   | `tenant_ks`           |
| `tenant_mk`  | `pilot-mk`            |
| `pilot-mk`   | `tenant_mk`           |

For every applicable actor/surface on each boundary, cover:

- Foreign claim lists/search/counts, direct detail access, document metadata/download/preview and public/internal messages.
- Foreign upload signing/attachment, message sends, assignment/status changes, member cancellation/draft updates and pilot-supported provisioning/approval operations.
- Forged tenant headers/cookies/query/body values, hostile Host/forwarded-host information and same-origin auth-state reuse. None may replace verified session authority.
- Denial without unauthorized disclosure, writes, documents, messages or resulting business effects. Pair negative requests with valid-session checks and successful authorized controls where the role permits them.

Retain all existing same-tenant cross-branch, other-owner, inactive-link and unassigned-staff negatives. Pilot’s two agents preserve the concrete other-client distinction in [role fixtures:262](../../packages/database/src/e2e-role-fixtures.ts#L262).

For `SUPER_ADMIN`, ordinary foreign-resource access remains denied unless that particular operation has authorized delegation. Prove valid delegation separately from absent, invalid and out-of-scope delegation, preserving target/resource/expiry/revocation restrictions. Blanket cross-tenant denial would contradict [admin-rbac-authority.ts:29](../../apps/web/src/actions/admin-rbac-authority.ts#L29).

Safe reductions remove duplicate tenant-independent presentation/navigation permutations or repeated execution of the same actor/resource/assertion. Unsafe reductions remove locale-specific behavior, tenant-specific configuration, either administrator role, a unique allow/deny case, pilot provisioning/branch behavior or required isolation evidence. Do not manufacture nine roles per tenant for symmetry.

Runtime will initially remain similar or increase as previously skipped door cases and pilot/alias coverage execute. Later deduplication may reduce repeated product work; no saving or percentage is promised. Avoid selecting both MK variants unnecessarily; [run-e2e-lane.mjs:66](../../scripts/run-e2e-lane.mjs#L66) distinguishes PR/full selection. Measure executed scenario coverage and clean-run duration.

The following are **required completion criteria**:

1. **Executable coverage record:** record actor, actual tenant, target tenant/resource, expected result, required lane and executed evidence bound to the tested source/configuration/environment. Enforce required selection and account for every required case. The current document matrix excludes pilot actors; its role-set assertion proves catalogue completeness, not execution. Add the missing pilot proof.
2. **Separate core-function and canonical-door proof:** retain C2-04’s constructed-session/core-function regressions, but add real authenticated canonical requests for required boundaries. Constructed sessions and minted test authority cannot establish authentication/ingress behavior. See [C2-04:86](../../apps/web/e2e/pilot/c2-04-cross-tenant-staff-member-write-isolation.spec.ts#L86).
3. **Storage and staging qualification:** PR-lane fallback signing proves authority/denials, signed-action/API outcomes and persisted metadata/ownership only; it grants no stored-byte proof. Storage-backed byte proof is qualified on the external staging journey (`PW_EXTERNAL_SERVER=1`) with real configured Supabase Storage; missing storage fails that lane rather than skipping it. pilot document acceptance requires actual storage-backed objects and authorized/denied metadata, download and preview delivery. The matrix’s configured-storage skip is insufficient. Replace the auth-state-scope helper’s `hostname.startsWith('ida.')` classifier with configured canonical-origin eligibility that recognizes `staging.interdomestik.com`; renaming files alone is insufficient. See [document matrix:60](../../apps/web/e2e/gate/nine-role-document-access.spec.ts#L60) and [auth-state-scope.ts:7](../../apps/web/e2e/fixtures/auth-state-scope.ts#L7).
4. **Decisions closed before dependent work:** resolve the owner decisions below at their dependency boundary, bind anonymous classification to actual tenants, identify supported integrations and test installations, and establish alias retention responsibility. Before ingress enforcement, prove historical MK test-reservation outcomes, callback/provider/Paddle destinations, alias security and the qualified rollback pair. Customer/session/bookmark/installed-PWA/email-in-flight continuity is excluded because no real users exist; re-qualify before cutover if that fact changes.

#### KS/MK and pilot journey migration

The following corrections are required to preserve intended coverage:

- Migrate `gate-mk-contract` alongside `gate-mk-mk`: ordinary PR verification selects `gate-ks-sq` plus `gate-mk-contract`, while main/full gates select `gate-mk-mk`. Preserve gate/security `testMatch` coverage, conditional pilot selection and command/evidence-parity consumers.
- Regenerate state through real authentication on the canonical origin; update writers and readers together for `.playwright/state/ida-ks.json`, `ida-mk.json`, `.auth/ida-ks/` and `.auth/ida-mk/`. Keep tenant/role files and browser contexts distinct. Validate loaded session identity, tenant and role; cookie hostname alone cannot distinguish KS from MK.
- Move optional front-door assertions into required lanes before removing projects. Replace `x-tenant-id` fixture selection with explicit metadata or validated project mapping; preserve session and notification-acknowledgement cases. Use configured canonical-origin eligibility instead of `hostname.startsWith('ida.')`, and replace neutral-host no-ops with actual session/locale-independence assertions.
- Preserve distinct `tenant_mk` and `pilot-mk` identities. Move supported `pilot/**/*.spec.ts` journeys to IDA with their existing EN execution, branch/provisioning behavior and isolation from KS and ordinary MK; do not substitute `MK_*` users. Existing nine-role coverage is distributed across tenants; complete the pilot coverage required above.
- Migrate `register-tenant-attribution` as authenticated agent lead capture → cash approval → member conversion using actor authority. Retain retired `/api/register` returning 410 without writes. Add explicit-choice/validated-hint coverage for actual anonymous onboarding and lead surfaces, including malformed/conflicting-input and no-effect negatives.
- Give `gate-al-sq` an explicit destination: preserve AL alias redirect/denial coverage, move applicable authenticated/core isolation assertions to required door lanes and update selection contracts. Its security/C2-03 selection has no authenticated state; C2-03’s default MK admin and AL-host assertion do not prove an AL account journey. Migrate C2-02’s internally constructed MK origin and headers too.
- Align the whole harness: setup, regular `ks-sq`/`mk-mk`, smoke, supported pilot projects, `BASE_URL`, app/auth URLs, trusted origins and helper-created contexts. Preserve the selected secure origin through `.localhost` normalization; remove positive-journey dependence on injected tenant headers or credential-body context, including `s5-saved-draft.fixture.ts`. Hostile-input negatives remain.

## Relationship and Boundaries

On acceptance, this ADR supersedes ADR-06’s permission to retain functional alias routes and optional alias serving. It retains [ADR-06 precedence:54](adr-06-ida-neutral-host-live-cutover.md#L54): validated session first; validated pre-session booking context next; alias context only for redirects; stale cookies and request hints cannot override either. Hinted sign-in retains fail-closed matching; the delivered ordinary no-hint path remains valid.

It resolves the inventory’s reconciliation item at [ADR-01:49](adr-01-tenant-decomposition.md#L49): “compatibility alias” means redirect-only, and booking context never becomes authenticated tenant authority. ADR-01’s distinct tenant concepts remain intact.

`apps/web/src/proxy.ts` remains the sole routing, access-control and tenant-isolation authority. Proxy/delegated-routing and auth changes still require explicit per-change owner authorization. Better Auth remains the sole identity/session authority through `@interdomestik/shared-auth`. Canonical role routes, readiness markers, RLS, privacy and lifecycle protections remain unchanged.

## Rollout

Carry canonical reconciliation with the first implementing PR. Deliver bounded increments in this functional order:

1. **Step 2 — dependencies:** both admin upload paths and anonymous lead ownership; establish required door evidence.
2. **Step 4 — destinations:** generated links, test email flows, callbacks and payment-return configuration.
3. **Step 3 — ingress:** enforce canonical admission last, after dependency, destination, alias security and rollback proof.

**Step 5** is an early staging preflight, reverified at every deployment. **Step 6** starts with step 2 and grows throughout; it is not a final catch-up PR.

The pre-pilot exit is the complete supported canonical pilot journey: one advertised origin, working supported role operations, correct anonymous ownership, canonical generated communication/payment destinations, executable coverage for the roster and all required isolation boundaries, storage-backed document proof and safe aliases. Defer only surfaces demonstrated to be outside that pilot.

Each HIGH-risk increment requires independent current-head review, Sonar zero new issues, no unresolved Codex findings, protected hosted checks, then frozen-head `pnpm pr:verify` and `pnpm security:guard` under repository policy. Prepared, tested, merged, deployed and owner-validated states remain distinct.

## Consequences

Users receive one stable entry point and one origin for sessions, links and installation. Tenant isolation becomes independent of country hostnames.

Costs include replacement of alias-dependent tests and generated links, regeneration of test auth state, explicit pre-session classification, provider configuration alignment and operation of retained alias redirects. Alias domains, DNS and certificates must support the chosen retention duration. This decision requires no tenant-row or legal-entity migration.

Because production has no real users, customer migration/communication and continuity of real sessions, bookmarks, installed PWAs and emails in flight are not required costs or acceptance obligations. Re-qualify before cutover if real users onboard. Host-only cookies and browser storage do not transfer through redirects; test-fixture continuity and security proof remain required.

## Rollback

Qualify a rollback source/configuration pair that preserves the canonical door and alias denial/redirect contract before ingress cutover. Include provider/Paddle settings, generated callback/return destinations, test fixtures and reservation rows/keys. Do not assume the immediately previous deployment is compatible, or that cached permanent redirects can be recalled. Never reverse the canonical door back to an alias or disable the cutover flag as automatic recovery.

Rollback requires no customer communication or continuity of real sessions, bookmarks, installed PWAs or emails in flight because production has no real users. Re-qualify this boundary before cutover if real users onboard.

If safe door operation cannot be restored, fail closed on affected operations. Reopening functional aliases requires an explicit, time-bounded owner-authorized exception with restored isolation proof; it is not compliant completion of this ADR. Preserve stored rows, reservation keys and existing authorization protections.

## Settled owner decisions and remaining qualification

1. **Pilot scope:** the classification roster is `tenant_ks`, `tenant_mk`, `pilot-mk`, each active. Supported integrations, test installations and explicitly deferred surfaces still require qualification.
2. **B1 accepted:** narrowly amend `leads.core.ts` to receive validated explicit classification; retain its public-authority boundary and scoped insert. Baseline JSON and all pinned tenant-guard units remain byte-identical.
3. **Alias retention:** retain alias domains, DNS and certificates until pilot end; do not retire them during qualification.
4. **Redirect policy:** use temporary 307 and explicit non-cacheable behavior throughout the pilot. Authentication/token redirects remain non-cacheable and unsafe requests remain denied; any 308 transition needs a later owner decision.
5. **Callback proof:** `CallMeNowDialog` remains unmounted. Unit tests prove its server path; business-form browser coverage grants no callback E2E credit.

Concrete proxy/auth/billing changes still require the existing implementation authorization; that is separate from these design decisions.
