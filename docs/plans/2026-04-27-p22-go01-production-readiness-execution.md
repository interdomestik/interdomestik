# P22-GO01 Production Readiness Execution Evidence

**Status:** first-pass-no-go; release-gate-go-after-rerun
**Dates:** first pass 2026-04-27; production rerun 2026-04-28
**Decision:** first pass was `NO-GO`; 2026-04-28 scripted production release gate is `GO`

## Scope

This records the first execution pass of `P22-GO01` against the reachable Vercel production
alias and the repo-declared production host contract. It is operational evidence only. It does
not authorize product behavior expansion, UI/UX redesign, CRM redesign, agent-workspace redesign,
proxy edits, canonical route changes, auth or tenancy refactors, schema changes, Stripe
reintroduction, or product analytics expansion.

## Targets Checked

| Target                            | Result                                                                 |
| --------------------------------- | ---------------------------------------------------------------------- |
| Repo/CD canonical production URL  | `https://app.interdomestik.com`                                        |
| Reachable Vercel production alias | `https://interdomestik-web.vercel.app`                                 |
| Canonical pilot host              | `pilot.interdomestik.com`                                              |
| Canonical tenant hosts            | `mk.interdomestik.com`, `ks.interdomestik.com`, `al.interdomestik.com` |

## Deployment Identity

`vercel inspect https://interdomestik-web.vercel.app --scope ecohub` returned:

- Deployment ID: `dpl_Bocg5n9BhyQKSENZT6zmBQrFvwCL`
- Deployment URL: `https://interdomestik-2f0zkaumj-ecohub.vercel.app`
- Target: `production`
- Status: `Ready`
- Created: 2026-04-20 17:31:55 Europe/Berlin
- Aliases:
  - `https://interdomestik-web.vercel.app`
  - `https://interdomestik-web-ecohub.vercel.app`
  - `https://interdomestik-web-arbenl-ecohub.vercel.app`

`curl -fsS https://interdomestik-web.vercel.app/api/health` returned HTTP 200 and service health,
but the parsed health payload did not expose a build commit:

- `status`: `healthy`
- `build`: `null`
- `environment`: `null`
- service keys present: `ai`, `database`, `email`, `push`, `redis`

The deployed commit SHA therefore remains unproven for the reachable production alias.

## DNS And Host Binding

DNS resolution result from `node:dns/promises.resolve`:

- `app.interdomestik.com`: `ENOTFOUND`
- `pilot.interdomestik.com`: `ENOTFOUND`
- `mk.interdomestik.com`: `ENOTFOUND`
- `ks.interdomestik.com`: `ENOTFOUND`
- `al.interdomestik.com`: `ENOTFOUND`
- `interdomestik-web.vercel.app`: resolves to Vercel IPs

`vercel domains ls --scope ecohub` returned only `ecohubkosova.org` and `shfk.org`; no
`interdomestik.com` domain is configured under the inspected Vercel scope.

This fails the P22-GO01 canonical production host and tenant-host acceptance criteria.

## Environment And Secret Posture

`vercel env ls production --scope ecohub` confirmed production-scoped environment variable names
exist for the Vercel project, with encrypted values. Values were not printed.

Observed production env names include:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PRODUCTION_PROJECT_REF`
- `NEXT_PUBLIC_PADDLE_ENV`
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET_KEY`
- KS-specific Paddle price/client/server webhook variables
- Redis and Resend variables

This proves variable presence by name only. It does not prove values, project ownership, secret
freshness, or production correctness.

## Public And Anonymous Smoke

Against `https://interdomestik-web.vercel.app`:

- `/api/health`: HTTP 200
- `/sq`: HTTP 200
- `/sq/login`: HTTP 200
- `/sq/pricing`: HTTP 200
- `/sq/services`: HTTP 200
- `/sq/register`: HTTP 200
- `/sq/member`: HTTP 307 to `/sq/login`
- `/sq/agent`: HTTP 307 to `/sq/login`
- `/sq/staff`: HTTP 307 to `/sq/login`
- `/sq/admin`: HTTP 307 to `/sq/login`

The old February 2026 preview deployment
`https://interdomestik-ganc1l4v0-ecohub.vercel.app` was also inspected because it had been opened
manually during execution. Vercel reports it as a protected preview deployment created on
2026-02-11 from commit `2ddb512a04d1bb03af3e2b3008f3be226f8a06b9`, package version `0.1.0`. It is
not the current production alias and is not valid go-live evidence.

## Paddle Production Posture

Vercel production environment variable names for Paddle are present. On the reachable production
alias:

- `/sq/pricing` did not contain the local warning phrase `cannot open real payment`.
- `/sq/pricing` did not contain `local environment`.
- `/sq/register` did not contain the local warning phrase `cannot open real payment`.

Paid checkout was not fully validated because the canonical production host is not configured and
the final checkout path was not executed.

## Release Gate

Command:

```bash
pnpm release:gate:prod -- --baseUrl https://interdomestik-web.vercel.app --outDir tmp/p22-go01/release-gates
```

Report:

```text
tmp/p22-go01/release-gates/2026-04-27_production_dpl_Bocg5n9BhyQKSENZT6zmBQrFvwCL.md
```

Results:

- `P0.1`: PASS
- `P0.2`: PASS
- `P0.3`: PASS
- `P0.4`: PASS
- `P0.6`: PASS
- `P1.1`: PASS
- `P1.2`: PASS
- `P1.3`: PASS
- `P1.5.1`: PASS
- `G07`: FAIL
- `G08`: PASS
- `G09`: PASS
- `G10`: PASS

Failing signature:

```text
G07_COMMERCIAL_PROMISE_SURFACE_MISSING scenario=register missing=register-success-fee-calculator,register-billing-terms,register-coverage-matrix
```

This makes the release gate verdict `NO-GO` even on the reachable Vercel production alias.

## CD Workflow State

GitHub Actions CD workflow run for `main` at
`09937e15d142ac27d9bb1b927923872170b142c1`:

- Run: `https://github.com/interdomestik/interdomestik/actions/runs/24993230035`
- Status: `queued`
- Job: `build-staging`
- Job status: `queued`

This means the current `main` release state is not proven deployed by the repo CD workflow.

## Backup, Rollback, Observability, And Incident Ownership

Not confirmed in this execution pass:

- Fresh production database backup or provider-managed recovery point timestamp.
- Database recovery owner.
- Rollback owner.
- Rollback target and command/dashboard action.
- Post-rollback validation command owner.
- Named production alert recipient or incident decision owner.

The release gate production log sweep returned `P1.5.1=PASS` for the reachable Vercel alias, but
that does not replace the missing launch-owner and alert-owner confirmations.

## Blockers

Live traffic must remain closed because:

1. `app.interdomestik.com` does not resolve.
2. Canonical tenant hosts `pilot.interdomestik.com`, `mk.interdomestik.com`,
   `ks.interdomestik.com`, and `al.interdomestik.com` do not resolve.
3. The reachable Vercel alias does not expose deployed commit SHA in `/api/health`, so deployed
   release identity is unproven.
4. The current `main` CD workflow is queued, so the latest `v1.0.0` governance state is not proven
   deployed by CD.
5. Production release gate is `NO-GO` because `G07` fails on `/register` commercial promise
   surfaces.
6. Fresh database backup or recovery point, rollback owner, and database recovery owner are not
   confirmed.
7. Launch-day alert recipient and incident decision owner are not confirmed.

## Final Decision

**First pass NO-GO.** The reachable Vercel alias had useful fallback smoke evidence, but the
production go-live checklist was not satisfied and live traffic could not open from this pass.

## 2026-04-28 Rerun After Production Git Deployment

PR `#568` fixed the remaining production `G09` member SLA copy blocker and merged to `main` at
`c7e038d97de52586deb8c1c8807bf867cad75088`. Vercel production deployment
`dpl_AtRyCJu5RV4sHmw9w9DtXQEZAgiw` went ready for `https://www.interdomestik.com`.

Command:

```bash
pnpm release:gate:prod -- --baseUrl https://www.interdomestik.com --outDir tmp/p22-go01-after-pr568/release-gates
```

Canonical report:

```text
docs/release-gates/2026-04-28_production_dpl_AtRyCJu5RV4sHmw9w9DtXQEZAgiw.md
```

Results:

- `P0.1`: PASS
- `P0.2`: PASS
- `P0.3`: PASS
- `P0.4`: PASS
- `P0.6`: PASS
- `P1.1`: PASS
- `P1.2`: PASS
- `P1.3`: PASS
- `P1.5.1`: PASS
- `G07`: PASS
- `G08`: PASS
- `G09`: PASS
- `G10`: PASS

Scripted release-gate verdict:

```text
GO
```

Operational note: the scripted release gate proves the production smoke and release-gate contract
on the live host. Any non-scripted launch-day ownership evidence, including backup/recovery point,
rollback owner, alert owner, and incident decision owner, must still be held as launch-operations
evidence or explicitly accepted with written launch-risk ownership before live traffic is opened.
