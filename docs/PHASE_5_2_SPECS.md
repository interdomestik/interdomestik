# PHASE_5_2_SPECS.md — Phase C Build Window (Single Approved Slice)

## Goal

Implement **one** approved Phase C change on top of a **green Phase 5.1 baseline**, with **zero policy drift**.

## Entry Criteria (must be true before any edits)

- `main` has passed **Phase 5.1** (latest evidence bundle exists under `tmp/pilot-evidence/phase-5.1/`).
- Working tree is **clean** (`git status --porcelain` is empty).
- Exactly **one** target slice is named (one ticket/bug/feature).
- Guardrails acknowledged: **no `apps/web/src/proxy.ts` edits** unless explicitly authorized.

## Scope Rules

### In Scope

- Minimal code changes required for the approved slice.
- Tests directly tied to the changed behavior.
- Small refactors **only if required** to unblock the slice (and only in the touched area).

### Out of Scope (hard stop)

- Routing/auth/tenancy architecture refactors.
- Canonical route renames/bypasses (`/member`, `/agent`, `/staff`, `/admin`).
  - Allowed exception: minimal navigation-target canonicalization to existing canonical routes (no route implementation or proxy/auth changes).
- Clarity marker changes unless required **and** validated.
- Stripe-related pilot flow changes.

## Execution Contract (mandatory sequence)

1. **Define** the target change + acceptance criteria **before editing**.
2. Implement **minimal diff** (prefer small, reviewable commits).
3. Run targeted checks during development.
4. Keep evidence of outputs for the changed behavior.
5. If blocked by env/state: **stop**, capture the failure, apply the **minimal unblock**, continue.

## Required Validation (before Phase 5.2 is complete)

- Targeted unit/integration/e2e tests for the touched area pass.
- `pnpm security:guard` passes.
- `pnpm pr:verify` passes.
- `pnpm e2e:gate` passes
  - If you want strict re-baseline: re-run `phase-5-1.sh` instead of just `pnpm e2e:gate`.

## Evidence Requirements (must be captured)

- Commit SHA(s) implementing Phase 5.2.
- Command outputs (full or last 120 lines) for:
  - targeted tests
  - `pnpm security:guard`
  - `pnpm pr:verify`
  - `pnpm e2e:gate` (or `phase-5-1.sh`)
- Short change summary:
  - files touched
  - behavior changed
  - tests added/updated

## Exit Criteria

- Approved slice delivered.
- All required validations green.
- No unintended scope expansion.
- Ready for Phase 5.3 handoff/review.

---

## Phase 5.2 Run Template (fill in)

**Slice name:**
**Acceptance criteria:**
**Files touched:**
**Tests run (targeted):**
**Validation evidence:**
**Commit SHA(s):**
**Notes / risks:**
