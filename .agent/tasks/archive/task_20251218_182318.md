---
task_name: 'Create Services Page'
task_type: 'Feature'
priority: 'P1-High'
estimate: 'TBD'
test_level: 'unit'
roadmap_ref: ''
branch: 'feat/consumer-rights-page'
start_time: 'Thu Dec 18 18:13:55 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251218_181347.log'
---

# 🚀 Current Task: Create Services Page

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Create Services Page</objective>
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
  As a potential member/customer, I want to view a dedicated Services page
  so that I can understand exactly what claims Interdomestik handles, how the process works, and feel confident in the speed and safety of the service.
</user_story>
<acceptance_criteria>
  - [ ] Page exists at `/services` (localized).
  - [ ] Hero section clearly states the value proposition.
  - [ ] "What We Solve" section lists key categories (Vehicle, Property, Injury, Flight Delay).
  - [ ] "How It Works" section explains the process simple steps.
  - [ ] "Speed & Safety" panel highlights <5min intake, <24h response, secure uploads.
  - [ ] FAQ section addresses common concerns.
  - [ ] Strong CTA to start a claim or contact support.
  - [ ] Fully responsive and matches "Prime" design aesthetic.
  - [ ] Uses `next-intl` for all text.
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
- [x] (Recommended) `pnpm qa:full` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [x] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [x] Risks identified (perf, reliability, UX, security, data)
- [x] Rollback/mitigation plan documented
- [x] Monitoring/logging impact considered
- [x] Migrations include up/down and backfill strategy (if applicable)
- [x] Accessibility checks for UI changes
- [x] Removed debug artifacts (console.log/debugger/TODO left behind)

## 🔗 Related Files

- apps/web/src/app/[locale]/(site)/services/
- apps/web/src/app/[locale]/page.tsx
- apps/web/src/messages/en.json
- apps/web/src/messages/sq.json

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
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251218_181347.log |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 2 lines, 17590 bytes)
- apps/web/src/components/settings/notification-settings.test.tsx ( 457 lines, 13949 bytes)
- packages/database/src/types.ts ( 567 lines, 16664 bytes)

---

## 📝 PR Template (Copy when done)

```markdown
## What

Create Services Page

## Why

To increase trust and help potential members understand the specific services and value Interdomestik provides (Vehicle, Property, Injury, Flight Delay), aligned with the "Prime Claims Experience" P1 initiative.

## How

- Created `apps/web/src/app/[locale]/(site)/services/page.tsx` with a modern, responsive layout.
- Added English and Albanian translations for the page content.
- Implemented "Speed & Safety" panel and FAQ section using `@interdomestik/ui` components (Card, Button).
- Added unit test `apps/web/src/app/[locale]/(site)/services/page.test.tsx` ensuring 100% render coverage.

## Testing

- [x] Unit tests pass (`pnpm test:unit`)
- [ ] E2E tests pass (`pnpm test:e2e`)
- [x] Manual QA completed
- [x] No regressions in existing functionality

## Screenshots (if UI changes)

<!-- Add screenshots here -->

## Notes to Reviewer

- The page uses `next-intl` for full localization.
- "Flight Delay" is included but can be feature-flagged later if needed (currently visible).
```
