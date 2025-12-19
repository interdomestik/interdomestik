---
task_name: 'Fix Database Type Generation'
task_type: 'Fix'
priority: 'P1-High'
estimate: '1h'
test_level: 'build'
branch: 'fix/database-types'
start_time: 'Fri Dec 19 18:24:00 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🔧 Current Task: Fix Database Type Generation

## 📋 Context

The file `packages/database/src/types.ts` is currently a manual stub with `any` types because the `supabase gen types` command fails (likely due to missing Docker or schema access). This compromises type safety for any direct Supabase client usage.

## 🎯 Objectives

1.  **Assess Usage**: Determine if `Database` type (Supabase-generated) is actually used in the codebase.
    - If NOT used (we rely on Drizzle), deprecate/remove `supabase gen` requirement and use Drizzle inference or keep minimal stub.
    - If USED, fix the generation script (use `drizzle-kit` to generate SQL -> Supabase types? Or fix Docker env?).
2.  **Fix/Refactor**: Implement a reliable type generation strategy that works in the current environment.

## 🏗️ Implementation Plan

- [x] **Assessment**:
  - [x] Search codebase for `Database` import from `@interdomestik/database`.
  - [x] Search for usage of `supabase` client generic types.
- [x] **Decision**:
  - [x] **Scenario A (Unused)**: Remove/Simplify `types.ts` and update documentation/scripts.
  - [ ] **Scenario B (Used)**: Attempt to fix `db:generate` script or replace it with a Drizzle-based inference export.
- [x] **Execution**:
  - [x] Execute the decision.
  - [x] Ensure `pnpm type-check` passes.

## ✅ Definition of Done

- [x] `packages/database/src/types.ts` is either robust or removed safely.
- [x] `pnpm type-check` passes.
- [x] Documentation updated regarding DB types.
