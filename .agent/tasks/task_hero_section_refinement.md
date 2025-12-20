# Task: Hero Section Refinement

## Objective

Refine the home page hero section to achieve a premium look and feel, fixing any translation issues and alignment problems, similar to the pricing table.

## Sub-tasks

- [x] **Analyze Current Hero**: Identify missing translation keys or hardcoded text.
- [x] **Design Refinement**: Apply premium aesthetics (typography, spacing, mesh gradients).
- [x] **Internationalization**: Ensure all strings are in `messages/[locale]/home.json`.
- [x] **Verification**: Verify layout on mobile and desktop.

## Context

- Location: likely `apps/web/src/components/home/hero.tsx` or similar.
- Project uses `next-intl` for translations.
- Styling: Tailwind CSS.

## QA Baseline (2025-12-20)

- Unit tests: 6 failures (mostly unrelated but present in baseline)
- Lint: Pass
- Type check: Pass
