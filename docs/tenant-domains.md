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

## Production DNS

You typically want **two tenant subdomains** that both point at the same Next.js app deployment:

- `ks.interdomestik.com`
- `mk.interdomestik.com`

Depending on where you host DNS and your deployment target:

- **Vercel-managed domains**: follow Vercel’s UI prompts and add the suggested records.
- **External DNS provider**:
  - If you can use CNAMEs: point `ks` and `mk` to the target Vercel domain (often `cname.vercel-dns.com`).
  - If apex constraints apply: use A/ALIAS/ANAME records per your provider’s guidance.

The application itself determines the tenant from the incoming `Host` header.

## Vercel domains

Add both `ks.interdomestik.com` and `mk.interdomestik.com` to the same Vercel project.

- Ensure your reverse proxy/CDN preserves `x-forwarded-host` (or at least `host`).
- If you use custom edge routing, avoid rewriting away the host header.

## Playwright / E2E

Playwright lanes use tenant hosts to avoid the chooser screen:

- `ks-sq` uses `http://ks.localhost:3000/sq`
- `mk-mk` uses `http://mk.localhost:3000/mk`

Override with `KS_HOST` / `MK_HOST` if you need different local domains/ports.

## Better Auth trusted origins

Better Auth validates request origins. In environments where you use tenant hosts, include them in `BETTER_AUTH_TRUSTED_ORIGINS`.

Examples:

- Local dev: `http://localhost:3000,http://127.0.0.1:3000,http://ks.localhost:3000,http://mk.localhost:3000`
- Production: `https://ks.interdomestik.com,https://mk.interdomestik.com,https://interdomestik.com`

The Playwright webServer already sets this automatically for local E2E.

## Next.js host/origin notes

- Local dev uses `next dev --hostname 127.0.0.1` (see `apps/web/package.json`). This still accepts requests for `*.localhost` as long as DNS resolves to `127.0.0.1`.
- In Next.js 16, `allowedDevOrigins` in `apps/web/next.config.mjs` is used to silence dev-origin warnings for additional local origins like `http://ks.localhost:3000`.

## Deployment notes

- When running behind a proxy/CDN, ensure `x-forwarded-host` is preserved.
- Configure Better Auth trusted origins (`BETTER_AUTH_TRUSTED_ORIGINS`) to include your tenant hosts.
