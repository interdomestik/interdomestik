---
task_name: 'Messaging/Chat'
task_type: 'Feature'
priority: 'P1-High'
estimate: '3d'
test_level: 'component'
roadmap_ref: 'Phase 2'
branch: 'feat/messaging-system'
start_time: 'Tue Dec 16 23:35:11 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🚀 Current Task: Messaging/Chat

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Messaging/Chat</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>3d</estimate>
  <branch>feat/messaging-system</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As a claimant, I want to communicate with my assigned agent via in-app messaging
  so that I can ask questions and receive updates without leaving the platform.

  As an agent, I want to send and receive messages on claims I manage
  so that I can provide timely support and document all communication.
</user_story>
<acceptance_criteria>
  - [x] DB: Add `claimMessages` table to Drizzle schema mirroring Supabase `claim_messages`.
  - [x] Actions: Create `sendMessage` and `getMessages` server actions.
  - [x] UI: Create `MessageThread` component showing conversation history.
  - [x] UI: Create `MessageInput` component for sending messages.
  - [x] Integration: Add messaging panel to claim detail page (member view).
  - [x] Integration: Add messaging panel to agent claim detail page.
  - [x] Realtime: (Optional) Use Supabase Realtime for live updates OR polling fallback.
  - [x] i18n: All UI strings localized (en, sq).
  - [ ] Tests: Unit tests for actions, component tests for UI.
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [ ] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [ ] Unit tests added: `src/**/*.test.ts`
- [ ] Component tests added: `src/**/*.test.tsx`
- [x] Tests use factories from `src/test/factories.ts`
- [x] Run: `pnpm test:unit`
- [x] All tests pass (60/60)

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

- packages/database/src/schema.ts (add claimMessages table)
- apps/web/src/actions/messages.ts (new: sendMessage, getMessages)
- apps/web/src/components/messaging/message-thread.tsx (new)
- apps/web/src/components/messaging/message-input.tsx (new)
- apps/web/src/app/[locale]/(app)/dashboard/claims/[id]/page.tsx (integrate)
- apps/web/src/app/[locale]/(agent)/agent/claims/[id]/page.tsx (integrate)
- packages/database/src/types.ts (claim_messages already exists)

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

Messaging/Chat

## Why

Phase 2

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
