---
applyTo: 'apps/web/src/**/*.{ts,tsx}'
---

# App quality instructions

When editing app code in `apps/web/src`, prefer production-ready changes over scaffolding.

- Prefer Server Components and server-first Next.js patterns unless user interaction requires a client component.
- Preserve existing i18n patterns. Reuse existing translation helpers and message namespaces instead of hardcoding new user-facing copy when translations already exist.
- UI changes must include real loading, empty, error, and success states when those states are part of the feature.
- Keep accessibility intact: semantic HTML first, stable labels, keyboard support, and non-decorative `aria` only when needed.
- Keep layouts responsive and consistent with the existing route or feature surface. Avoid one-off styling systems or visual rewrites unless requested.
- Reuse existing auth, tenant, and route helpers rather than introducing parallel client-side logic.
