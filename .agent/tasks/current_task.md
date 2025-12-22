---
task_name: 'Develop prime Thank-you Letter (email + PDF + QR) based on the promo elements of Hero Page'
task_type: 'Feature'
priority: 'P1-High'
estimate: '4h'
test_level: 'unit'
roadmap_ref: 'Phase 1, Remaining Tasks'
branch: 'feat/commission-pages'
start_time: 'Mon Dec 22 15:25:53 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'fail (exit 2)'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251222_152534.log'
---

# 🚀 Current Task: Develop prime Thank-you Letter (email + PDF + QR) based on the promo elements of Hero Page

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Develop prime Thank-you Letter (email + PDF + QR) based on the promo elements of Hero Page</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>4h</estimate>
  <branch>feat/commission-pages</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As a new member, I want to receive a premium Thank-you Letter
  so that I feel valued and have all details about my membership.
</user_story>
<acceptance_criteria>
  - [x] Thank-you email with prime branding (gradient header, trust elements)
  - [x] Include member number, plan details, QR code
  - [x] Trust elements from Hero page (8,500+ members, 24h case opening, 100% protection)
  - [x] PDF version attached to email
  - [x] QR code links to member dashboard
  - [x] Translations (en, sq)
  - [x] Unit tests for email template
  - [x] Trigger email on subscription creation
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [x] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [x] Unit tests added: `src/**/*.test.ts`
- [x] Tests use factories from `src/test/factories.ts`
- [x] Run: `pnpm test:unit`
- [x] All tests pass

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level (unit)
- [x] `pnpm lint` passes (or no new errors)
- [x] Formatter/Prettier check passes
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [x] (Recommended) `pnpm qa:full` or full checks executed before PR
- [x] Screenshots added for UI changes (if applicable)
- [x] Documentation updated (if applicable)
- [x] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [x] Risks identified (perf, reliability, UX, security, data)
- [x] Rollback/mitigation plan documented
- [x] Monitoring/logging impact considered
- [N/A] Migrations include up/down and backfill strategy (if applicable)
- [x] Accessibility checks for UI changes
- [x] Removed debug artifacts (console.log/debugger/TODO left behind)
- [x] New/updated strings added to locales and `pnpm i18n:check` run (if applicable)
- [x] New components kept small; split view vs hooks/logic; co-located tests/stories added
- [x] Oversized file remediation noted (if any)

## 🧩 New Components & Files Checklist

- [x] File size under limits (soft 250 lines, hard 400); split view vs logic/hooks if larger
- [x] Co-located test (`*.test.tsx`) and story/demo (if using Storybook/MDX)
- [x] i18n keys added for any new UI strings
- [x] Accessibility verified (labels/roles/focus)
- [x] Imported shared styles/components (@interdomestik/ui) where applicable

## 🚦 Completion Gate (must be TRUE before declaring Done)

- [x] All checkboxes above are checked (DoD, Senior, New Components)
- [x] Required tests/QA in this task file have been executed and are green
- [x] No unchecked items remain in this file (if not applicable, explicitly mark N/A)
- [x] current_task is only marked complete after verifying every required checkbox

## 🔗 Related Files

<!-- Add discovered file paths here -->

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)

| Metric     | Status                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Lint       | pass                                                                                           |
| Type Check | fail (exit 2)                                                                                  |
| Unit Tests | pass                                                                                           |
| Format     | fail (exit 1)                                                                                  |
| Coverage   | skipped                                                                                        |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251222_152534.log |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 937 lines, 26696 bytes)
- apps/web/src/app/[locale]/admin/users/[id]/page.tsx ( 366 lines, 15335 bytes)
- apps/web/src/app/[locale]/(agent)/agent/users/[id]/page.tsx ( 383 lines, 15977 bytes)
- apps/web/src/actions/claims.test.ts ( 418 lines, 12877 bytes)
- apps/web/src/actions/claims.ts ( 429 lines, 11779 bytes)

## 📏 Changed Files Size Check (>400 lines or >15000 bytes)

Changed files are within limits

---

## 📝 PR Template (Copy when done)

```markdown
## What

Develop prime Thank-you Letter (email + PDF + QR) based on the promo elements of Hero Page

## Why

Phase 1, Remaining Tasks

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
