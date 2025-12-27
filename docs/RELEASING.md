# Releasing

## Commit convention

Use Conventional Commits (enforced via `commitlint`). Examples:

- `feat(web): add agent claim submission`
- `fix(database): handle null commission rate`
- `chore(ci): speed up pnpm install`

## Versioning strategy (monorepo)

- The repo version is tracked at the root `package.json`.
- Release notes are written to `CHANGELOG.md`.
- Packages/apps can still be published independently later, but for now we cut a single repo release.

## Cut a release

1. Ensure `pnpm check` is green on `main`.
2. Run `pnpm release` (uses release-it).
3. Push the resulting commit + tag.

Dry run:

- `pnpm release:dry`
