# P2 Billing Hardening Reconciliation Evidence

## Scope

On 2026-03-12, the live plan docs were reconciled against the current `main` codebase after the merged `B07` through `B10` slices and the remaining `B01` Stripe residue cleanup. This note records the proof used to mark `B01` through `B10` complete in the canonical tracker.

## Verified Outcome

- `B01` is complete after removing the stale `./stripe` package export and the remaining Stripe-specific setup, helper, and environment references from the live billing-support surface.
- `B02` is complete: Paddle webhook scope keys, dedupe keys, and duplicate short-circuiting are present in the current webhook path.
- `B03` is complete: replay protection is present in the invariant layer and a fresh Playwright replay proof passed on 2026-03-12.
- `B04` is complete: dunning grace, retry, and membership lock behavior are present and covered by focused tests.
- `B05` is complete: entity-bound webhook acceptance is verified against the correct billing entity before mutation.
- `B06` is complete: invoice and subscription lifecycle changes emit durable audit entries.
- `B07` through `B10` are already complete on `main` via merged PRs `#305`, `#306`, `#307`, and `#308`.

## Verification Commands

- `node --test scripts/package-e2e-scripts.test.mjs`
- `pnpm --filter @interdomestik/domain-membership-billing test:unit --run src/paddle-webhooks/persist.test.ts src/paddle-webhooks/invariants.test.ts src/paddle-webhooks/handlers.test.ts src/subscription/cancel.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/api/webhooks/paddle/[entity]/_core.test.ts' 'src/app/api/webhooks/paddle/route.test.ts' 'src/actions/memberships.test.ts' 'src/app/api/cron/dunning/route.test.ts' 'src/app/[locale]/(app)/member/membership/_core.test.ts'`
- `pnpm e2e:state:setup`
- `cd apps/web && NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm exec playwright test billing-webhook-entity-replay.spec.ts --project=ks-sq --grep 'replay does not double-post invoice or ledger' --workers=1 --max-failures=1 --trace=retain-on-failure --reporter=line`

## Key Evidence

- `B01`: `packages/domain-membership-billing/package.json`, `scripts/api-keys.sh`, `scripts/security-setup.sh`, `scripts/start-10x-task.sh`, `ENVIRONMENT.md`, `scripts/package-e2e-scripts.test.mjs`
- `B02`: `packages/database/src/schema/webhooks.ts`, `packages/domain-membership-billing/src/paddle-webhooks/persist.ts`, `apps/web/src/app/api/webhooks/paddle/_core.ts`
- `B03`: `packages/domain-membership-billing/src/paddle-webhooks/invariants.ts`, `apps/web/e2e/billing-webhook-entity-replay.spec.ts`
- `B04`: `packages/domain-membership-billing/src/paddle-webhooks/handlers/dunning.ts`, `packages/domain-membership-billing/src/subscription/cancel.ts`, `apps/web/src/app/api/cron/dunning/_core.ts`
- `B05`: `packages/domain-membership-billing/src/paddle-webhooks/verify.ts`, `apps/web/src/app/api/webhooks/paddle/[entity]/_core.ts`
- `B06`: `apps/web/src/lib/audit.core.ts`, `packages/domain-membership-billing/src/paddle-webhooks/invariants.ts`, `packages/domain-membership-billing/src/paddle-webhooks/handlers/subscriptions.ts`
- `B07`: `packages/database/src/schema/claim-commercial.ts`, `packages/database/drizzle/0040_add_claim_escalation_agreements.sql`, `packages/domain-claims/src/staff-claims/save-escalation-agreement.ts`
- `B08`: `packages/domain-membership-billing/src/subscription/cancel.ts`, `packages/domain-membership-billing/src/subscription/cancellation-policy.ts`, `apps/web/src/actions/memberships.ts`
- `B09`: `packages/domain-membership-billing/src/success-fees/policy.ts`, `packages/database/drizzle/0041_add_success_fee_collection_fields.sql`, `packages/domain-claims/src/staff-claims/save-success-fee-collection.ts`
- `B10`: `apps/web/src/actions/staff-claims/context.core.ts`, `apps/web/src/actions/staff-claims.core.ts`, `apps/web/src/actions/staff-claims/update-status.core.audit.test.ts`

## Residual Stripe Mentions Outside The Live Billing Surface

- `security/SECURITY.md` contains a historical comment example.
- `scripts/generate-mcp-aliases.sh` contains a comment example.
- `supabase/migrations/archive/00001_initial_schema.sql` retains archived historical schema fields.
- `scripts/package-e2e-scripts.test.mjs` now contains the regression assertions that keep the live billing surface Stripe-free.
