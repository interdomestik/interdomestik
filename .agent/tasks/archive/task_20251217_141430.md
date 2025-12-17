---
task_name: 'Fix i18n missing keys'
task_type: 'Bug Fix'
priority: 'P0-Critical'
estimate: '2h'
test_level: 'unit'
roadmap_ref: 'Phase 1'
branch: 'fix/i18n-config'
start_time: 'Wed Dec 17 14:07:00 CET 2025'
end_time: 'Wed Dec 17 14:20:00 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🚀 Task: Fix i18n Missing Keys

## 📋 Problem Statement

E2E tests were logging "MISSING_MESSAGE" errors for translation keys:

- `claims.category.auto`
- `claims.category.service_issue`
- `claims.category.travel`
- `claims.category.retail`
- `claims.category.real_estate`
- `claims.status.verification`
- `claims.status.evaluation`
- `claims.status.negotiation`
- `claims.status.court`
- `claims.status.rejected`

## ✅ Solution

Added all missing translation keys to all 4 locale files:

- `en.json` (English)
- `sq.json` (Albanian)
- `mk.json` (Macedonian)
- `sr.json` (Serbian)

## 🏗️ Status Tracker

- [x] **Exploration**: Identified missing keys from E2E logs
- [x] **Root Cause Analysis**: Seed data uses categories/statuses not in translations
- [x] **Implementation**: Added 14 status keys + 8 category keys per locale
- [x] **Verification**: E2E test passes without MISSING_MESSAGE errors
- [x] **Documentation**: Task file complete

## 🧪 Testing Checklist

- [x] Type check passes
- [x] Lint passes (13 warnings, 0 errors)
- [x] E2E test passes without i18n errors

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level: ✅
- [x] `pnpm lint` passes: ✅
- [x] `pnpm type-check` passes: ✅
- [x] No regressions from baseline: ✅

## 🔗 Files Modified

- `apps/web/src/messages/en.json`
- `apps/web/src/messages/sq.json`
- `apps/web/src/messages/mk.json`
- `apps/web/src/messages/sr.json`

## � Keys Added

### Status Keys

| Key          | EN           | SQ        |
| ------------ | ------------ | --------- |
| verification | Verification | Verifikim |
| evaluation   | Evaluation   | Vlerësim  |
| negotiation  | Negotiation  | Negociata |
| court        | Court        | Gjyq      |
| rejected     | Rejected     | Refuzuar  |

### Category Keys

| Key           | EN            | SQ                   |
| ------------- | ------------- | -------------------- |
| auto          | Vehicle       | Automjet             |
| travel        | Travel        | Udhëtim              |
| retail        | Retail        | Retail               |
| real_estate   | Real Estate   | Pasuri e Paluajtshme |
| flight_delay  | Flight Delay  | Vonesë Fluturimi     |
| damaged_goods | Damaged Goods | Mallra të Dëmtuara   |
| service_issue | Service Issue | Problem Shërbimi     |
| other         | Other         | Tjetër               |

## Commits

- `7b787f8` - fix(i18n): add missing status and category translation keys
