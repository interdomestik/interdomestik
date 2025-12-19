---
task_name: 'Review and Fix Language Inconsistencies'
task_type: 'Bugfix/Refactor'
priority: 'P1-High'
estimate: '2h'
test_level: 'full'
roadmap_ref: 'Core MVP Phase 1 - i18n Polish'
branch: 'fix/i18n-consistency'
start_time: 'Fri Dec 19 19:54:00 CET 2025'
---

# 🚀 Current Task: Review and Fix Language Inconsistencies

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Review Members, Admin, and Agent dashboards for language inconsistencies and fix them all</objective>
  <type>Bugfix/Refactor</type>
  <priority>P1-High</priority>
  <estimate>2h</estimate>
  <branch>fix/i18n-consistency</branch>
  <constraints>
    - Ensure all UI strings are localized (EN/SQ)
    - Fix any hardcoded strings
    - Ensure consistent terminology between dashboards
    - Verify keys exist in both en.json and sq.json
    - Pass i18n QA audit
  </constraints>
</task_definition>

<current_limitations>
  - Potential hardcoded strings in recently refactored dashboards
  - Possible missing keys in Albanian (sq) translations
  - Inconsistent naming (e.g., "Claim" vs "Case") across different views
</current_limitations>
<goals>
  - Audit common components and pages for hardcoded text
  - Synchronize en/sq translation files
  - Standardize terminology
  - Verify fixes with manual review or automated checks
</goals>
```

## 🏗️ Status Tracker

- [x] **Exploration**: specific i18n audit of dashboard pages
- [x] **Fixing**: Replace hardcoded strings with `t()` calls
- [x] **Synchronization**: Add missing keys to `sq.json`
- [x] **Verification**: Run `pnpm qa:i18n` (if available) or manual verification
- [ ] **Documentation**: Update translation guidelines if needed

## 🧪 Testing Checklist

- [x] Verify Admin Dashboard (EN/SQ)
- [x] Verify Agent Dashboard (EN/SQ)
- [x] Verify Member Dashboard (EN/SQ)
- [x] Verify Settings Pages (EN/SQ)
- [x] All tests pass

## ✅ Definition of Done

- [x] 0 Hardcoded strings in dashboard components
- [x] 100% Key parity between EN and SQ files
- [x] Consistent terminology used throughout
- [x] `pnpm lint` and `pnpm type-check` pass

## 🔗 Related Files

- apps/web/src/messages/en/\*.json
- apps/web/src/messages/sq/\*.json
- apps/web/src/app/[locale]/(app)/dashboard/
- apps/web/src/app/[locale]/admin/
- apps/web/src/app/[locale]/(agent)/agent/
