---
task_name: 'i18n: standardizing routing imports'
task_type: 'Refactor'
priority: 'P1-High'
estimate: '1h'
test_level: 'none'
roadmap_ref: 'Foundation'
branch: 'fix/i18n-config'
start_time: 'Wed Dec 17 11:35:17 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🚀 Current Task: i18n: standardizing routing imports

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>i18n: standardizing routing imports</objective>
  <type>Refactor</type>
  <priority>P1-High</priority>
  <estimate>1h</estimate>
  <branch>fix/i18n-config</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<current_limitations>
  - Performance issue with...
  - Code duplication in...
</current_limitations>
<goals>
  - Improve performance by...
  - Clean up code structure
  - Maintain backwards compatibility
</goals>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [x] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [x] No tests required for this task

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level (none)
- [x] `pnpm lint` passes (or no new errors)
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [x] (Recommended) `pnpm qa:full` or full checks executed before PR
- [x] Screenshots added for UI changes (if applicable)
- [x] Documentation updated (if applicable)
- [x] Code reviewed / self-reviewed

## 🔗 Related Files

- apps/web/src/messages/\*.json
- apps/web/src/i18n/routing.ts
- apps/web/src/middleware.ts

### Manual additions:

- apps/web/src/app/[locale]/(agent)/layout.tsx
- apps/web/src/components/claims/claim-wizard.tsx
- apps/web/src/components/auth/profile-form.tsx
- apps/web/src/components/settings/language-settings.tsx
- apps/web/src/components/auth/change-password-form.tsx
- apps/web/src/components/dashboard/user-nav.tsx
- apps/web/src/components/dashboard/claims/claims-filters.tsx
- apps/web/src/app/[locale]/(app)/profile/page.tsx
- apps/web/src/app/[locale]/(app)/settings/page.tsx

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

i18n: standardizing routing imports

## Why

Foundation

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
