**Comparison Target**

- Source visual truth: `/Users/arbenlila/.codex/generated_images/019f5c11-d767-7b60-9972-b1e393df5b89/exec-876e97f1-5d45-4013-b760-0e5ecd7c2013.png`
  (`30419bc05cf211a6c198f45a308a0d5b054c47cc05bccc2ce03366dd230ac14b`).
- Browser-rendered implementation: `tmp/design-evidence/public-entry-sq-1440-final.png`
  (`ce988dd7d4f23ac807e13d0352443251e13d1287bb69e92c823e1060099a3dfb`).
- Full-view comparison: `tmp/design-evidence/option-3-vs-final.png`
  (`1b58859808b3d460fd363b5787fb72d739be009cce2ee506ec7dd159aeb23672`).
- Viewport and state: 1440 by 760 CSS pixels, light theme, Albanian, anonymous public
  entry. The implementation capture includes the unchanged sticky header where it overlays the
  hero crop; that header is outside `IDA-UI01a`.
- Responsive evidence: `tmp/design-evidence/public-entry-sq-375-final.png` and
  `tmp/design-evidence/public-entry-mk-390.png`, plus the focused Playwright matrix at 375, 390,
  720, 768, 1024, 1440, and 844 by 390 CSS pixels.
- Focused-region comparison was not needed after the final full-view composite: the target has no
  imagery, logos, dense controls, or fine asset detail, and the full-view composite keeps the
  heading, rail, button, dividers, copy, and arrows readable. Mobile captures separately verify
  the only materially different reflow.

**Findings**

- No actionable P0, P1, or P2 visual mismatch remains inside `public-entry-hero`.
- [P3] The production heading uses the repository's existing display font rather than attempting
  to identify and add the mock generator's exact font. The weight, wrapping, and editorial scale
  preserve the selected hierarchy without changing shared tokens or introducing a new font.
- [P3] The final implementation uses the existing semantic teal token instead of sampling a new
  hard-coded blue/teal pair from the mock. Measured text contrast is at least 4.5:1 in the focused
  browser test.

**Required Fidelity Surfaces**

- Fonts and typography: the final desktop title uses three balanced lines like the source; SQ and
  MK mobile titles wrap without truncation. Body copy remains at least 16 CSS pixels. No new font
  or shared typography token was introduced.
- Spacing and layout rhythm: the desktop rail, content origin, primary-action width, structural
  closing rule, and two-column secondary actions now follow the source proportions. Mobile turns
  the rail into an eyebrow/rule and preserves at least 8 CSS pixels between interactive targets.
- Colors and visual tokens: foreground, background, primary, accent, and focus-ring colors come
  from existing semantic tokens. There are no gradients, glass surfaces, decorative shadows, or
  unsupported status colors.
- Image quality and asset fidelity: the selected direction contains no raster product asset or
  illustration to ship. Arrows use the repository's existing Lucide dependency; no handcrafted
  SVG, CSS art, placeholder image, or fake product card was introduced.
- Copy and content: the approved SQ action label is shortened to `Shih anëtarësimin vjetor`.
  Membership remains dominant; Help Now and case organization are immediately visible and each
  complete title/description/arrow row is one link. Quantitative and guarantee claims are absent.
- Interaction and accessibility: the three real links work by keyboard in visual order, focus is
  visible, targets are at least 44 by 44 CSS pixels, reduced motion collapses the arrow transition,
  and no tested viewport has horizontal overflow.

**Comparison History**

1. Initial implementation comparison found P2 geometry drift: the 1280-pixel container shifted
   the rail and content too far right, the primary action was materially narrower than the source,
   and the rule appeared after the utility prompt while the rail continued through the secondary
   actions. It also exposed a cookie overlay in the evidence capture.
2. Fixes: widened the bounded desktop frame, aligned the 1440-pixel content origin to the source,
   widened the primary action, split the primary and secondary grid rows, closed the teal rail at
   the primary rule, moved the utility prompt below that rule, and dismissed only the evidence
   browser's optional cookie overlay.
3. Post-fix evidence: `tmp/design-evidence/option-3-vs-final.png` shows the corrected desktop
   geometry. The 375-pixel SQ and 390-pixel MK captures show clean reflow, one-line CTAs, full
   Cyrillic copy, and no overlap or clipping.

**Primary Interactions Tested**

- Membership link activated by keyboard and resolved to locale-aware `/pricing`.
- Help Now link activated by keyboard and resolved to locale-aware `/help-now`.
- Case organization link activated by keyboard and resolved to `#free-start-intake`.
- SQ, EN, SR, and MK headings, three accessible links, hrefs, and unsupported-claim absence.
- Responsive target size, spacing, measured contrast, reduced motion, and overflow matrix.

**Console Review**

- The hero produced no scoped console error during Playwright MCP review.
- Development-mode review exposed an existing hydration warning in the below-fold success-fee
  calculator and a Turbopack hot-reload chunk warning. Neither originates in, is imported by, or
  is authorized for this hero slice. The focused production Playwright proof passed.

**Authority and Reviewer Disposition**

- The final commit-readiness AI OS refresh produced receipt
  `fc38e1228da6f2c489c6eb776ca84e18a9ea9295a6947d98853720315b0b0c88` and state observation
  `8f99ffd024bcae0aa4293fea7cf391586f5e64de553ca250a3229758690c7f3b`; it still reported
  `activeSlice=none` / `runtime=not_authorized`. That advisory reads canonical root/main, not this
  promoted worktree. Branch-local canonical authority at promotion commit `5b8ce6573` names only
  `IDA-UI01a`; repo authority therefore wins this recorded worktree-observation mismatch.
- The final Codex Sol Ultra implementation review was bounded to 15 minutes. It produced no
  verdict before timeout because its read-only sandbox attempted the full unit suite and could not
  create Vitest's temporary client directory (`EPERM`). This is a reviewer-environment blocker,
  not a code or provider-capacity verdict, and it was not retried indefinitely. Existing bounded
  Fable, Opus, Gemini, Claude Design, and Codex Sol design-gate findings remain reconciled in the
  canonical gate.
- The repository-size gate already failed on the reconciled baseline by one tracked file. The
  provided inventory sync script measured this complete diff and updated only
  `scripts/repo-size-budget.json`; `pnpm repo:size:check` now passes. No binary or generated visual
  evidence was added to the tracked diff.

**Verification Matrix**

- `pnpm pr:verify`: passed, including production build, 84.80% repository line coverage, 142
  gate tests (8 skipped), and 13 production smoke tests (9 skipped).
- `pnpm security:guard`: passed independently; protected-surface diff is empty.
- `pnpm e2e:gate`: passed with 142 tests and 8 contractually skipped tests after a clean reset,
  migration, deterministic seed, production build, and bundle-size proof.
- Focused hero proof: 13 unit/message tests, 3 responsive Playwright tests, 1 funnel-continuity
  test, and 2 front-door tests passed. SQ/EN/SR/MK, seven viewport shapes, keyboard operation,
  target size, spacing, contrast, reduced motion, destinations, and unsupported-claim absence are
  covered.
- `pnpm slice:verify` reached the domain suite after all slice/static and 2,847 web tests passed,
  then stopped on the pre-existing `packages/database/test/deferred-backfills.test.ts` expectation
  for an index declaration that moved behind the current `claims.ts` re-export. The UI diff does
  not touch `packages/database`; fixing that protected baseline defect is outside `IDA-UI01a`.

**Open Questions**

- Exact browser-toolbar 200% zoom could not be automated through Playwright; the required
  720-pixel reflow proxy for a 1440-pixel baseline passed. A named human must still record the
  separate manual 200% zoom observation before merge.
- SQ/EN/SR/MK copy is structurally complete and browser-proven, but named human linguistic and
  legal/commercial approval remains the design gate's release condition.

**Implementation Checklist**

- [x] Match Option 3 geometry and membership-first hierarchy.
- [x] Preserve the settled-member continuation contract.
- [x] Prove four locales, keyboard access, targets, contrast, reduced motion, and responsive flow.
- [x] Preserve protected routing, auth, tenancy, data, billing, and deployment surfaces.
- [ ] Record named human copy/legal-commercial approval and manual 200% zoom evidence before merge.

**Follow-up Polish**

- A later separately gated header slice can remove legacy nested link/button markup and claim-heavy
  header language. Those residuals are intentionally visible in evidence and are not hidden here.

final result: passed
