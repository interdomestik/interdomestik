# T01 Free Start And Trust UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the live claim-first landing hero, trust strip, and footer safety net so they show proof chips, phone or WhatsApp CTAs, and multilingual trust cues.

**Architecture:** Keep the change inside the existing UI v2 landing composition and shared footer. Drive new trust copy from the existing `hero`, `trust`, and `footer` message namespaces so the surface stays localized without touching routing, auth, tenancy, or `apps/web/src/proxy.ts`.

**Tech Stack:** Next.js App Router, React 19, `next-intl`, Vitest, Testing Library

---

### Task 1: Lock the red tests for the live trust surfaces

**Files:**

- Modify: `apps/web/src/app/[locale]/components/home/hero-v2.test.tsx`
- Create: `apps/web/src/app/[locale]/components/home/trust-strip.test.tsx`
- Create: `apps/web/src/app/[locale]/components/home/footer.test.tsx`

**Step 1: Write the failing tests**

- Assert `HeroV2` renders proof chips, keeps the hotline and WhatsApp actions, and exposes multilingual trust cues.
- Assert `TrustStrip` renders the existing proof stats plus new trust-cue chips.
- Assert `Footer` renders a stronger safety-net block with urgent contact CTAs and multilingual support cues.

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/hero-v2.test.tsx' 'src/app/[locale]/components/home/trust-strip.test.tsx' 'src/app/[locale]/components/home/footer.test.tsx'
```

Expected: the new assertions fail because the current landing hero, trust strip, and footer do not yet render the committed `T01` trust surfaces.

### Task 2: Implement the minimal trust-surface UI and copy

**Files:**

- Modify: `apps/web/src/app/[locale]/components/home/hero-v2.tsx`
- Modify: `apps/web/src/app/[locale]/components/home/trust-strip.tsx`
- Modify: `apps/web/src/app/[locale]/components/home/footer.tsx`
- Modify: `apps/web/src/messages/en/hero.json`
- Modify: `apps/web/src/messages/sq/hero.json`
- Modify: `apps/web/src/messages/en/trust.json`
- Modify: `apps/web/src/messages/sq/trust.json`
- Modify: `apps/web/src/messages/en/footer.json`
- Modify: `apps/web/src/messages/sq/footer.json`

**Step 1: Implement the hero proof chips**

- Replace the hardcoded `HeroV2` trust copy with `next-intl` lookups.
- Add structured proof-chip and trust-cue rows that reflect the published commercial boundary and language support.

**Step 2: Implement the trust-strip cue row**

- Keep the current stats.
- Add a second row with compact trust cues for claim-first scope, hotline or WhatsApp support, and multilingual support.

**Step 3: Implement the footer safety net**

- Add a visible urgent-help block near the existing contact cluster.
- Keep phone and WhatsApp reachable from the footer while adding explicit claim-first and multilingual trust cues.

**Step 4: Re-run the targeted tests to verify green**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/hero-v2.test.tsx' 'src/app/[locale]/components/home/trust-strip.test.tsx' 'src/app/[locale]/components/home/footer.test.tsx'
```

Expected: all three tests pass.

### Task 3: Record proof and verify the completed tranche item

**Files:**

- Create: `docs/plans/2026-03-11-t01-free-start-trust-ux-evidence.md`
- Modify: `docs/plans/current-program.md`
- Modify: `docs/plans/current-tracker.md`

**Step 1: Record evidence**

- Summarize the scope, implemented surfaces, and verification commands in the `T01` evidence note.

**Step 2: Update the live program and tracker**

- Mark `T01` completed.
- Add the evidence note and touched files to the proof ledger.

**Step 3: Run the required verification**

Run:

```bash
pnpm security:guard
pnpm pr:verify
pnpm e2e:gate
```

Expected: the narrow `T01` landing-surface slice is verified without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.
