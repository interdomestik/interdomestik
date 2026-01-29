# Interdomestik V3: The Viral Engine & Unified Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Interdomestik from a standard assistance app into a viral, member-driven network ("Interdomestik V3"). This includes a unified "Crystal" dashboard, a "Member-to-Agent" activation flow, and a "POS Mode" for high-volume partners.

**Architecture:**

- **Hybrid Identity:** Users are primarily `Members`. The `Agent` capability is an "add-on" role activated via a server action.
- **Unified App Shell:** A single `DashboardLayout` handles `Member`, `Agent`, and `Admin` views, adapting the sidebar/header dynamically.
- **Commission Engine:** 50% commission logic built into the core `billing` domain, triggered on successful Paddle webhooks.
- **POS Mode:** A specialized, high-velocity UI for "Partner" agents (e.g., Registration Offices) to onboard users without email friction.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS (Crystal/Glassmorphism), Postgres (Drizzle), Paddle (Payments), Better-Auth (Authentication).

---

### Task 1: The "Universal Shell" (Frontend)

**Files:**

- Modify: `apps/web/src/components/dashboard/dashboard-sidebar.tsx` (Refactor to Glassmorphism & Role-Aware)
- Modify: `apps/web/src/components/dashboard/dashboard-header.tsx` (Add Command Menu & Context)
- Create: `apps/web/src/components/dashboard/nav-item.tsx` (Reusable, animated nav item)

**Step 1: Create the "Crystal" Nav Item**
Build a reusable `NavItem` component that supports:

- `active` state (glowing gradient background).
- `icon` (Lucide).
- `badge` (for "New" or counts).
- `collapsed` mode support.

**Step 2: Refactor Sidebar to "Glass"**
Update `DashboardLayout` (Sidebar) to use `backdrop-blur-xl`, `bg-background/60`, and a subtle border. Remove the hardcoded "Member vs Agent" split; instead, accept a `navConfig` prop.

**Step 3: Refactor Header**
Add a global `CommandMenu` trigger (visual only for now) and breadcrumbs placeholder. Ensure it matches the glass aesthetic.

---

### Task 2: The "Member-to-Agent" Activation (Backend)

**Files:**

- Modify: `packages/database/src/schema/users.ts` (Ensure `isAgent` or role support exists)
- Create: `apps/web/src/features/agent/activation/actions.ts` (Server Actions)
- Test: `tests/integration/agent-activation.test.ts`

**Step 1: Define the Server Action**
Create `activateAgentProfile(userId)`:

- Check if user exists.
- Generate `referralCode` (e.g., `FIRSTNAME-RANDOM`).
- Set `role = 'agent'` (or append role).
- Create initial `AgentProfile` record if needed.
- Return `{ success: true, referralCode: '...' }`.

**Step 2: Unit Test**
Verify that a standard Member can call this and become an Agent.

---

### Task 3: The "Viral Hook" (UI)

**Files:**

- Create: `apps/web/src/features/member/components/referral-card.tsx`
- Modify: `apps/web/src/app/[locale]/(dashboard)/member/page.tsx`

**Step 1: Build the "Refer & Earn" Card**
Design a shimmering, high-contrast card for the Member Dashboard grid.

- Copy: "Earn 50% Commission".
- Action: Opens the Activation Modal.

**Step 2: Build the Activation Modal**

- A clean dialog explaining the terms.
- "Activate Now" button calling the Server Action from Task 2.
- On success: Confetti & redirect/refresh to show Agent tabs.

---

### Task 4: Unified Agent Dashboard (Refactor)

**Files:**

- Delete: `apps/web/src/features/agent/dashboard/components/AgentDashboardLite.tsx`
- Modify: `apps/web/src/features/agent/dashboard/components/AgentDashboardV2Page.tsx`
- Modify: `apps/web/src/features/agent/dashboard/components/StatsGrid.tsx`

**Step 1: Merge Lite into Pro**
Refactor `AgentDashboardV2Page` to act as the "Unified" view.

- If `clientCount === 0`: Show "Getting Started" hero (Copy Link, QR Code).
- If `clientCount > 0`: Show full Stats Grid (Leads, Earnings, Pipeline).

**Step 2: Polish Visuals**
Apply the "Crystal" design tokens (from Task 1) to the Stats Cards.

---

### Task 5: The "POS Mode" (Partner Feature)

**Files:**

- Create: `apps/web/src/app/[locale]/(dashboard)/agent/pos/page.tsx`
- Create: `apps/web/src/features/agent/pos/components/quick-register-form.tsx`

**Step 1: Build the "Quick Register" Form**
A stripped-down, high-speed form for Partners:

- Fields: Name, Plate, Phone (No Email required initially, or optional).
- Payment: "Cash" (Partner Wallet deduction) or "Link" (SMS to user).

**Step 2: Route Protection**
Ensure only Agents with `type: 'partner'` (or similar flag) can access `/agent/pos`. (For now, maybe open to all 'Pro' agents).

---

### Task 6: Commission Engine (Billing Domain)

**Files:**

- Modify: `packages/domain-billing/src/commission-calculator.ts` (or similar)
- Test: `tests/domain/billing/commission.test.ts`

**Step 1: Implement 50% Logic**
Ensure the commission calculation logic strictly follows the "50% of Net Revenue" rule.

- `Commission = (PlanPrice - Tax - Fees) * 0.50`

**Step 2: Verify Payout Logic**

### Task 7: Bulk Import for Enterprise Brokers

**Files:**

- Create: `apps/web/src/app/[locale]/(dashboard)/agent/import/page.tsx`
- Create: `apps/web/src/features/agent/import/components/csv-uploader.tsx`
- Create: `apps/web/src/features/agent/import/actions.ts`

**Step 1: Build the CSV Dropzone**
Create a clean, glassmorphic dropzone where brokers can drag & drop their client lists.

- Columns required: `Full Name`, `Phone`, `Email`, `Plate Number`.

**Step 2: Client-side Validation**
Parse the CSV and show a preview table with "Valid" vs "Error" (e.g., missing phone) rows before they commit.

**Step 3: Server Action (Bulk)**
`bulkRegisterMembers(rows)`: Process 50-100 rows per batch, creating member records and attributing them to the Enterprise Agent.

---
