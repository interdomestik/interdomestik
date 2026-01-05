# Security Hardening: Membership & Billing

**Status:** Complete
**Scope:** Paddle webhooks, subscriptions, and billing state changes

## Controls Implemented

- **Webhook signature verification:** `paddle-webhooks/verify.ts` enforces signature checks; bypass allowed only in tests.
- **Idempotency:** Webhook events are deduped via `webhookEvents.dedupeKey` and `onConflictDoNothing`.
- **Tenant resolution:** Webhooks resolve tenant from user or subscription; no tenant means no write.
- **Strict payload validation:** Zod schemas validate subscription and transaction payloads.
- **Status transitions:** Subscription status mapped via `mapPaddleStatus` with guarded updates.
- **Audit logging:** Webhook receipts, duplicates, and processing outcomes log audit events.
- **Commission creation audit:** Commission creation from webhooks now records audit events.

## Verification Commands

```bash
pnpm --filter @interdomestik/domain-membership-billing test:unit
pnpm --filter @interdomestik/web test:unit --run src/app/api/webhooks/paddle/route.test.ts
```
