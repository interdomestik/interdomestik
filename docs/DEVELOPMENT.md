# Development (local)

## Daily workflow

- Start dev servers: `pnpm dev`
- If you need to bind explicitly to loopback: `cd apps/web && pnpm dev:local`
  - Note: avoid `pnpm dev -- --hostname ...` because Next treats `--` as end-of-options and misreads `--hostname` as a positional project directory.
- Run unit tests: `pnpm test`
- Run fast quality gate (recommended before pushing): `pnpm check:fast`
- Run CI-equivalent gate: `pnpm check`

## Quality gates

The repo standardizes checks so everyone runs the same commands:

- `pnpm format:check`: verifies Prettier formatting
- `pnpm lint`: lints via Turborepo pipelines
- `pnpm type-check`: TypeScript typechecking via Turborepo pipelines
- `pnpm i18n:check`: validates i18n keys/usage
- `pnpm test`: web unit tests (Vitest)
- `pnpm build`: builds all packages/apps

## Git hooks (Husky + lint-staged)

On commit, staged files are automatically:

- formatted with Prettier
- lint-fixed (ESLint) for the Web and UI workspaces

If you need to bypass hooks (rare): `git commit --no-verify`.
