---
task_name: "Add tests for evidence uploads"
task_type: "Feature"
priority: "P1-High"
estimate: "1d"
test_level: "full"
roadmap_ref: "Storage/PII hygiene"
branch: "feat/storage-pii-hygiene"
start_time: "Tue Dec 16 00:05:47 CET 2025"
baseline:
  lint: "pass"
  typecheck: "pass"
  tests: "pass"
---

# 🚀 Current Task: Add tests for evidence uploads

## 📋 10x Context Prompt
Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Add tests for evidence uploads</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>1d</estimate>
  <branch>feat/storage-pii-hygiene</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As a member uploading evidence, I want the flow covered by automated tests
  so that secure uploads and claim persistence stay reliable.
</user_story>
<acceptance_criteria>
  - [x] Unit tests cover evidence validator schema and claim action for inserting documents
  - [x] Playwright E2E exercises claim wizard evidence step (happy path, blocked mime/size)
  - [x] Tests assert no regression to submission without evidence
</acceptance_criteria>
```

## 🏗️ Status Tracker
- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Ran `pnpm --filter @interdomestik/web test:unit --run`, `pnpm type-check`, and `pnpm lint` (Playwright e2e still blocked by Next webserver/pg deps)
- [ ] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist
- [x] Unit tests added: `src/**/*.test.ts`
- [ ] Component tests added: `src/**/*.test.tsx`
- [x] E2E tests added: `e2e/*.spec.ts`
- [ ] Tests use factories from `src/test/factories.ts`
- [x] E2E uses fixtures from `e2e/fixtures/`
- [ ] Run: `pnpm qa` (includes all)
- [ ] All tests pass (unit/lint/type-check pass; e2e currently blocked by Next webserver failing to start in Playwright)

## ✅ Definition of Done
- [x] All acceptance criteria met
- [ ] Tests pass at required level (full)
- [x] `pnpm lint` passes (or no new errors)
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [ ] (Recommended) `pnpm qa:full` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Code reviewed / self-reviewed

## 🔗 Related Files
- apps/web/src/test/
- apps/web/e2e/
- apps/web/vitest.config.ts
- apps/web/playwright.config.ts
- apps/web/src/lib/validators/claims.test.ts
- apps/web/src/actions/claims.test.ts
- apps/web/e2e/evidence.spec.ts

## 📂 Active Context
- apps/web/e2e/evidence.spec.ts
- apps/web/src/actions/claims.test.ts
- apps/web/src/lib/validators/claims.test.ts
- apps/web/e2e/fixtures/auth.fixture.ts

## 📝 Implementation Notes
- E2E attempt (`pnpm --filter @interdomestik/web test:e2e -- --grep Evidence`) failed because Next webserver could not start in Playwright env (Better Auth test users missing + postgres/node built-in modules not bundled for client). Tests remain in repo but are skipped when auth is absent; rerun when env supports Next server with db deps.
- Latest test run: `pnpm --filter @interdomestik/web test:unit --run`, `pnpm type-check`, `pnpm lint` (lint reports existing warnings in unrelated files; new tests are clean).

## 🔬 QA Baseline (at task start)
| Metric | Status |
|--------|--------|
| Lint | pass |
| Type Check | pass |
| Unit Tests | pass |

---

## 📝 PR Template (Copy when done)
```markdown
## What
Add tests for evidence uploads

## Why
Storage/PII hygiene

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
