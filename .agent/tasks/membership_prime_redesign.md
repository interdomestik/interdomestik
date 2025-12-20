# Implementation Plan: Membership Prime Home Page Redesign

Refine the home page sections (Categories, How it Works, Pricing, CTA) to match the "Prime" premium mockups provided by the user.

## 1. Localized Content Updates (`messages/sq/*.json`)

- [ ] Update `claimCategories.json`: Ensure titles and descriptions match mockup.
- [ ] Update `howItWorks.json`: Use exact Albanian labels (Dorëzoni Kërkesën, Vlerësim Falas, Ne Merremi me Gjithçka, Merrni Kompensimin).
- [ ] Update `pricing.json`: Ensure "Më e zgjedhura" label and feature list match.
- [ ] Update `hero.json`: Ensure CTA sections match mockup wording.

## 2. Claim Categories Section (`claim-categories-section.tsx`)

- [ ] Remove `brand-gradient` from icon containers; use solid primary blue.
- [ ] Style icon box as a rounded-xl square with light blue background.
- [ ] Refine card shadows and border-radius to feel "Prime".
- [ ] Center the section header and subtitle.

## 3. How It Works Section (`how-it-works-section.tsx`)

- [ ] Change step circles from `brand-gradient` to solid `bg-primary`.
- [ ] Refine the connecting line style (subtle, centered).
- [ ] Adjust typography for step numbers and labels.

## 4. Pricing Section (`pricing-section.tsx`)

- [ ] Implement the "Most Chosen" (Standard) plan with a distinct primary border.
- [ ] Add the floating badge "Më e zgjedhura" at the top center of the Standard plan.
- [ ] Increase font size of price values (`text-4xl` or `text-5xl`).
- [ ] Style checkmarks with primary green/blue.
- [ ] Ensure buttons are full width and localized.

## 5. Final CTA Section (`cta-section.tsx`)

- [ ] Change background from `brand-gradient` to a solid, deep premium blue (`bg-[#051C3E]` or similar).
- [ ] Centered layout for title, subtitle, and buttons.
- [ ] Refine button styles (white buttons with primary text).

## 6. Verification

- [ ] Run `pnpm qa` to ensure no regressions.
- [ ] Capture screenshots and compare with user mockups.
