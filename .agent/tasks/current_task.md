# Current Task: Dunning Flow Implementation

## 📋 Task Details

| Field                 | Value                                                 |
| --------------------- | ----------------------------------------------------- |
| **Task Name**         | Dunning Flow - Implement grace period and retry logic |
| **Task Type**         | Feature Implementation                                |
| **Priority**          | P1-High                                               |
| **Estimate**          | 8h                                                    |
| **Testing Level**     | Unit + Component                                      |
| **Roadmap Reference** | Phase 1: Membership Infrastructure (Weeks 1-2)        |
| **Created**           | 2025-12-21T13:36:59+01:00                             |
| **Branch**            | feat/paddle-subscription-integration                  |

---

## 🎯 Objective

Implement a complete dunning flow to handle failed payments, grace periods, and subscription lifecycle management. This ensures members don't lose access immediately when payments fail, while protecting revenue.

---

## 📖 User Story

<user_story>
As a **subscribed member**, I want a grace period when my payment fails
so that I don't immediately lose access to my membership benefits.

As an **admin**, I want automatic retry attempts and notifications
so that we maximize payment recovery without manual intervention.

As a **member**, I want clear communication about payment issues
so that I can update my payment method before losing access.
</user_story>

---

## ✅ Acceptance Criteria

### Grace Period (14 days)

- [ ] Member retains full access during grace period after payment failure
- [ ] Dashboard shows clear warning about payment issue
- [ ] Grace period end date is displayed prominently
- [ ] Automatic downgrade/lock after grace period expires

### Retry Logic (3 attempts)

- [ ] Paddle handles automatic retry (configured in dashboard)
- [ ] Webhook handler processes `subscription.past_due` events
- [ ] Each retry triggers notification to member
- [ ] Final failure triggers `subscription.canceled` (or stays `past_due`)

### Email Notifications (3 emails)

- [ ] Email 1 (Day 0): Payment failed, update payment method
- [ ] Email 2 (Day 7): Reminder, 7 days left
- [ ] Email 3 (Day 13): Final warning, 1 day left

### Database & Status

- [ ] Add `grace_period_end` field to subscriptions table
- [ ] Track `payment_failed_at` timestamp
- [ ] Track `retry_count` for payment attempts
- [ ] Status transitions: `active` → `past_due` → `canceled`

### UI Indicators

- [ ] Dashboard banner for past_due status
- [ ] "Update Payment Method" button (links to Paddle portal)
- [ ] Countdown timer showing days remaining
- [ ] Lock indicator for expired grace period

---

## 🗺️ Related Files

### Database

- `packages/database/src/schema.ts` - Subscription table/fields
- `packages/database/drizzle/` - Migration files

### Webhook Handler

- `apps/web/src/app/api/webhooks/paddle/route.ts` - Event processing

### Email/Notifications

- `apps/web/src/lib/email/` - Email templates (if exists)
- `.env` - Email provider config

### Dashboard

- `apps/web/src/app/[locale]/(app)/dashboard/membership/page.tsx`
- `apps/web/src/components/membership/` - UI components

### Paddle Integration

- `apps/web/src/config/paddle.ts` - Paddle config
- `docs/PADDLE_SETUP.md` - Documentation

---

## 📊 QA Baseline

| Check      | Status     |
| ---------- | ---------- |
| Lint       | ⏳ Pending |
| Typecheck  | ⏳ Pending |
| Unit Tests | ⏳ Pending |
| Format     | ⏳ Pending |

---

## 📝 Implementation Plan

### Phase 1: Database Schema (1h)

1. Add migration for grace period fields
   ```sql
   ALTER TABLE subscriptions ADD COLUMN grace_period_end TIMESTAMP;
   ALTER TABLE subscriptions ADD COLUMN payment_failed_at TIMESTAMP;
   ALTER TABLE subscriptions ADD COLUMN retry_count INTEGER DEFAULT 0;
   ```
2. Update Drizzle schema
3. Run migration

### Phase 2: Webhook Handler Updates (2h)

1. Handle `subscription.past_due` event
   - Set `payment_failed_at` to now
   - Calculate `grace_period_end` = now + 14 days
   - Increment `retry_count`
   - Trigger notification email
2. Handle `subscription.updated` (payment recovered)
   - Clear grace period fields
   - Update status to `active`
3. Handle grace period expiration
   - Lock features / set status appropriately

### Phase 3: Email Notifications (2h)

1. Create email templates:
   - `payment-failed.tsx`
   - `payment-reminder.tsx`
   - `payment-final-warning.tsx`
2. Set up email sending (Resend/Novu)
3. Integrate with webhook handler

### Phase 4: Dashboard UI (2h)

1. Create `PaymentWarningBanner` component
2. Show grace period countdown
3. Add "Update Payment Method" button
4. Show locked state after grace expires

### Phase 5: Testing (1h)

1. Unit tests for status transitions
2. Test webhook handler logic
3. Verify email triggers
4. E2E test for grace period flow

---

## 🔧 Technical Notes

### Paddle Dunning Configuration

Paddle handles automatic retries. Configure in Dashboard:

- Developer Tools → Notifications → Subscriptions
- Default retry schedule: Day 1, 3, 5, 7

### Grace Period Logic

```typescript
// Calculate grace period end
const gracePeriodDays = 14;
const graceEnd = new Date(paymentFailedAt);
graceEnd.setDate(graceEnd.getDate() + gracePeriodDays);

// Check if still in grace period
const isInGracePeriod = new Date() < graceEnd;
```

### Status Flow

```
active → past_due → (retry success) → active
                  → (retry fail) → canceled/locked
```

---

## 📌 Constraints

- Use existing Paddle webhook infrastructure
- Follow project design system (@interdomestik/ui)
- Translations required for all user-facing text
- No external email provider yet (may need to add)

---

## 📈 Progress Log

| Time  | Action       |
| ----- | ------------ |
| 13:36 | Task created |
|       |              |

---

## 🚀 Next Steps

1. **First**: Check current database schema for subscriptions
2. **Then**: Create migration for grace period fields
3. **Then**: Update webhook handler for past_due events
4. **Finally**: Build dashboard UI components
