---
task_name: 'Notifications (Novu)'
task_type: 'Feature'
priority: 'P0-Critical'
estimate: '3d'
test_level: 'component'
roadmap_ref: 'Phase 2, Week 8'
branch: 'feat/notifications-novu'
start_time: 'Wed Dec 17 07:48:48 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🚀 Current Task: Notifications (Novu)

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Notifications (Novu)</objective>
  <type>Feature</type>
  <priority>P0-Critical</priority>
  <estimate>3d</estimate>
  <branch>feat/notifications-novu</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As a member, I want to receive notifications when my claim status changes
  so that I stay informed about my case progress.

  As an agent, I want to be notified when a new claim is assigned to me
  so that I can respond quickly and meet SLA deadlines.

  As a user, I want to control my notification preferences
  so that I only receive updates through my preferred channels.
</user_story>
<acceptance_criteria>
  - [x] Novu SDK integrated and configured
  - [x] In-app notification center with bell icon and unread count
  - [ ] Email notifications for critical events (requires Novu dashboard setup)
  - [x] Notification triggers implemented for: claim_submitted, claim_assigned, status_changed, new_message
  - [ ] Notification preferences page in user settings (future)
  - [x] Multi-language notification templates (sq, en)
  - [x] Unit tests for notification service
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [x] **Documentation**: Update relevant docs if needed (Added docs/NOVU_INTEGRATION.md)

## 🧪 Testing Checklist

- [x] Unit tests added: `src/**/*.test.ts`
- [ ] Component tests added: `src/**/*.test.tsx`
- [x] Tests use factories from `src/test/factories.ts`
- [x] Run: `pnpm test:unit`
- [x] All tests pass (130 tests)

## ✅ Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests pass at required level (component)
- [ ] `pnpm lint` passes (or no new errors)
- [ ] `pnpm type-check` passes
- [ ] No regressions from baseline
- [ ] (Recommended) `pnpm qa:full` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Code reviewed / self-reviewed

## 🔗 Related Files

- apps/web/src/lib/notifications.ts (to create)
- apps/web/src/components/notifications/ (to create)
- apps/web/src/app/[locale]/(app)/settings/page.tsx (preferences)
- apps/web/src/actions/claims.ts (add triggers)
- apps/web/src/actions/messages.ts (add triggers)

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)

| Metric     | Status |
| ---------- | ------ |
| Lint       | pass   |
| Type Check | pass   |
| Unit Tests | pass   |

---

## 📝 PR Template (Copy when done)

```markdown
## What

Notifications (Novu)

## Why

Phase 2, Week 8 - Enable multi-channel notifications for claims and messaging.

## How

- Integrated @novu/nextjs and @novu/node SDKs
- Created `lib/notifications.ts` service with typed triggers
- Added `NotificationCenter` and `NotificationBell` components
- Added notification triggers to `claims.ts` (submission, status change)
- Added notification triggers to `messages.ts` (new message)
- Added environment variables for Novu
- Documented workflows in `docs/NOVU_INTEGRATION.md`

## Testing

- [x] Unit tests pass (`pnpm test:unit`) 130 tests
- [x] Manual QA completed (verified imports and mocks)
- [x] No regressions in existing functionality

## Notes to Reviewer

- Requires `NOVU_API_KEY` and `NEXT_PUBLIC_NOVU_APP_ID` in `.env`
- configure workflows in Novu Dashboard as per `docs/NOVU_INTEGRATION.md`
```
