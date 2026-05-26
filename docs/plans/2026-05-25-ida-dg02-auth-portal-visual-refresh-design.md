# IDA-DG02 Auth Portal Visual Refresh Design Gate

Status: complete
Slice: `IDA-DG02`
Owner: platform + product + design + qa
Phase: Phase C
Date: 2026-05-25
Authority: approved design gate. This gate promotes one bounded implementation slice,
`IDA-AUTH01 Portal Sign-In Visual Refresh v0`.

Phase C constraints remain active: `apps/web/src/proxy.ts` is read-only, canonical `/member`,
`/agent`, `/staff`, and `/admin` routes remain fixed, and this gate does not authorize auth,
tenant, billing, schema, backend, Stripe, README, `AGENTS.md`, or architecture-doc changes.

## Source Inputs

- User-provided portal sign-in reference: split desktop layout with a left Europe/network visual and
  a right sign-in form panel.
- Merged predecessor: PR `#863`, merge commit
  `4ec04de7cde991c55e8dfcd1b1b353e31fe54269`, `IDA-MH01 Mobile Home + Adaptive Hero Resolver v0`.
- Current login route:
  `apps/web/src/app/[locale]/(auth)/login/_core.entry.tsx`.
- Existing login behavior component:
  `apps/web/src/components/auth/login-form.tsx`.
- Existing login tests:
  `apps/web/src/app/[locale]/(auth)/login/_core.entry.test.tsx` and
  `apps/web/src/components/auth/login-form.test.tsx`.
- Existing locale files:
  `apps/web/src/messages/{en,sq,mk,sr}/auth.json`.

## Current State

- The login page renders a centered `main` with `data-testid="auth-ready"`.
- `TenantSelector` renders above the form when no tenant is resolved.
- `LoginForm` owns email/password sign-in, safe `next` redirects, role-based canonical redirects,
  plan query continuity, admin access verification, GitHub OAuth when configured, forgot-password
  routing, and register/pricing continuity.
- The current visual shape is functional but generic and does not reflect the newer IDA member-home
  direction or the requested portal-grade split-screen identity.

## Decision

Promote exactly one next implementation slice:

`IDA-AUTH01 Portal Sign-In Visual Refresh v0`

The implementation must be presentation-only. It may add a login-route auth shell and localized
supporting copy, but it must reuse the existing `LoginForm` behavior and preserve all current route,
auth, tenant, role, billing, and redirect contracts.

## Authorized Scope

- Add a route-local presentation shell for the login page, mounted inside
  `apps/web/src/app/[locale]/(auth)/login/_core.entry.tsx`.
- Keep `data-testid="auth-ready"` on the `main` element owned by the login page.
- Render a desktop split layout: left brand/IDA visual panel, right sign-in form panel.
- Render a mobile stacked layout: compact brand summary above the same form panel.
- Support both TenantSelector states: tenant resolved and tenant selector visible.
- Keep `LoginForm` props, state, handlers, submit behavior, OAuth behavior, safe-redirect behavior,
  and element structure unchanged unless a focused test proves a purely presentational wrapper is
  required.
- Preserve these markers: `auth-ready`, `login-form`, `login-email`, `login-password`, and
  `login-submit`.
- Add localized `auth.login.portal.*` copy for `en`, `sq`, `mk`, and `sr`.
- Use neutral trust/status chips only. Approved chip themes are account continuity, secure portal
  access, and case/document organization. Do not add numbers, success statistics, compensation
  claims, network-size claims, or outcome promises.
- Add or reuse a local static visual asset or CSS-backed visual treatment. It must not fetch remote
  assets and must not embed external URLs.

## Blocked Scope

- `apps/web/src/proxy.ts` edits.
- Route renames, route group restructuring, or canonical-route bypasses.
- Auth/session/better-auth/Supabase/shared-auth behavior changes.
- Tenant resolution, tenant selector logic, or tenant option data changes.
- Backend, schema, RLS, migration, billing, Stripe, Paddle, or data-access changes.
- Login flow rewrites, magic-link conversion, password-policy changes, or new OAuth providers.
- Broad auth redesign across forgot-password, reset-password, or register.
- README, `AGENTS.md`, and architecture-doc edits.

## Copy Contract

Runtime copy must avoid these forbidden claims and framings:

- guaranteed compensation
- we pay damages
- you will win
- we replace insurance
- insurer/broker framing

Recommended English source copy for implementation:

- Eyebrow: `INTERDOMESTIK IDA`
- Title: `Sign in to your IDA portal`
- Supporting copy: `Use the email linked to your Interdomestik account to continue.`
- Visual panel title: `Built for member assistance across Europe`
- Visual panel body: `Cases, documents, and next steps stay organized in one secure portal.`
- Chips: `Secure account access`, `Case status in one place`, `Documents ready when needed`

The Albanian copy should prefer natural member-language equivalents, for example
`Hyni në portalin tuaj IDA` and `Përdorni email-in e lidhur me llogarinë tuaj Interdomestik`.

## UI And Accessibility Contract

- The visual panel is decorative unless implementation adds meaningful text to it. Decorative
  visual layers must be `aria-hidden="true"`; meaningful panel copy must remain real readable text.
- Form labels must remain visible and explicitly associated with inputs.
- Keyboard focus order must flow through TenantSelector when present, then the login form controls.
  Decorative visual content must not be focusable.
- Color contrast must meet WCAG AA for text, focus indicators, inputs, and buttons.
- Touched motion must respect reduced-motion preferences.
- No document-level or route-layout-level hard `overflow: hidden` or no-scroll behavior.
- The shell may use `min-h-dvh`, but must allow vertical scrolling when content, locale length, the
  TenantSelector, GitHub OAuth, or the mobile keyboard needs it.
- Mobile portrait proof must cover `360`, `390`, and `430` px widths.
- Mobile acceptance: email field and primary login CTA are visible above the first fold before
  keyboard focus, without hiding the rest of the form behind a nested scroll trap.
- Mobile landscape must stack or compact safely without forcing a desktop split into a short
  viewport.
- Desktop proof must cover the stress state: TenantSelector present plus GitHub OAuth enabled.

## Implementation Checklist For IDA-AUTH01

- Add focused route/component tests for shell rendering with TenantSelector present and absent.
- Add focused tests proving `plan` and `next` query continuity remain unchanged.
- Add an i18n completeness test path through `pnpm i18n:check`.
- If adding an SVG or other asset, scan it for `http:`, `https:`, `xlink:href`, and remote `url()`.
- Validate browser/mobile screenshots at `360`, `390`, and `430` widths.
- Prefer an additional desktop screenshot at `1280` width.
- Run `pnpm --filter @interdomestik/web type-check`, `pnpm --filter @interdomestik/web lint`,
  focused login unit tests, `pnpm i18n:check`, `pnpm security:guard`, and the relevant PR gates.

## Reviewer Findings Incorporated

Sonnet 4.6 route: Claude CLI. Review returned design blockers and hardening items; all are folded
into this gate. Key incorporated points: exact shell mount point, TenantSelector-present layout,
neutral chip copy, stable `auth-ready` ownership, no `LoginForm` behavior changes, no ancestor
overflow lock, query-param continuity proof, and static-asset remote reference audit.

Gemini Pro route: `gemini-2.5-pro`. Product/mobile/accessibility review required concrete
desktop/mobile layout definition, locale copy, visual semantics, contrast, TenantSelector states,
focus order, mobile keyboard/landscape awareness, and genuine non-claim chip content. These are
folded into the UI, copy, and implementation contracts above.

## Promotion Result

`IDA-DG02` promotes `IDA-AUTH01 Portal Sign-In Visual Refresh v0`.

No runtime code changed in this design gate.
