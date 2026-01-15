# E2E tests (Playwright)

E2E is intentionally single-path and deterministic:

- Database is migrated + seeded explicitly via the root orchestration (`pnpm db:migrate` + `pnpm seed:e2e`).
- Playwright starts the app server itself (no external server mode).
- Auth state is generated via the `setup` project and reused by tests.

## Golden Path (from repo root)

```bash
pnpm db:migrate
pnpm seed:e2e
pnpm test:e2e -- --grep smoke
pnpm test:e2e
```

## Regenerate auth state

```bash
FORCE_REGEN_STATE=1 pnpm test:e2e -- --project=setup
```
