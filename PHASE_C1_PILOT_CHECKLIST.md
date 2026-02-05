# Phase C1 Pilot Execution Checklist (Run Book)

**Status**: Ready for Pilot Execution
**Generated**: 2025-02-24
**Version**: 1.0 (Phase C)

## 1. Compliance Matrix

| Area         | Requirement          | Status        | Evidence / Location                                    | Action Required                           |
| ------------ | -------------------- | ------------- | ------------------------------------------------------ | ----------------------------------------- |
| **Docs**     | Central Truth Locked | ✅ **DONE**   | `README.md`, `AGENTS.md` (Updated & Locked)            | None.                                     |
| **Docs**     | AI Context Aligned   | ✅ **DONE**   | `.cursorrules`, `gemini.md` (Sync'd with Rules)        | None.                                     |
| **Routing**  | `proxy.ts` Authority | ✅ **DONE**   | `apps/web/src/proxy.ts` exists; Middleware defers.     | Enforce "Read-Only" on `proxy.ts`.        |
| **Routing**  | Canonical Routes     | ✅ **DONE**   | `apps/web/e2e/v3-canonical-landing.spec.ts` verifies.  | None.                                     |
| **Billing**  | No Stripe in V3      | ✅ **DONE**   | Grep scan confirms Stripe only in `scripts/`/`legacy`. | **DO NOT** import Stripe into `apps/web`. |
| **Testing**  | E2E Clarity Markers  | ✅ **DONE**   | `*-page-ready` markers verify in E2E specs.            | Ensure markers persist in UI updates.     |
| **Testing**  | Gatekeeper Script    | ✅ **DONE**   | `pnpm e2e:gate` defined in `package.json`.             | Run before every merge.                   |
| **Infra**    | Dependency Hygiene   | 🧊 **FROZEN** | `aws-sdk` (v2) in `domain-communications`.             | **DEFERRED** (Phase D). Frozen for Pilot. |
| **Security** | Guard Script         | ✅ **DONE**   | `pnpm security:guard` defined in `package.json`.       | Run daily.                                |

## 2. The "Daily Loop" (Standard Operating Procedure)

For all agents (Human & AI) working on Phase C1:

1.  **Start of Task**:
    - Run `git pull origin main`.
    - Review `AGENTS.md` for "Phase C Rules".
    - **Check**: Are you editing `proxy.ts`? -> **STOP**. Ask for explicit permission.

2.  **During Execution**:
    - **Routing**: Use _only_ the canonical routes defined in `proxy.ts` (/member, /agent, /staff).
    - **UI**: Ensure `data-testid="*-page-ready"` markers are present on key pages.
    - **Billing**: Mock _all_ billing calls. No Stripe SDK usage.

3.  **End of Task (Validation)**:
    - Run `pnpm check:fast` (Lint/Typecheck).
    - Run `pnpm pr:verify` (E2E Smoke).
    - Run `pnpm security:guard`.

## 3. Drift Guardrails (Anti-Patterns)

**IMMEDIATELY REJECT PRs containing:**

- ❌ Changes to `proxy.ts` without "Authorized Routing Refactor" label.
- ❌ New imports of `stripe` or `@stripe/*` in `apps/web`.
- ❌ Removal of `data-testid` attributes (breaks E2E gates).
- ❌ bypassing `@interdomestik/shared-auth` for direct Supabase calls.
