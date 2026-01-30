# Matte Layered Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the member dashboard into a high-fidelity "Matte Layered" depth system with lifted action cards and refractive glass containers.

**Architecture:** Create a new `MatteAnchorCard` component for primary actions that implements a dual-shadow system for "lift". Refactor the `MemberDashboardView` to use these new components and a clearer layering hierarchy.

**Tech Stack:** React (Next.js App Router), Tailwind CSS, Framer Motion, Lucide React.

---

### Task 1: Create the MatteAnchorCard Component

**Files:**

- Create: `apps/web/src/components/dashboard/matte-anchor-card.tsx`
- Test: `apps/web/src/components/dashboard/matte-anchor-card.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { MatteAnchorCard } from './matte-anchor-card';
import { Shield } from 'lucide-react';

describe('MatteAnchorCard', () => {
  it('renders the label and description', () => {
    render(
      <MatteAnchorCard label="Test Label" description="Test Desc" icon={Shield} href="/test" />
    );
    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByText('Test Desc')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm --filter @interdomestik/web test:unit apps/web/src/components/dashboard/matte-anchor-card.test.tsx`

**Step 3: Write minimal implementation**

```tsx
'use client';

import { LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { motion } from 'framer-motion';

interface MatteAnchorCardProps {
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
  colorClassName?: string;
}

export function MatteAnchorCard({
  label,
  description,
  icon: Icon,
  href,
  colorClassName = 'from-slate-900 to-slate-800',
}: MatteAnchorCardProps) {
  return (
    <motion.div
      whileHover={{ y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative h-full"
    >
      <Link href={href} className="block h-full">
        <div
          className={`
          relative h-full p-8 rounded-[2.5rem] bg-gradient-to-br ${colorClassName}
          border border-white/10 overflow-hidden transition-all duration-500
          shadow-[0_10px_15px_-3px_rgba(0,0,0,0.4),0_20px_25px_-5px_rgba(0,0,0,0.1)]
          group-hover:shadow-[0_40px_60px_-15px_rgba(0,0,0,0.5),0_10px_15px_-3px_rgba(0,0,0,0.4)]
        `}
        >
          <div className="bg-white/10 p-4 rounded-2xl w-fit mb-6">
            <Icon className="w-7 h-7 text-white" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">
            {description}
          </p>
          <span className="text-2xl font-black text-white leading-tight block">{label}</span>
        </div>
      </Link>
    </motion.div>
  );
}
```

**Step 4: Run test to verify it passes**
Run: `pnpm --filter @interdomestik/web test:unit apps/web/src/components/dashboard/matte-anchor-card.test.tsx`

**Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/matte-anchor-card.tsx apps/web/src/components/dashboard/matte-anchor-card.test.tsx
git commit -m "feat(ui): add MatteAnchorCard with high-contrast lift system" # b26287f
```

---

### Task 2: Refactor MemberDashboardView to use MatteAnchorCard

**Files:**

- Modify: `apps/web/src/components/dashboard/member-dashboard-view.tsx`

**Step 1: Replace HomeGrid items with MatteAnchorCard**
Update the mapping logic in `MemberDashboardView` to use the new `MatteAnchorCard` component for the 4 primary actions.

**Step 2: Verify visual consistency**
Run the dev server and check the dashboard at `/member`.

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/member-dashboard-view.tsx
git commit -m "refactor(member): migrate primary actions to MatteAnchorCard depth system" # 5bf320e
```

---

### Task 3: Implement the Refractive Glass Containment

**Files:**

- Modify: `apps/web/src/components/dashboard/member-dashboard-view.tsx`

**Step 1: Update the Header Section with refractive borders**
Apply the `border-white/20` and `backdrop-blur-xl` to the header card to align with the "Glass" portion of the Matte Layered design.

**Step 2: Commit**

```bash
git add apps/web/src/components/dashboard/member-dashboard-view.tsx
git commit -m "ui(member): apply refractive glass styling to dashboard header" # ff67c3b
```
