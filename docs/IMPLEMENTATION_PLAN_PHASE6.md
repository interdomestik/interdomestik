# Implementation Plan - Phase 6: Messaging, Notifications & Cron Security

Scope: tighten validation, RBAC, tenant isolation, and audit logging across messaging + notifications + cron jobs, while keeping entrypoints thin.

## Modularization Guardrails

- **[REFERENCE] `MODULARIZATION_REPORT.md`**: keep entrypoints thin; move logic into `*_core.ts` or domain modules.
- **[VERIFY] `scripts/check-entrypoints-no-db.mjs`** after changes.
- **[UPDATE] `MODULARIZATION_REPORT.md`** if any new core modules are introduced.

## Targets

### Domain layer

- `packages/domain-communications/src/messages/schemas.ts`
- `packages/domain-communications/src/messages/send.ts`
- `packages/domain-communications/src/messages/get.ts`
- `packages/domain-communications/src/messages/mark-read.ts`
- `packages/domain-communications/src/notifications/schemas.ts`
- `packages/domain-communications/src/notifications/get.ts`
- `packages/domain-communications/src/notifications/mark-read.ts`
- `packages/domain-communications/src/cron-service.ts`

### Actions layer

- `apps/web/src/actions/messages/send.core.ts`
- `apps/web/src/actions/messages/get.core.ts`
- `apps/web/src/actions/messages/mark-read.core.ts`
- `apps/web/src/actions/notifications/get.core.ts`
- `apps/web/src/actions/notifications/mark-read.core.ts`
- `apps/web/src/actions/messaging.core.ts`

### API cron entrypoints

- `apps/web/src/app/api/cron/_auth.ts`
- `apps/web/src/app/api/cron/dunning/_core.ts`
- `apps/web/src/app/api/cron/engagement/_core.ts`
- `apps/web/src/app/api/cron/nps/_core.ts`

### Security docs

- `security/hardening/communications.md` (create or update)

## Hardening Checklist

- Strict Zod validation for all message/notification mutations and fetch params.
- Deep RBAC in domain cores (staff/admin vs agent vs member).
- Tenant isolation in every query (explicit `tenantId`).
- Rate limit high-risk writes (send, mark-read).
- Audit log on mutations with tenantId required (fail-open per policy).
- Cron auth requires `CRON_SECRET`, no bypass flags outside tests.

## Tests

### Domain unit tests

- `packages/domain-communications/src/messages/mark-read.test.ts`
- `packages/domain-communications/src/notifications/mark-read.test.ts`

### Action tests

- `apps/web/src/actions/messages.send.test.ts`
- `apps/web/src/actions/messages.mark-read.test.ts`
- `apps/web/src/actions/notifications.mark-read.test.ts`

### Cron tests

- `apps/web/src/app/api/cron/dunning/route.test.ts`
- `apps/web/src/app/api/cron/engagement/route.test.ts`
- `apps/web/src/app/api/cron/nps/route.test.ts`

## Verification

- `pnpm --filter @interdomestik/domain-communications test:unit`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/messages.send.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/messages.mark-read.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/notifications.mark-read.test.ts`
- Update evidence in `security/hardening/communications.md`
