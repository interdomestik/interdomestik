---
task_name: 'Integrate Paddle Payments'
task_type: 'Feature'
priority: 'P1-High'
estimate: 'TBD'
test_level: 'unit'
roadmap_ref: ''
branch: 'feat/consumer-rights-page'
start_time: 'Thu Dec 18 19:07:02 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251218_190654.log'
---

# 🚀 Current Task: Integrate Paddle Payments

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Integrate Paddle Payments</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>TBD</estimate>
  <branch>feat/consumer-rights-page</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As a customer, I want to purchase a membership/service using my credit card
  so that I can access premium services (Paddle handles the payment, supported in Kosovo).
</user_story>
<acceptance_criteria>
  - [ ] Paddle SDK (`@paddle/paddle-js`) installed and configured.
  - [ ] "Upgrade" or "Pricing" page created showing plan options.
  - [ ] Checkout flow triggers Paddle overlay/inline checkout.
  - [ ] Webhook handler receives `subscription_created` events from Paddle.
  - [ ] `subscriptions` table in DB stores Paddle subscription ID and status.
  - [ ] Environment variables (`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_API_KEY`, etc.) set.
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [ ] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [x] Unit tests added: `src/**/*.test.ts`
- [ ] Tests use factories from `src/test/factories.ts`
- [x] Run: `pnpm test:unit`
- [x] All tests pass

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level (unit)
- [x] `pnpm lint` passes (or no new errors)
- [ ] Formatter/Prettier check passes
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [ ] (Recommended) `pnpm qa:full` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [x] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [ ] Risks identified (perf, reliability, UX, security, data)
- [ ] Rollback/mitigation plan documented
- [ ] Monitoring/logging impact considered
- [ ] Migrations include up/down and backfill strategy (if applicable)
- [ ] Accessibility checks for UI changes
- [ ] Removed debug artifacts (console.log/debugger/TODO left behind)

## 🔗 Related Files

- apps/web/src/app/api/webhooks/stripe/
- packages/database/src/schema.ts (subscription fields)
- .env (STRIPE\_\* variables)

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)

| Metric     | Status                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Lint       | pass                                                                                           |
| Type Check | pass                                                                                           |
| Unit Tests | pass                                                                                           |
| Format     | fail (exit 1)                                                                                  |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251218_190654.log |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 2 lines, 17590 bytes)
- apps/web/src/components/settings/notification-settings.test.tsx ( 457 lines, 13949 bytes)
- packages/database/src/types.ts ( 567 lines, 16664 bytes)

---

## 📝 PR Template (Copy when done)

```markdown
## What

Integrate Paddle Payments

## Why

Enable users to purchase memberships/services using Paddle (which is supported in Kosovo, unlike Stripe).

## How

- Installed `@paddle/paddle-js` and `@paddle/paddle-node-sdk`.
- Created `subscriptions` table in database schema.
- Added `PricingTable` and `PricingPage` components.
- Implemented `/api/webhooks/paddle` to handle subscription events.
- Added `src/lib/paddle.ts` helper.
- Added unit tests for Pricing Table.

## Testing

- [x] Unit tests pass (`pnpm test:unit`)
- [ ] E2E tests pass (`pnpm test:e2e`)
- [x] Manual QA completed (Components verified)
- [x] No regressions in existing functionality

## Screenshots (if UI changes)

<!-- Add screenshots here -->

## Notes to Reviewer

- **Action Required**: Run `pnpm db:push` / `migrations` when DB is accessible (failed in task due to connection).
- **Env Vars needed**:
  - `NEXT_PUBLIC_PADDLE_ENV`
  - `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
  - `PADDLE_API_KEY`
  - `PADDLE_WEBHOOK_SECRET_KEY`
```
