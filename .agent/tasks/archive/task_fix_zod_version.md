---
task_name: 'Investigate and Fix Zod Version'
task_type: 'Chore/Fix'
priority: 'P2-Medium'
estimate: '0.5h'
test_level: 'full'
branch: 'fix/zod-version'
start_time: 'Fri Dec 19 18:27:00 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🔧 Current Task: Investigate and Fix Zod Version

## 📋 Context

The project audit revealed that `zod` is installed at version `^4.1.13` in `apps/web` and `packages/qa`. However, the latest stable release of Zod is typically in the v3.x range (e.g., v3.24.1). This unusual version might be a typo, a mistake, or an accidental installation of a non-standard package/tag. This poses a risk for compatibility with ecosystem tools (like `react-hook-form`, `drizzle-zod`, etc.) which expect Zod v3.

## 🎯 Objectives

1.  **Investigate**: Confirm if `zod@4.1.13` is a valid version or an error.
2.  **Harmonize**: If invalid/unnecessary, revert to the latest stable Zod v3 (`3.24.1`).
3.  **Verify**: Ensure no code breaks due to the reversion (API changes between v3 and supposed v4).

## 🏗️ Implementation Plan

- [x] **Investigation**:
  - [x] Run `npm view zod versions` to see if v4 exists.
  - [x] Check `pnpm-lock.yaml` to see where `zod` resolves from.
- [x] **Remediation**:
  - [x] Update `package.json` in `apps/web` and `packages/qa` to `^4.2.1`.
  - [x] Run `pnpm install`.
- [x] **Verification**:
  - [x] Run `pnpm type-check` (to catch API breakages).
  - [x] Run `pnpm test:unit` (to catch runtime breakages).

## ✅ Definition of Done

- [x] Zod version is standard (v4.x is standard) across the repo.
- [x] Tests and type-checks pass.
