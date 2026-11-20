# MODULE — auth and proxy (`apps/web/src/lib/auth`, `app/api/auth`, `proxy.ts`, `lib/proxy-*.ts`, `packages/shared-auth`)

Module contract, adopted from the review of 2026-11-13 (run A). Paths that begin with `A/` or `inputs/` cite the review record, which is kept outside this repository. Written by a helper on Opus 5.5 from the R1 reports and the code at `ef1bd0ef5`; reviewed by the main session on Fable 5.2, which re-read: the trusted-host list, the two sign-up switches, the default public tenant, the pool that the identity library uses, and the proxy matcher. One line was corrected: on the neutral door the caller of a password sign-up does name the tenant. The other lines are the helper's reading of R1's security and tenancy reports. Rules of `AGENTS.md` that bind this area: R-30, R-34, R-05, R-17. Line numbers into `docs/engineering/DIRECTION.md` are those of 2026-11-17, 01:00Z; the work-package numbers are the stable reference. **Corrected in R3 (2026-11-17)** after the independent review of R2b (comment R2b-C03): every statement of this file was checked against the pinned commit and the active finding records by a helper on Opus 5.5 (`A/raw/R3/modules/modcheck.md`), and the main session re-read the lines behind each correction it took. "Owned" means the package whose exported commands should write a table; `packages/database` declares every table and owns none (R-16).

## Responsibility

Authenticates a request (Better Auth, password and e-mailed code), derives the tenant authority from the session, and — separately — hardens and gates page requests in the proxy. The two do not share a path: the proxy's matcher excludes `/api` (`apps/web/src/proxy.ts:8-10`).

## Public API

`apps/web/src/lib/auth/index.ts:8-15` exports the single `auth` instance (config, adapter, database hooks, a `before` request hook, providers). `app/api/auth/[...all]/route.ts:37` wraps it as the only HTTP door. `proxy.ts:4-6` exports `proxy` and `config`; the logic is `lib/proxy-logic.ts:8-35`, composed of `proxy-resolve.ts` (host and tenant context), `proxy-gate.ts` (protected routes) and `proxy-secure.ts` (headers). `packages/shared-auth/package.json:6-10` exports `.`, `./errors`, `./session`.

## Owned tables

`user`, `session`, `account`, `verification` (`apps/web/src/lib/auth/schema.ts:9-12`, bound to `packages/database/src/schema/auth.ts`). Written from outside the owner: the member-number hooks and the authority assignment write `user` rows (`lib/auth/member-number-user-create-hook.ts`, `lib/auth/user-authority-assignment.ts:39-60`); the unit of R3 counted 57 write sites on `user` in 7 packages (the web app 25, `packages/database` 21, `domain-users` 5, `domain-referrals` 2, `domain-communications` 2, `domain-membership-billing` 1, scripts 1; not recounted by the main session). It is the most widely written table of the six contracts.

## Invariants

- The identity library runs on the **privileged** pool, not the tenant pool — `apps/web/src/lib/auth/schema.ts:6` (`dbAdmin`). So row policies are not a barrier for identity rows; the application code is.
- A caller cannot set its own tenant through the session — enforced in `lib/auth/auth-request-authority.ts:41-69` and `user-authority-assignment.ts:39-60`; R1 ruled this bypass out on tenant hosts (`A/modules/tenancy.md:148`). **On the neutral door it does not hold:** a password sign-up accepts any of four known tenants named in the body, marked pending (`lib/auth/onboarding-authority.ts:106-112`; MAIN-21, read by its adversarial pass).
- Only trusted hosts may be the base URL of a sign-in or reset link — enforced by **one list for every environment** (`apps/web/src/lib/auth/utils.ts:36-66`): nine names including `staging.interdomestik.com` and the pattern `interdomestik-*-ecohub.vercel.app`, applied whenever `VERCEL`/`VERCEL_URL` is set. This is finding **SEC-11** (S1, S0 if an outsider can obtain a matching host name — owner question 28, `docs/engineering/DIRECTION.md:664`): production therefore accepts the staging host as the place a genuine password-reset link may be delivered.
- Account creation requires an invitation — **NOT ENFORCED**. Sign-up by password is enabled (`lib/auth/providers.ts:43-44`, `emailAndPassword.enabled: true`) and the e-mailed-code plugin has `disableSignUp: false` (`providers.ts:86`), so a direct `POST /api/auth/sign-up/email` and the code flow both create users. WP-10 closes this (`docs/engineering/DIRECTION.md:269`, completion lines 1-2).
- A request without a determined tenant falls back to a tenant — `resolveDefaultPublicTenantId()` returns `'tenant_ks'` when `DEFAULT_PUBLIC_TENANT_ID` is unset (`apps/web/src/lib/tenant/tenant-hosts.ts:31-33`), i.e. Kosovo by default in code. Finding **MAIN-21**; `docs/engineering/DIRECTION.md:508,575` require the value to be explicit and an unset value to stop the start.
- A reset ends every session of that user — enforced, `lib/auth/providers.ts:51` (`revokeSessionsOnPasswordReset: true`); reset tokens expire after one hour (`providers.ts:49`); codes are hashed, expire in 300 s and allow 3 attempts (`providers.ts:84-85`).
- Password sign-in is throttled per (e-mail, IP) pair only — finding **SEC-03** (`A/modules/security.md:142`, `app/api/auth/[...all]/route.ts:68-95`); the limiter has an unguarded off switch (**SEC-05**, `lib/rate-limit.core.ts:53-64`).

## Tenant boundary

The tenant enters from the host (`lib/proxy-resolve.ts` into `proxy-logic.ts:9`) for pages, and from the session's authority for data (`lib/tenant-authority.server.ts:27-47`). R1 ruled the proxy out as a tenant source: it sets no trusted tenant header and does not see `/api` (`A/modules/tenancy.md:150`; `proxy.ts:8-10`). Header hardening therefore does not apply to `/api` either (**SEC-07**, `A/modules/security.md:147`). Identity lookups by e-mail use the privileged pool (`lib/auth/tenant-lookup.ts:7-16`, ruled out as a leak, `A/modules/tenancy.md:152`).

## Live and not live

Live: password sign-in, e-mailed code sign-in, password reset as the activation path for imported members (`docs/engineering/DIRECTION.md:419`), the proxy gate and the country-host redirect to the one door (`proxy-logic.ts:11-17`, WP-19). Conditional: social sign-in — `lib/auth/social-providers.ts` is wired when `GITHUB_CLIENT_ID`/`SECRET` are present (`providers.ts:38-39,89-90`); whether a deployment sets them is not visible from the code, and WP-10 requires production to refuse those two variables (`docs/engineering/DIRECTION.md:269`, line 3).

## Tests to run

`apps/web/src/lib/auth/` holds 20 colocated test files (`config.test.ts`, `providers.test.ts`, `auth-request-authority.test.ts`, three contract tests for the different-e-mail recovery, …) and `lib/` holds 8 proxy tests (`proxy-logic.test.ts`, `proxy-gate.test.ts`, `proxy-secure.test.ts`, `proxy-front-door.test.ts`, `proxy-session-state.test.ts`, `proxy-resolve.test.ts`, `proxy-logic.csp-nonce.test.ts`, `proxy-live-login-cutover.test.ts`) — recounted in R3. They run under the web app's unit test script; it runs in CI inside the coverage step, with `shared-auth`'s `test:unit`: `.github/workflows/ci.yml:138` (`pnpm coverage:gate`, whose `test:coverage` runs the web suite, `shared-auth` and every `domain-*` package, `package.json:86-87`; the step is skipped when coverage is reused, `ci.yml:137`). `packages/shared-auth/package.json:12-15`: `test:unit` (vitest), `type-check`.

## Do not reach into

`lib/auth/schema.ts` or `dbAdmin` from feature or domain code — identity rows have no policy barrier. `lib/auth/utils.ts`'s host list from anywhere but the auth configuration. `proxy-*.ts` internals from route handlers: the proxy never runs for them.

## Decided for this module (owner, 2026-11-17; decisions, not verified properties of today's code)

- Each environment has its own list of exact trusted host names: no wildcard, no generated hosting name, no host of another environment; every deployment that is not production sits behind the platform's deployment protection (answer 28; SEC-11 stays S1 and its fix blocks the pilot).
- Activation is by the password-reset link, not by a code (answer 27 f). No answer reveals whether an address has an account in another tenant (answer 27 a).

## Open findings

SEC-11 (S1; WP-01, gate line 1 — `docs/engineering/DIRECTION.md:137,459`), MAIN-21 (WP-10, phase 1 — `docs/engineering/DIRECTION.md:464,575`), SEC-03, SEC-05, SEC-07, SEC-08, SEC-09 (`A/modules/security.md:142-149`), TEN-05.

## Not reviewed

`packages/shared-auth` was **not reviewed in R1**: it appears in no R1 module report as a read source, and this unit read only its `package.json`. Its five source modules (`permissions.ts`, `scope.ts`, `governance.ts`, `access-grants.ts`, `session.ts`) carry role and scope predicates that the rest of the application imports. It is unverified surface and belongs on the run-B list.
