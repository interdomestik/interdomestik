---
applyTo:
  - apps/web/src/proxy.ts
  - apps/web/src/lib/proxy-logic.ts
---

# Routing boundary instructions

These files define the Phase C routing, auth-guard, and tenant-isolation boundary.

- Preserve canonical routes `/member`, `/agent`, `/staff`, and `/admin`.
- Do not move access-control, auth, or tenant-resolution logic out of this boundary unless the user explicitly asks.
- Keep auth checks edge-safe and preserve tenant resolution behavior, tenant cookies, and debug headers when editing this boundary.
- If behavior changes here, update targeted coverage such as `apps/web/src/lib/proxy-logic.test.ts` and any affected Playwright gate specs in the same change.
