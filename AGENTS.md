# Interdomestik AGENTS.md

Guidelines and commands for agentic coding agents working on the Interdomestik monorepo.

## Project Overview

- **Type**: Next.js 15 (App Router) monorepo with Turborepo
- **Package Manager**: pnpm (workspace protocol)
- **Architecture**: Modular domain-driven design with separate packages
- **UI**: React 19 + Tailwind CSS + Radix UI
- **Database**: Drizzle ORM with PostgreSQL (Supabase)
- **Auth**: Better Auth (Primary)
- **Payments**: Paddle
- **Tenancy**: Host-based (`ks.*`, `mk.*`) with `nip.io`
- **i18n**: next-intl (`sq`, `en`, `mk`, `sr`)

---

## 🧪 Strict E2E Governance

We enforce strict E2E contracts to ensure stability across tenants (ks/mk) and locales (sq/en/mk/sr).

> **Source of Truth**: [apps/web/e2e/README.md](apps/web/e2e/README.md).
> In case of conflict, the technical spec in `apps/web/e2e/README.md` wins.

### 🚨 Mandatory Lanes (before committing)

1. **Fast Gate (must pass)**

   ```bash
   pnpm --filter @interdomestik/web e2e:gate:fast
   ```

2. **Phase 5 (functional flows)**

   ```bash
   pnpm --filter @interdomestik/web test:e2e:phase5
   ```

3. **Seed / Resume Contract**

   ```bash
   pnpm --filter @interdomestik/database seed:e2e
   pnpm boot:e2e
   ```

4. **Full Suite (stabilization lane)**

   ```bash
   PW_REUSE_SERVER=1 pnpm --filter @interdomestik/web test:e2e -- --max-failures=20 --trace=retain-on-failure --reporter=line
   ```

### 🎯 Targeted Spec Run (default during fixes)

When fixing a single spec, use the smallest run possible:

```bash
PW_REUSE_SERVER=1 pnpm --filter @interdomestik/web test:e2e -- apps/web/e2e/<spec>.spec.ts --trace=retain-on-failure --reporter=line
```

### 🧭 Navigation & Selector Contracts

> **Full Spec**: [apps/web/e2e/README.md](apps/web/e2e/README.md)

**Agent Checklist:**

- `gotoApp` ONLY (No `page.goto`).
- `data-testid` preferred (No `getByText`/`text=`).
- Host-based tenancy (`ks.*`, `mk.*`).
- Exceptions: `tenant-resolution` specs allowed `page.goto`.

**Uniqueness Rule:**

- Any `data-testid` used as a marker or selector MUST be unique in the DOM.

---

## 🧹 The Full Sweep Rule (hard requirement)

When you open a spec file to fix a failure:

1. **Fix the reported failure.**
2. **Scan the entire file** for the same class of brittleness and remove it everywhere.
   - Example: If you replace one `getByRole({ name })`, replace all `getByRole({ name })` in that file.
   - Same for `getByText`, `hasText`, raw `page.goto`, brittle URL regex patterns, etc.
3. If a stable hook is missing, **add minimal safe `data-testid` / `data-status`** to the component (do not add fragile text).
4. **Ensure readiness markers are not duplicated** (do not add a marker if it already exists in a parent layout).
5. **Verify** with a targeted run of the spec.
6. **Run** `e2e:gate:fast` (and phase5 if relevant).
7. **Commit.**

**Never leave partial debt in a touched file.**

---

## ✅ Check → Commit → Check Workflow (mandatory)

Every change follows:

1. **Edit** (apply strict contracts + Full Sweep)
2. **Check** (smallest relevant lane: targeted spec OR gate fast)
3. **Commit** (must be clean worktree)
4. **Re-check** (gate fast must stay green; phase5 if impacted)

**Commit messages:**

- `fix(e2e): ...` for test/spec stabilization
- `feat(ui): ...` or `fix(ui): ...` when adding testids/markers
- `docs: ...` for documentation changes

---

## ✅ Definition of Done (per change)

A change is "done" only when:

- Targeted spec run for the touched file is ✅
- `pnpm --filter @interdomestik/web e2e:gate:fast` is ✅
- If the change touches user flows/pages/components: `test:e2e:phase5` is ✅
  - _User flows/pages/components includes: any file in `apps/web/src/app/**`, `apps/web/src/components/**`, `packages/ui/**`, or any domain package that affects UI state._
- Worktree is clean and changes are committed

## 🔍 Full Sweep Search Helpers

Before closing a touched spec, run a quick scan:

```bash
rg "page\.goto\(|getByText\(|text=|hasText|getByRole\(\{ name" apps/web/e2e
rg "localhost:|127\.0\.0\.1|nip\.io" apps/web/e2e
```

(Then ensure the file you touched is fully compliant.)

---

## ⛔ Professional Guardrails

- **Do not change business logic to satisfy a test.** Prefer adding stable hooks (`data-testid`, `data-status`) or fixing the spec logic.
- **Avoid global timeouts.** Prefer targeted waits on explicit markers (loaded vs loading) and per-step timeouts only where needed.
- **Keep changes minimal, deterministic, and tenant-safe.**
- If you touch shared helpers (`gotoApp`, auth helpers), run `e2e:gate:fast` immediately.

---

## 🧰 Troubleshooting (common bottlenecks)

- If build/start is slow, prefer `PW_REUSE_SERVER=1` and targeted spec runs.
- If you see origin/auth issues, verify auth origin helpers are used (no hardcoded origin strings).
- If a test times out on a marker, confirm the marker exists once in the DOM (layout vs view duplication is a common cause).
- **Review traces:** `pnpm exec playwright show-trace <trace.zip>`

---

## Development Commands (reference)

### Root

```bash
pnpm dev
pnpm build
pnpm check:fast
pnpm db:generate
```

### Testing

```bash
pnpm --filter @interdomestik/web test:unit --run
pnpm --filter @interdomestik/web test:e2e -- --grep "some test name"
```

Be an agent of stability. Follow the contracts.
