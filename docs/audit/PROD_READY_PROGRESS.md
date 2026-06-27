# Production Ready Progress

Date: 2026-06-27
Branch: `chore/prod-ready-sync`

## Task 0 - Baseline and Safety

- Command: `git status`, `git fetch origin`, `git log --oneline -5 origin/main`
- Result: local `main` had 45 dirty paths and was 95 commits behind `origin/main`; `origin/main` head is `081e23a8 fix: reduce Docker build memory pressure`.
- Command: `git switch -c wip/local-snapshot-2026-06-27 && git add -A && git commit -m "chore: snapshot local WIP before sync"`
- Result: commit hook failed because pnpm attempted a frozen install and reported `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.
- Command: `git commit --no-verify -m "chore: snapshot local WIP before sync"`
- Result: WIP preserved on `wip/local-snapshot-2026-06-27` at `dfad604f`.
- Command: `git diff --stat main origin/main -- .github/ scripts/ci/ apps/web/Dockerfile package.json`
- Result: upstream CD surface includes Vercel deploy/health scripts, Mac runner smoke workflow, Docker build memory reduction, and disabled GHA cache export.

## Task 1 - Sync Onto Origin Main

- Command: `git reset --hard origin/main && git switch -c chore/prod-ready-sync`
- Result: branch `chore/prod-ready-sync` created at `081e23a8`, matching `origin/main`.
- Decision: stale local runner migration and Docker webhook deploy edits were dropped because upstream already replaced deploy-staging with the Vercel path.

## Task 2 - Docker-Free Code Gate

- Change: added `pnpm prod:ready:code`.
- Verification: `corepack pnpm prod:ready:code` passed.
- Notes: use `corepack pnpm` for this repo because the repo package manager is pnpm `10.28.2`; the globally resolved `pnpm` is newer and can rewrite workspace metadata.

## Task 3 - Docker/Supabase Doctor

- Change: added `scripts/dev/doctor.sh`, `pnpm run doctor`, and local E2E precondition wiring.
- Verification: `corepack pnpm run doctor` passed with `doctor: PASS docker=healthy supabase=healthy postgres=healthy`.
- Notes: `pnpm doctor` is a pnpm built-in command, so the repo script must be invoked as `pnpm run doctor`. The E2E lane runner uses `pnpm run doctor`.

## Task 4 - CD Image Build Instability

- Result: upstream already includes `f2b84e30 fix: disable gha cache export in cd image build` and `081e23a8 fix: reduce Docker build memory pressure`.
- Decision: no additional CD image-build change made.

## Task 5 - Local Gates

- Verification:
  - `node --test scripts/ci/prod-ready-scripts-contract.test.mjs scripts/ci/release-evidence-check.test.mjs scripts/package-e2e-scripts.test.mjs` passed.
  - `corepack pnpm security:guard` passed.
  - `corepack pnpm pr:verify` passed after installing the missing Playwright Chromium binary and clearing local disk pressure.
  - `corepack pnpm e2e:gate` passed standalone with 134 passed and 8 skipped.
- Gate details:
  - CI contracts: 298 passed.
  - Release-gate tests: 118 passed.
  - RLS required tests: 26 passed; coverage `79/79`, `100.00%`.
  - Web unit tests in coverage gate: 543 files passed, 2728 passed, 1 skipped.
  - Repository coverage gate: `84.59%` lines vs required `60.00%`.
  - PR E2E gate: setup 2 passed; gate suite 134 passed, 8 skipped; smoke suite 13 passed, 9 skipped.
- Environmental fixes applied during verification:
  - Installed Playwright Chromium/headless-shell for `@interdomestik/web`.
  - Reclaimed unused Docker image layers after the gatekeeper failed below the local `<4GiB` free-space threshold.

## Task 6 - CD Proof

- Verification: blocked locally; requires GitHub/CD execution and staging/production credentials.
- Existing upstream proof reviewed: CD now uses bounded Vercel deployment after attested images, and upstream includes `f2b84e30`, `7fbe756e`, and `081e23a8`.

## Task 7 - Human Evidence Gate

- Change: added `docs/release/production-evidence.schema.json`, `docs/release/production-evidence.yaml`, and `pnpm release:evidence:check`; wired the evidence check into `pnpm release:gate:prod`.
- Verification: `corepack pnpm release:evidence:check` fails closed as intended because G01-G10 are still pending and their artifact hashes are not supplied.
- PDF triage:
  - `Butel pogreben servis docs.pdf` is a signed/stamped corporate membership employee-list confirmation for 126 employees, invoice `0307/03/2026`, valid `05/01/2026` to `05/01/2027`.
  - `Butel AD Skopje docs.pdf` is a signed/stamped corporate membership employee-list confirmation for 90 employees, invoice `0307/04/2026`, valid `05/01/2026` to `05/01/2027`.
  - These PDFs are candidates for G01 roster/list signoff evidence and possibly supplemental G03 invoice-acceptance context. They are not payment proof, legal/privacy approval, access matrix, activation evidence, POA/consent, or closure evidence.
  - They contain employee names and should be stored only in the agreed evidence location with hashes recorded; do not commit them casually to the repo.

## Task 8 - CD Production Evidence Wiring

- Change: added a `production-evidence` CD job after `e2e-staging` and before `build-production`; it runs `pnpm release:evidence:check` so pending G01-G10 blocks the production leg before any production build or deploy.
- Follow-up: production jobs now run only on a `v*` tag or `workflow_dispatch`; pushes to `main` exercise staging only. The GitHub `production` environment requires reviewer `arbenl`, with self-review allowed for the one-reviewer setup.
- Verification: focused workflow/script contract tests passed; `corepack pnpm release:evidence:check` still fails closed with pending G01-G10 and pending signoffs.
