# Tenant domains (Option 1)

Interdomestik supports **deterministic tenant selection** based on the request host.

## Host → tenant mapping

- `ks.*` host → `tenant_ks`
- `mk.*` host → `tenant_mk`

Local development defaults:

- `ks.localhost` → `tenant_ks`
- `mk.localhost` → `tenant_mk`

Production defaults (canonical):

- `ks.interdomestik.com` → `tenant_ks`
- `mk.interdomestik.com` → `tenant_mk`

You can override hostnames via environment variables:

- `KS_HOST` (e.g. `ks.example.com` or `ks.localhost:3000`)
- `MK_HOST` (e.g. `mk.example.com` or `mk.localhost:3000`)

## Resolution order

Server-side tenant resolution order is:

1. Host header (`x-forwarded-host` → `host`)
2. Cookie `tenantId`
3. Header `x-tenant-id` (optional/back-compat)
4. Query param `tenantId` (back-compat)

The **tenant chooser UI** should only appear as a fallback when no tenant context can be resolved.

## Local development

In most environments, `*.localhost` resolves to `127.0.0.1` automatically.

- KS (sq): `http://ks.localhost:3000/sq/login`
- MK (mk): `http://mk.localhost:3000/mk/login`

If your system doesn’t resolve `*.localhost`, add entries to `/etc/hosts`:

- `127.0.0.1 ks.localhost`
- `127.0.0.1 mk.localhost`

## Playwright / E2E

Playwright lanes use tenant hosts to avoid the chooser screen:

- `ks-sq` uses `http://ks.localhost:3000/sq`
- `mk-mk` uses `http://mk.localhost:3000/mk`

Override with `KS_HOST` / `MK_HOST` if you need different local domains/ports.

## Deployment notes

- When running behind a proxy/CDN, ensure `x-forwarded-host` is preserved.
- Configure Better Auth trusted origins (`BETTER_AUTH_TRUSTED_ORIGINS`) to include your tenant hosts.
