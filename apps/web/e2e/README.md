# E2E reuse-server workflow

Use this when you want to build once, keep a single production server running,
and reuse it across multiple Playwright runs.

## One-time build

Run this once before starting the server:

```bash
pnpm -C apps/web build
```

## Terminal A: start the server

```bash
pnpm -C apps/web e2e:server
```

## Terminal B: run Playwright against the external server

```bash
pnpm -C apps/web e2e:reuse-server -- e2e/messaging.spec.ts
```

## Tips

- Force reseeding and storage state regeneration (default in e2e:reuse-server):
  - `PLAYWRIGHT_FORCE_SEED=1` to re-run `scripts/seed-e2e-users.mjs`
  - `FORCE_REGEN_STATE=1` to regenerate `apps/web/e2e/fixtures/.auth/*.json`
- Faster reruns (no reseed):
  - `PLAYWRIGHT_SKIP_SEED=1`
- If you only want a sanity pass:
  - Add `--project=chromium` or `--workers=1` to your command.
