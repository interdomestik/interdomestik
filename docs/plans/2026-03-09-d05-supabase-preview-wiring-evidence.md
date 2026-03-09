---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-09
---

# D05 Staging Supabase and Preview Wiring Evidence

> Status: Active supporting input. This document records the code and verification evidence for `D05` staging Supabase plus preview-environment separation inside `P-1` Infrastructure Debt Closure.

## Scope

`D05` required one narrow outcome:

- keep preview and staging deploys off the production Supabase project, with explicit deployment-environment separation that fails the build when the wrong hosted project is wired

## Merge Evidence

- pull request: [#263](https://github.com/interdomestik/interdomestik/pull/263)
- title: `feat: separate staging and production Supabase builds`
- merged at: `2026-03-09T16:05:02Z`
- merge commit: `14c7b0f5080bd11fddbf31a02f1778d2be361906`

## Code Evidence

- the deployment guard in [apps/web/src/lib/supabase-deployment.mjs](../../apps/web/src/lib/supabase-deployment.mjs) now resolves `preview`, `staging`, and `production`, extracts Supabase project refs from hosted URLs, and throws when preview or staging target the production project or when production targets a non-production project
- build-time enforcement in [apps/web/next.config.mjs](../../apps/web/next.config.mjs) now executes `validateSupabaseDeploymentSeparation(process.env)` before exporting the Next config, so a bad Supabase target fails the build instead of reaching runtime
- the Docker build path in [apps/web/Dockerfile](../../apps/web/Dockerfile) and the CD workflow in [.github/workflows/cd.yml](../../.github/workflows/cd.yml) now pass explicit `INTERDOMESTIK_DEPLOY_ENV` and `SUPABASE_PRODUCTION_PROJECT_REF` inputs, with separate staging and production build jobs instead of a shared undifferentiated build
- contract coverage in [scripts/ci/workflow-contracts.test.mjs](../../scripts/ci/workflow-contracts.test.mjs) and [scripts/docker-workflow.test.mjs](../../scripts/docker-workflow.test.mjs) now locks the deployment env split and the Docker env injection surface
- unit coverage in [apps/web/src/lib/supabase-deployment.test.ts](../../apps/web/src/lib/supabase-deployment.test.ts) proves preview rejection, production rejection, staging acceptance, hosted URL extraction, and the `SUPABASE_URL` fallback path

## Red-Green Evidence

The first landing pass for `D05` surfaced two real regressions on 2026-03-09:

- PR `#263` failed SonarCloud because the new `.github/workflows/cd.yml` actions were version-tagged instead of pinned to immutable SHAs
- PR `#263` also failed `CI/static` because `apps/web/src/lib/supabase-deployment.test.ts` passed bare objects to a `ProcessEnv`-typed helper without the required `NODE_ENV`

After pinning the CD workflow actions and correcting the test env typing, the following green checks passed:

- `pnpm test:ci:contracts`
- `pnpm --filter @interdomestik/web test:unit --run src/lib/supabase-deployment.test.ts`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- GitHub PR `#263` full required checks, including `CI/static`, `PR E2E (Full Gate)`, `Pilot Gate Runner`, `SonarCloud Code Analysis`, `pr-finalizer`, `Secret Scan`, and `Security`

## Notes

- this slice intentionally preserves the existing auth, routing, and tenancy architecture; it only hardens the deployment boundary between non-production and production Supabase projects
- staging is treated as an explicit deployment environment rather than a synonym for preview, so CD can build and verify it independently before production promotion
- the Sonar follow-up was part of the landing evidence for this slice because the CD workflow change is itself part of the D05 delivery surface

## Conclusion

`D05` is complete for code, CI, and local verification evidence.

The remaining live `P-1` queue is now `D06` through `D08`.
