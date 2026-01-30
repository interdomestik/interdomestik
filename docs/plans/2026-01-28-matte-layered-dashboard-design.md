# Design Specification: Matte Layered Dashboard (Crystal Home V2)

**Status**: Validated Design
**Date**: 2026-01-28
**Goal**: Elevate the member dashboard to a professional "Crystal Home" aesthetic using a Matte Layered depth system.

## 1. Core Aesthetic Principles

The UI will transition from a flat glassmorphism to a **Matte Layered Depth** system. This relies on the contrast between high-transparency "Glass" elements and dense, physical "Matte" anchors.

### A. The "Solid Matte" Anchor Cards

Primary Action cards (Incident, Report, Benefits) will be treated as physical objects molded from a solid material.

- **Surface**: Solid matte finish (e.g., `bg-slate-900`) with a subtle 1px border (`border-white/10`).
- **Shadow System (High-Contrast Lift)**:
  - **Ambient Shadow**: `shadow-[0_40px_60px_-15px_rgba(0,0,0,0.3)]` (soft, atmospheric).
  - **Contact Shadow**: `shadow-[0_10px_15px_-3px_rgba(0,0,0,0.4)]` (sharp, grounding).
- **Interaction**: On hover, the cards "Rise" (Y-translation) and the Ambient Shadow expands, simulating physical proximity to the user.

### B. The "Glass" Layering

Secondary information and background panels will remain frosted glass to preserve the "Crystal" branding.

- **Surface**: `bg-white/5` or `bg-slate-900/40` with `backdrop-blur-xl`.
- **Edge Detail**: 1px refractive borders using linear gradients (`from-white/20 to-transparent`).

## 2. Component Architecture

### `MatteAnchorCard.tsx`

A reusable container for high-priority actions.

- **Props**: `variant`, `glowColor`, `intensity`.
- **Implementation**: Uses `framer-motion` for the "Lift" transition and custom Tailwind utilities for the dual-shadow system.

### `RefractiveGlassPanel.tsx`

The containment system for the workspace.

- **Implementation**: High-intensity blur with a matte border to prevent "light leakage" from the background.

## 3. Technical Constraints (Vercel Best Practices)

- **RSC Optimization**: The dashboard shell remains a Server Component. Only the interactive card surfaces use `'use client'`.
- **Bundle Size**: Avoid heavy animation libraries; prefer CSS transitions and optimized `framer-motion` (m-provider).
- **Accessibility**: All lift effects must respect `prefers-reduced-motion`.

## 4. Acceptance Criteria

- [ ] Primary cards appear significantly "closer" to the user than background elements.
- [ ] Hover states produce a realistic parallax "Lift" effect.
- [ ] Contrast ratios on matte surfaces meet WCAG 2.2 AA standards.
- [ ] 0% regression in `purity:audit`.
