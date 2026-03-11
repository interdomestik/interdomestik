# Interdomestik repository instructions

## Stack and layout

- Use `pnpm` workspaces with Turborepo. Do not switch to `npm` or `yarn`.
- The main app is `apps/web` (Next.js 16 App Router, React 19, strict TypeScript).
- Shared code lives in `packages/domain-*`, `packages/database`, `packages/shared-auth`, `packages/ui`, and `packages/qa`.
- Treat `apps/web/.next`, `coverage`, `playwright-report`, `tmp`, and `node_modules` as generated artifacts. Do not edit them directly.

## Phase C pilot rules

- `apps/web/src/proxy.ts` is the routing, access-control, and tenant-isolation authority. Do not change it or bypass its behavior unless the user explicitly asks.
- Keep canonical routes stable: `/member`, `/agent`, `/staff`, and `/admin`.
- Preserve existing `page-ready` and `*-page-ready` `data-testid` markers. E2E gates depend on them.
- No architectural refactors of routing, auth, domains, or tenancy unless explicitly requested.
- Stripe is not used in V3 pilot flows. Do not add Stripe-based flows or checks.
- Do not update `README`, `AGENTS.md`, or architecture documentation unless asked.

## Auth, tenancy, and data access

- Supabase Auth is the system of record for identities and sessions.
- `better-auth` is the active orchestrator.
- `@interdomestik/shared-auth` is the provider-agnostic boundary. Use it instead of bypassing auth or session checks.
- Validate sessions with shared-auth helpers such as `requireTenantSession` and `ensureTenantId`.
- Keep tenant isolation explicit. Use `withTenant(...)` for tenant-scoped Drizzle queries.

## Code style and workflow

- Follow the existing Prettier style: 2 spaces, semicolons, single quotes, trailing commas, and 100-character line width.
- Keep imports grouped in this order: React/Next, external packages, workspace packages, then local files.
- Prefer explicit types on public TypeScript APIs and use discriminated unions for result types when they improve clarity.
- Prefer `rg` for repository searches when gathering context.

## Verification

- Before claiming work is complete, run the commands that prove the claim.
- Required PR gate commands are `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`.
- For faster local iteration, use `pnpm check:fast`, `pnpm test`, `pnpm test:e2e`, or filtered workspace commands such as `pnpm --filter @interdomestik/web test:unit`.
- For deterministic host-routed verification, use `pnpm pr:verify:hosts`.
