```
---
task_name: 'Implement Feature Flagged Experiments'
task_type: 'Feature'
start_time: 'Mon Dec 15 20:20:39 CET 2025'
---

# 🚀 Current Task: Productionize & Regionalize (Master Plan)

## 📋 Context
The user has outlined a 4-point roadmap to move from "experiments" to "production-ready regional platform".

1.  **Productionize Experiments**: Real analytics structure, PII safety, Ops routing for "Call Me Now", flags off in prod.
2.  **Regionalization**: Kosovo hardening (sq/en), local consent, prepare for sr/mk.
3.  **Prime Claims**: Evidence tooltips, "Speed & Safety" panel on `/services`.
4.  **Quality Gates**: Continuous Testing.

## 🏗️ Status Tracker

### Phase 1: Productionize Experiments (Current Focus)
- [x] **Analytics**: Refactor `analytics.ts` for PII separation and provider adapters.
- [x] **Ops Routing**: Create `Leads` table in DB and Server Action for "Call Me Now" form.
- [x] **Flags**: Ensure `flags.ts` defaults to `false` if env is missing.

### Phase 2: Prime Claims Features
- [x] **Services Page**: Add "Speed & Safety" panel with SLA copy.
- [x] **Evidence**: Add tooltips/prompts for file uploads.

### Phase 3: Regionalization
- [x] **Kosovo**: Audit `sq` translations and add local contact details/consent.
- [x] **i18n**: scaffolding for `sr`/`mk`.

## 📂 Active Context
- `apps/web/src/lib/flags.ts`
- `apps/web/src/lib/analytics.ts`
- `apps/web/src/components/claims/call-me-now-dialog.tsx`


## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->
```
