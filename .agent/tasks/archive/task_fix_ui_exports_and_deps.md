---
task_name: 'UI Exports and Dependency Alignment'
task_type: 'Chore/Fix'
priority: 'P1-High'
estimate: '1h'
test_level: 'full'
branch: 'fix/ui-exports-and-deps'
start_time: 'Fri Dec 19 18:20:00 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🔧 Current Task: UI Exports and Dependency Alignment

## 📋 Context

An audit revealed that `packages/ui` has incomplete exports (forcing consumers to use root imports) and there are version mismatches for `next` and `@types/node` across the monorepo.

## 🎯 Objectives

1.  **Fix UI Exports**: Update `packages/ui/package.json` to export all 19+ components found in `src/components`.
2.  **Align Dependencies**:
    - Update `packages/ui` peerDependency for `next` to allow `^16.0.0`.
    - Update all `package.json` files to use `@types/node@^22.19.2`.

## 🏗️ Implementation Plan

- [x] **Dependency Alignment**:
  - [x] Update `packages/ui/package.json` (peerDeps `next`, devDeps `@types/node`).
  - [x] Update `package.json` (root devDeps `@types/node`).
  - [x] Update `packages/qa/package.json` (devDeps `@types/node`).
  - [x] Run `pnpm install` to deduplicate lockfile.
- [x] **UI Exports**:
  - [x] List all files in `packages/ui/src/components`.
  - [x] Generate comprehensive `exports` map in `packages/ui/package.json`.
- [x] **Verification**:
  - [x] Run `pnpm build` to ensure UI builds with new exports and types.
  - [x] Run `pnpm lint`.

## ✅ Definition of Done

- [x] `packages/ui` exports all components correctly.
- [x] `pnpm list @types/node -r` shows consistent versions.
- [x] `pnpm build` passes.
