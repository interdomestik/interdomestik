# Modularization Report (Rolling)

This file is continuously updated as entrypoints are modularized across the repo.

## Scope / Policy

- Goal: keep Next.js server entrypoints thin (Server Actions + API route handlers) and push business logic into request-context-free core modules with explicit inputs.
- Per change: add/adjust unit tests and run focused tests + typecheck.

## Completed

### API: Documents

- Added shared core module: [apps/web/src/app/api/documents/\_core.ts](apps/web/src/app/api/documents/_core.ts)
- Refactored routes to thin wrappers:
  - [apps/web/src/app/api/documents/[id]/route.ts](apps/web/src/app/api/documents/[id]/route.ts)
  - [apps/web/src/app/api/documents/[id]/download/route.ts](apps/web/src/app/api/documents/[id]/download/route.ts)
- Added tests:
  - [apps/web/src/app/api/documents/[id]/route.test.ts](apps/web/src/app/api/documents/[id]/route.test.ts)
  - [apps/web/src/app/api/documents/[id]/download/route.test.ts](apps/web/src/app/api/documents/[id]/download/route.test.ts)
- Verification:
  - `pnpm vitest run "src/app/api/documents/[id]/route.test.ts" "src/app/api/documents/[id]/download/route.test.ts"`
  - `pnpm typecheck`

### API: Uploads

- Added shared core module: [apps/web/src/app/api/uploads/\_core.ts](apps/web/src/app/api/uploads/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/uploads/route.ts](apps/web/src/app/api/uploads/route.ts)
- Added tests: [apps/web/src/app/api/uploads/route.test.ts](apps/web/src/app/api/uploads/route.test.ts)
- Verification:
  - `pnpm vitest run src/app/api/uploads/route.test.ts`
  - `pnpm typecheck`

### API: Claims

- Added shared core module: [apps/web/src/app/api/claims/\_core.ts](apps/web/src/app/api/claims/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/claims/route.ts](apps/web/src/app/api/claims/route.ts)
- Added tests: [apps/web/src/app/api/claims/route.test.ts](apps/web/src/app/api/claims/route.test.ts)
- Verification:
  - `pnpm vitest run "src/app/api/claims/route.test.ts"`
  - `pnpm typecheck`

### API: Settings (Notifications)

- Added shared core module: [apps/web/src/app/api/settings/notifications/\_core.ts](apps/web/src/app/api/settings/notifications/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/settings/notifications/route.ts](apps/web/src/app/api/settings/notifications/route.ts)
- Tests: existing [apps/web/src/app/api/settings/notifications/route.test.ts](apps/web/src/app/api/settings/notifications/route.test.ts)
- Verification:
  - `pnpm vitest run "src/app/api/settings/notifications/route.test.ts"`
  - `pnpm typecheck`

### API: Settings (Push)

- Added shared core module: [apps/web/src/app/api/settings/push/\_core.ts](apps/web/src/app/api/settings/push/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/settings/push/route.ts](apps/web/src/app/api/settings/push/route.ts)
- Tests: existing [apps/web/src/app/api/settings/push/route.test.ts](apps/web/src/app/api/settings/push/route.test.ts)
- Verification:
  - `pnpm vitest run "src/app/api/settings/push/route.test.ts"`
  - `pnpm typecheck`

### API: Webhooks (Paddle)

- Added shared core module: [apps/web/src/app/api/webhooks/paddle/\_core.ts](apps/web/src/app/api/webhooks/paddle/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/webhooks/paddle/route.ts](apps/web/src/app/api/webhooks/paddle/route.ts)
- Added tests: [apps/web/src/app/api/webhooks/paddle/route.test.ts](apps/web/src/app/api/webhooks/paddle/route.test.ts)
- Verification:
  - `pnpm vitest run src/app/api/webhooks/paddle/route.test.ts`
  - `pnpm typecheck`

### API: Cron (Shared Auth)

- Added shared helper: [apps/web/src/app/api/cron/\_auth.ts](apps/web/src/app/api/cron/_auth.ts)

### API: Cron (Dunning)

- Added core module: [apps/web/src/app/api/cron/dunning/\_core.ts](apps/web/src/app/api/cron/dunning/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/cron/dunning/route.ts](apps/web/src/app/api/cron/dunning/route.ts)
- Added tests: [apps/web/src/app/api/cron/dunning/route.test.ts](apps/web/src/app/api/cron/dunning/route.test.ts)

### API: Cron (NPS)

- Added core module: [apps/web/src/app/api/cron/nps/\_core.ts](apps/web/src/app/api/cron/nps/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/cron/nps/route.ts](apps/web/src/app/api/cron/nps/route.ts)
- Added tests: [apps/web/src/app/api/cron/nps/route.test.ts](apps/web/src/app/api/cron/nps/route.test.ts)

### API: Cron (Engagement)

- Added core module: [apps/web/src/app/api/cron/engagement/\_core.ts](apps/web/src/app/api/cron/engagement/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/cron/engagement/route.ts](apps/web/src/app/api/cron/engagement/route.ts)
- Added tests: [apps/web/src/app/api/cron/engagement/route.test.ts](apps/web/src/app/api/cron/engagement/route.test.ts)

### API: Public (NPS)

- Added core module: [apps/web/src/app/api/public/nps/\_core.ts](apps/web/src/app/api/public/nps/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/public/nps/route.ts](apps/web/src/app/api/public/nps/route.ts)
- Tests: existing [apps/web/src/app/api/public/nps/route.test.ts](apps/web/src/app/api/public/nps/route.test.ts)

### API: Auth (Catch-all)

- Added shared core module: [apps/web/src/app/api/auth/[...all]/\_core.ts](apps/web/src/app/api/auth/[...all]/_core.ts)
- Refactored route to thin wrapper: [apps/web/src/app/api/auth/[...all]/route.ts](apps/web/src/app/api/auth/[...all]/route.ts)
- Added tests: [apps/web/src/app/api/auth/[...all]/route.test.ts](apps/web/src/app/api/auth/[...all]/route.test.ts)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/api/auth/[...all]/route.test.ts"`
  - `pnpm -C apps/web typecheck`

### Page: Member Claim Details

- Added shared core module: [apps/web/src/app/[locale]/(app)/member/claims/[id]/\_core.ts](<apps/web/src/app/[locale]/(app)/member/claims/[id]/_core.ts>)
- Refactored page to thin orchestration: [apps/web/src/app/[locale]/(app)/member/claims/[id]/page.tsx](<apps/web/src/app/[locale]/(app)/member/claims/[id]/page.tsx>)
- Added tests: [apps/web/src/app/[locale]/(app)/member/claims/[id]/\_core.test.ts](<apps/web/src/app/[locale]/(app)/member/claims/[id]/_core.test.ts>)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/(app)/member/claims/[id]/_core.test.ts"`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web typecheck`

### Page: Public Stats

- Added shared core module: [apps/web/src/app/[locale]/stats/\_core.ts](apps/web/src/app/[locale]/stats/_core.ts)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/stats/page.tsx](apps/web/src/app/[locale]/stats/page.tsx)
- Added tests: [apps/web/src/app/[locale]/stats/\_core.test.ts](apps/web/src/app/[locale]/stats/_core.test.ts)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/stats/_core.test.ts"`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web typecheck`

### Page: Agent Dashboard

- Added shared core module: [apps/web/src/app/[locale]/(agent)/agent/\_core.ts](<apps/web/src/app/[locale]/(agent)/agent/_core.ts>)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/(agent)/agent/page.tsx](<apps/web/src/app/[locale]/(agent)/agent/page.tsx>)
- Added tests: [apps/web/src/app/[locale]/(agent)/agent/\_core.test.ts](<apps/web/src/app/[locale]/(agent)/agent/_core.test.ts>)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/(agent)/agent/_core.test.ts"`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web typecheck`

### Page: Agent Leads

- Added shared core module: [apps/web/src/app/[locale]/(agent)/agent/leads/\_core.ts](<apps/web/src/app/[locale]/(agent)/agent/leads/_core.ts>)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/(agent)/agent/leads/page.tsx](<apps/web/src/app/[locale]/(agent)/agent/leads/page.tsx>)
- Added tests: [apps/web/src/app/[locale]/(agent)/agent/leads/\_core.test.ts](<apps/web/src/app/[locale]/(agent)/agent/leads/_core.test.ts>)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/(agent)/agent/leads/_core.test.ts"`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web typecheck`

### Page: Agent Lead Details

- Added shared core module: [apps/web/src/app/[locale]/(agent)/agent/leads/[id]/\_core.ts](<apps/web/src/app/[locale]/(agent)/agent/leads/[id]/_core.ts>)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/(agent)/agent/leads/[id]/page.tsx](<apps/web/src/app/[locale]/(agent)/agent/leads/[id]/page.tsx>)
- Added tests: [apps/web/src/app/[locale]/(agent)/agent/leads/[id]/\_core.test.ts](<apps/web/src/app/[locale]/(agent)/agent/leads/[id]/_core.test.ts>)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/(agent)/agent/leads/[id]/_core.test.ts"`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web typecheck`

### Page: Agent CRM

- Added shared core module: [apps/web/src/app/[locale]/(agent)/agent/crm/\_core.ts](<apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts>)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx](<apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx>)
- Added tests: [apps/web/src/app/[locale]/(agent)/agent/crm/\_core.test.ts](<apps/web/src/app/[locale]/(agent)/agent/crm/_core.test.ts>)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/(agent)/agent/crm/_core.test.ts"`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web typecheck`

### Page: Agent Client Details

- Added shared core module: [apps/web/src/app/[locale]/(agent)/agent/clients/[id]/\_core.ts](<apps/web/src/app/[locale]/(agent)/agent/clients/[id]/_core.ts>)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/(agent)/agent/clients/[id]/page.tsx](<apps/web/src/app/[locale]/(agent)/agent/clients/[id]/page.tsx>)
- Added tests: [apps/web/src/app/[locale]/(agent)/agent/clients/[id]/\_core.test.ts](<apps/web/src/app/[locale]/(agent)/agent/clients/[id]/_core.test.ts>)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/(agent)/agent/clients/[id]/_core.test.ts"`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web typecheck`

### Page: Services

- Added shared core module: [apps/web/src/app/[locale]/(site)/services/\_core.ts](<apps/web/src/app/[locale]/(site)/services/_core.ts>)
- Extracted UI sections to keep entrypoint thin: [apps/web/src/app/[locale]/(site)/services/\_sections.tsx](<apps/web/src/app/[locale]/(site)/services/_sections.tsx>)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/(site)/services/page.tsx](<apps/web/src/app/[locale]/(site)/services/page.tsx>)
- Added tests: [apps/web/src/app/[locale]/(site)/services/\_core.test.ts](<apps/web/src/app/[locale]/(site)/services/_core.test.ts>)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/(site)/services/_core.test.ts" "src/app/[locale]/(site)/services/page.test.tsx"`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web typecheck`

### Page: Member Membership

- Added shared core module: [apps/web/src/app/[locale]/(app)/member/membership/\_core.ts](<apps/web/src/app/[locale]/(app)/member/membership/_core.ts>)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/(app)/member/membership/page.tsx](<apps/web/src/app/[locale]/(app)/member/membership/page.tsx>)
- Added tests: [apps/web/src/app/[locale]/(app)/member/membership/\_core.test.ts](<apps/web/src/app/[locale]/(app)/member/membership/_core.test.ts>)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/(app)/member/membership/_core.test.ts"`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web typecheck`

### Page: Admin Claim Details

- Added shared core module: [apps/web/src/app/[locale]/admin/claims/[id]/\_core.ts](apps/web/src/app/[locale]/admin/claims/[id]/_core.ts)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/admin/claims/[id]/page.tsx](apps/web/src/app/[locale]/admin/claims/[id]/page.tsx)
- Added tests: [apps/web/src/app/[locale]/admin/claims/[id]/\_core.test.ts](apps/web/src/app/[locale]/admin/claims/[id]/_core.test.ts)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/admin/claims/[id]/_core.test.ts"`
  - `pnpm -C apps/web typecheck`

### Page: Admin Analytics

- Added shared core module: [apps/web/src/app/[locale]/admin/analytics/\_core.ts](apps/web/src/app/[locale]/admin/analytics/_core.ts)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/admin/analytics/page.tsx](apps/web/src/app/[locale]/admin/analytics/page.tsx)
- Added tests: [apps/web/src/app/[locale]/admin/analytics/\_core.test.ts](apps/web/src/app/[locale]/admin/analytics/_core.test.ts)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/admin/analytics/_core.test.ts"`
  - `pnpm -C apps/web typecheck`

### Page: Admin User Profile

- Added shared core module: [apps/web/src/app/[locale]/admin/users/[id]/\_core.ts](apps/web/src/app/[locale]/admin/users/[id]/_core.ts)
- Refactored page to thin wrapper: [apps/web/src/app/[locale]/admin/users/[id]/page.tsx](apps/web/src/app/[locale]/admin/users/[id]/page.tsx)
- Added tests: [apps/web/src/app/[locale]/admin/users/[id]/\_core.test.ts](apps/web/src/app/[locale]/admin/users/[id]/_core.test.ts)
- Verification:
  - `pnpm -C apps/web vitest run "src/app/[locale]/admin/users/[id]/_core.test.ts"`
  - `pnpm -C apps/web typecheck`

### Libs: Core/Wrappers

- Split implementation into `*.core.ts` and kept stable import paths via thin wrapper re-exports:
  - [apps/web/src/lib/cron-service.core.ts](apps/web/src/lib/cron-service.core.ts) + [apps/web/src/lib/cron-service.ts](apps/web/src/lib/cron-service.ts)
  - [apps/web/src/lib/push.core.ts](apps/web/src/lib/push.core.ts) + [apps/web/src/lib/push.ts](apps/web/src/lib/push.ts)
  - [apps/web/src/lib/notifications.core.ts](apps/web/src/lib/notifications.core.ts) + [apps/web/src/lib/notifications.ts](apps/web/src/lib/notifications.ts)
- Verification (push/notifications):
  - `pnpm -C apps/web vitest run src/lib/push.test.ts src/lib/notifications.test.ts`
  - `pnpm -C apps/web typecheck`

### Actions: Messages (Send)

- Extracted DB/audit logic into core module: [apps/web/src/actions/messages/send.core.ts](apps/web/src/actions/messages/send.core.ts)
- Kept action wrapper focused on Next revalidation + notifications: [apps/web/src/actions/messages/send.ts](apps/web/src/actions/messages/send.ts)
- Added tests: [apps/web/src/actions/messages/send.core.test.ts](apps/web/src/actions/messages/send.core.test.ts)
- Verification:
  - `pnpm -C apps/web test:unit -- src/actions/messages/send.core.test.ts`
  - `pnpm -C apps/web typecheck`

### Autopilot: Entrypoints + Modules (Including Small Files)

- Applied repo-wide mechanical modularization using [scripts/modularize-autopilot.mjs](scripts/modularize-autopilot.mjs):
  - Entrypoints (`page.tsx`/`layout.tsx`/`route.ts`) moved to sibling `_core.ts` / `_core.entry.tsx` and replaced with thin re-export wrappers.
  - Module files under `apps/web/src/lib` + `apps/web/src/actions` moved to sibling `*.core.ts(x)` and replaced with thin re-export wrappers.
  - Wrapper generation preserves default exports to avoid breaking default imports.
- Verification:
  - `pnpm -C apps/web typecheck`
  - `pnpm -C apps/web test:unit`

### Verification (Batch)

- `pnpm vitest run src/app/api/cron/dunning/route.test.ts src/app/api/cron/nps/route.test.ts src/app/api/cron/engagement/route.test.ts src/app/api/webhooks/paddle/route.test.ts src/app/api/public/nps/route.test.ts`
- `pnpm typecheck`

## Remaining (Known)

- API routes still using `next/headers`: none known
- Other API routes to assess next:
  - none queued
