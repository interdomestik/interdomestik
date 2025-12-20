# Task: Phase 1 — Membership Infrastructure

## Objective

Enable users to buy memberships and deliver immediate value (Digital Card, Hotline). This is the foundation of the Interdomestik revenue model.

## Sub-tasks

- [x] **Data Setup**: Seed `membership_plans` (Standard: €20, Familja: €35).
- [x] **Marketing**: Build `/pricing` page with localized plan details.
- [x] **Checkout**: Implement checkout flow (Simulated for MVP).
- [x] **Activation**: Post-purchase "Thank You" with digital card and hotline.
- [x] **Dashboard**: Initial Member Dashboard widgets (Protection Badge).

## Context

- Primary UI components: `@interdomestik/ui`
- Database: Drizzle ORM
- i18n: `next-intl`
- Auth: `better-auth`

## QA Baseline (2025-12-20)

- Lint: Pass
- Type check: Pass
- Unit tests: 3 failures in `pricing-table.test.tsx` (Baseline)
