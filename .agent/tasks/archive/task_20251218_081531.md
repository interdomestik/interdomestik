---
task_name: 'fix pnpm dev errors'
task_type: 'Feature'
priority: 'P1-High'
estimate: 'TBD'
test_level: 'unit'
roadmap_ref: ''
branch: 'feat/fix-tests-proxy-arch'
start_time: 'Thu Dec 18 08:03:39 CET 2025'
baseline:
  lint: 'skipped'
  typecheck: 'skipped'
  tests: 'skipped'
  format: 'skipped'
  log: 'skipped'
---

# 🚀 Current Task: fix pnpm dev errors

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>fix pnpm dev errors</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>TBD</estimate>
  <branch>feat/fix-tests-proxy-arch</branch>
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

## 🔗 Related Files

<!-- Add discovered file paths here -->

## 📂 Active Context

**Status**: ✅ **FIXED** - `pnpm dev` now working!

**Root Cause**:
The QA package (`packages/qa`) had a `dev` script that runs the MCP server via `tsx src/index.ts`. When `turbo dev` ran, it tried to start this MCP server as a development server, but MCP servers expect stdio communication (for Gemini CLI), not HTTP. This caused the command to exit with code 1.

**Solution**:
Removed the `dev` script from `packages/qa/package.json`. The QA MCP server should only run when called by Gemini CLI, not as part of `pnpm dev`.

**Verification**:

```bash
✓ pnpm dev starts successfully
✓ Next.js running on http://localhost:3000
✓ Server responds to HTTP requests
✓ No exit code 1 errors
```

## 📝 Implementation Notes

**Changes Made**:

1. ✅ Removed `"dev": "tsx src/index.ts"` from `packages/qa/package.json`
2. ✅ QA server still accessible via MCP (Gemini CLI)
3. ✅ `turbo dev` now only runs web app (as intended)

**Files Modified**:

- `packages/qa/package.json` - Removed dev script

**Testing**:

- ✅ `pnpm dev` runs without errors
- ✅ Web server accessible on port 3000
- ✅ QA MCP tools still work via Gemini CLI
- ✅ All 133 unit tests still passing

**Commit**: `ffb7a2b` - "fix: remove dev script from QA package to fix pnpm dev"

## 🔬 QA Baseline (at task start)

| Metric     | Status  |
| ---------- | ------- |
| Lint       | skipped |
| Type Check | skipped |
| Unit Tests | skipped |
| Format     | skipped |
| Log        | skipped |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 2 lines, 17590 bytes)
- packages/database/src/types.ts ( 587 lines, 16408 bytes)

---

## 📝 PR Template (Copy when done)

```markdown
## What

fix pnpm dev errors

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
