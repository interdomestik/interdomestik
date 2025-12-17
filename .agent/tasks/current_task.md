---
task_name: 'Build Agent Claim Workflow'
task_type: 'Feature'
priority: 'P1-High'
estimate: '2h'
test_level: 'component'
roadmap_ref: ''
branch: 'fix/i18n-config'
start_time: 'Wed Dec 17 13:24:50 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'fail (exit 254)'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251217_132445.log'
---

# 🚀 Current Task: Build Agent Claim Workflow

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Build Agent Claim Workflow</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>2h</estimate>
  <branch>fix/i18n-config</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As a [user type], I want to [action]
  so that I can [benefit].
</user_story>
<acceptance_criteria>
  - [ ] Criterion 1
  - [ ] Criterion 2
  - [ ] Criterion 3
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [ ] **Exploration**: Identify files using `project_map` and `read_files`
- [ ] **Planning**: Create a step-by-step implementation plan
- [ ] **Implementation**: Execute code changes
- [ ] **Verification**: Run `pnpm qa` or relevant tests
- [ ] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [ ] Unit tests added: `src/**/*.test.ts`
- [ ] Component tests added: `src/**/*.test.tsx`
- [ ] Tests use factories from `src/test/factories.ts`
- [ ] Run: `pnpm test:unit`
- [ ] All tests pass

## ✅ Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests pass at required level (component)
- [ ] `pnpm lint` passes (or no new errors)
- [ ] Formatter/Prettier check passes
- [ ] `pnpm type-check` passes
- [ ] No regressions from baseline
- [ ] (Recommended) `pnpm qa:full` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [x] Risks identified (perf, reliability, UX, security, data) - RBAC enforced, enum validation
- [x] Rollback/mitigation plan documented - Feature branch, git revert available
- [x] Monitoring/logging impact considered - No new logs, recommend Sentry for prod
- [x] Migrations include up/down and backfill strategy (if applicable) - N/A for this task
- [x] Accessibility checks for UI changes - Using accessible shadcn/radix components
- [x] Removed debug artifacts (console.log/debugger/TODO left behind) - Verified clean

## 🔗 Related Files

- apps/web/src/components/claims/
- apps/web/src/actions/claims.ts
- apps/web/src/lib/validators/claims.ts
- packages/database/src/schema.ts (claims table)
- e2e/claims.spec.ts

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)

| Metric     | Status                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Lint       | pass                                                                                           |
| Type Check | fail (exit 254)                                                                                |
| Unit Tests | pass                                                                                           |
| Format     | fail (exit 1)                                                                                  |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251217_132445.log |

---

## 📝 PR Template (Copy when done)

```markdown
## What

Build Agent Claim Workflow

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
