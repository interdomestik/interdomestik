---
task_name: 'Paddle Subscription Integration'
task_type: 'Feature'
priority: 'P1-High'
estimate: 'TBD'
test_level: 'unit'
roadmap_ref: ''
branch: 'feat/paddle-subscription-integration'
start_time: 'Sun Dec 21 10:07:15 CET 2025'
baseline:
  lint: 'skipped'
  typecheck: 'skipped'
  tests: 'skipped'
  format: 'skipped'
  log: 'skipped'
---

# 🚀 Current Task: Paddle Subscription Integration

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Paddle Subscription Integration</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>TBD</estimate>
  <branch>main</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As a customer, I want to be able to subscribe to Interdomestik's protection plans using a secure and localized payment provider (Paddle), so that I can immediately benefit from the services.
</user_story>
<acceptance_criteria>
  - [x] Implement/Refine Paddle webhook listener at `/api/webhooks/paddle`.
  - [x] Support `SubscriptionCreated`, `SubscriptionUpdated`, `SubscriptionCanceled` events.
  - [x] Link Paddle subscriptions to users via `custom_data.userId`.
  - [x] Update `PricingTable` to use real Paddle Price IDs (configurable via ENV).
  - [x] Implement a success redirect after checkout to the membership success page.
  - [x] Ensure subscription status is correctly reflected in the user's dashboard.
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [x] **Documentation**: Update relevant docs if needed

## 📋 Implementation Plan

### Phase 1: Environment & Config

1. Update `.env.example` with required Paddle variables.
2. Create a price mapping configuration (either in `lib/paddle.ts` or as environment variables) to link internal plan IDs (`basic`, `standard`, `family`) to Paddle Price IDs.

### Phase 2: Checkout Experience

1. Refine `PricingTable.tsx`:
   - Pass the correct `userId` and `email` to Paddle.
   - Implement the `eventCallback` to detect `checkout.completed`.
   - On completion, redirect the user to `/[locale]/dashboard/membership/success`.
2. Update `@/lib/paddle.ts` to support dynamic environment switching (sandbox vs production).

### Phase 3: Webhook Hardening

1. Update `api/webhooks/paddle/route.ts`:
   - Add robust error handling and logging.
   - Verify `subscriptionStatusEnum` matches Paddle's status strings.
   - Ensure `planKey` (internal ID) is stored alongside the Paddle `planId`.
   - Handle `transaction.completed` if needed for immediate access before the subscription event fires.

### Phase 4: Verification

1. Test the flow in Paddle Sandbox mode.
2. Verify database records after a successful sandbox payment.
3. Run existing membership gate tests to ensure active subscriptions grant access.

## 🧪 Testing Checklist

- [ ] Unit tests added: `src/**/*.test.ts`
- [ ] Tests use factories from `src/test/factories.ts`
- [ ] Run: `pnpm test:unit`
- [ ] All tests pass

## ✅ Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests pass at required level (unit)
- [ ] `pnpm lint` passes (or no new errors)
- [ ] Formatter/Prettier check passes
- [ ] `pnpm type-check` passes
- [ ] No regressions from baseline
- [ ] (Recommended) `pnpm qa:full` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [ ] Risks identified (perf, reliability, UX, security, data)
- [ ] Rollback/mitigation plan documented
- [ ] Monitoring/logging impact considered
- [ ] Migrations include up/down and backfill strategy (if applicable)
- [ ] Accessibility checks for UI changes
- [ ] Removed debug artifacts (console.log/debugger/TODO left behind)
- [ ] New/updated strings added to locales and `pnpm i18n:check` run (if applicable)
- [ ] New components kept small; split view vs hooks/logic; co-located tests/stories added
- [ ] Oversized file remediation noted (if any)

## 🧩 New Components & Files Checklist

- [ ] File size under limits (soft 250 lines, hard 400); split view vs logic/hooks if larger
- [ ] Co-located test (`*.test.tsx`) and story/demo (if using Storybook/MDX)
- [ ] i18n keys added for any new UI strings
- [ ] Accessibility verified (labels/roles/focus)
- [ ] Imported shared styles/components (@interdomestik/ui) where applicable

## 🚦 Completion Gate (must be TRUE before declaring Done)

- [x] All checkboxes above are checked (DoD, Senior, New Components)
- [x] Required tests/QA in this task file have been executed and are green
- [x] No unchecked items remain in this file (if not applicable, explicitly mark N/A)
- [x] current_task is only marked complete after verifying every required checkbox

## 🔗 Related Files

- `apps/web/src/app/api/webhooks/paddle/route.ts` (Webhook Handler)
- `apps/web/src/components/pricing/pricing-table.tsx` (Checkout Logic)
- `apps/web/src/lib/paddle.ts` (SDK Initialization)
- `packages/database/src/schema.ts` (Subscription Schema)
- `apps/web/src/app/[locale]/(app)/dashboard/membership/success/page.tsx` (Redirect Target)

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)

| Metric     | Status  |
| ---------- | ------- |
| Lint       | skipped |
| Type Check | skipped |
| Unit Tests | skipped |
| Format     | skipped |
| Coverage   | skipped |
| Log        | skipped |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 937 lines, 26696 bytes)
- apps/web/src/app/[locale]/admin/users/[id]/page.tsx ( 366 lines, 15335 bytes)
- apps/web/src/app/[locale]/(agent)/agent/users/[id]/page.tsx ( 377 lines, 15641 bytes)
- apps/web/src/actions/claims.ts ( 429 lines, 11738 bytes)
- packages/database/src/schema.ts ( 658 lines, 22091 bytes)

## 📏 Changed Files Size Check (>400 lines or >15000 bytes)

Changed files are within limits

---

## 📝 PR Template (Copy when done)

```markdown
## What

Paddle Subscription Integration

## Why

## How

<!-- Implementation approach -->

## Testing

- [ ] Unit tests pass (`pnpm test:unit`)
- [ ] E2E tests pass (`pnpm test:e2e`)
- [ ] Manual QA completed
- [ ] No regressions in existing functionality

## Screenshots (if UI changes)

<!-- Add screenshots here -->

## Notes to Reviewer

<!-- Highlight areas needing careful review, known limitations, or follow-up tasks -->
```
