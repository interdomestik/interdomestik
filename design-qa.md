# IDA-UI01a design QA — premium Help Now public entry

## Sources and state

- Desktop source: `/Users/arbenlila/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/540810BA-452F-417D-BB92-9C527DE6D477/PHOTO-2026-07-14-05-27-22.jpg`
  - 1280 by 911, anonymous SQ public entry
  - SHA-256 `6892e290222d79f490ad2bcdf8a0bff5025c8f73514c3a8caa920233cbab0aad`
- Mobile source: `/Users/arbenlila/.codex/generated_images/019f5c11-d767-7b60-9972-b1e393df5b89/exec-1b0b1bcb-9a4c-4699-983e-b946de34f118.png`
  - 862 by 1824, anonymous SQ public entry
  - SHA-256 `65754c1c0509c09042140cea3ee79fa0247d56d2d6481e1fa770ff7678d06d20`
- Desktop implementation: `/tmp/interdomestik-pilot-evidence/playwright-mcp-output/page-2026-07-14T05-15-42-636Z.png`
  - 1280 by 911 CSS pixels, anonymous SQ, local `ida.*`
- Mobile implementation: `/tmp/interdomestik-pilot-evidence/playwright-mcp-output/page-2026-07-14T05-15-46-980Z.png`
  - 431 by 912 CSS pixels, anonymous SQ, local `ida.*`
- Side-by-side comparisons:
  - `/tmp/interdomestik-pilot-evidence/ida-ui01a-desktop-comparison.png`
  - `/tmp/interdomestik-pilot-evidence/ida-ui01a-mobile-comparison.png`

The local source paths are review provenance. The durable specification is the
tracked IDA-DG05 help-first amendment and its hashes, semantics, copy, behavior,
responsive contract, and protected-surface exclusions.

## Full and focused comparison

- Overall composition matches the selected editorial direction: midnight header,
  warm-ivory field, serif direct-address question, teal line icons, calm dividers,
  immediate situation rows, safety copy, and a quiet membership close.
- The implementation intentionally applies Arben's later corrections over the
  earlier desktop source: no `Zgjidhni situatën` subheading, no large telephone/team
  panel, no always-available implication, asynchronous WhatsApp, explicit diaspora,
  a larger `NDIHMË TANI`, static flight-soon status, and membership after immediate
  help.
- The desktop hierarchy remains balanced at 1280 and 1440 pixels. The help journey
  is primary without making safety or privacy text compete with the situations.
- The mobile hierarchy remains readable at 320, 375, 390, and 431 pixels. Text wraps
  naturally; no content is clipped or truncated; full-row actions remain at least
  44 CSS pixels high.
- SQ, EN, SR, and MK retain the same semantics and no-overflow behavior. Cyrillic
  copy uses the existing Inter font fallback; the editorial H1 uses the existing
  browser serif stack and remains legible.
- No P0, P1, or P2 visual difference remains.
- P3 residual: the repository contains no approved Interdomestik logo lockup matching
  the reference. The implementation therefore keeps the existing shield motif via
  the installed icon library and does not invent or hand-draw a brand asset. A future
  brand-asset slice may replace it after a signed logo source is available.

## Iteration history

1. Rejected the unmerged membership-first hero as the public face.
2. Locked Help Now as primary with three real situations and flight marked
   `Së shpejti`.
3. Removed the redundant situation heading, large phone/team block, and implied
   round-the-clock availability; added asynchronous WhatsApp and diaspora language.
4. Implemented the desktop and mobile composition test-first while preserving the
   existing intake, pricing, sign-in, and settled-member destinations.
5. Compared source and rendered screenshots side by side at matched desktop size and
   equivalent mobile state. No spacing, type, border, crop, or hierarchy defect at
   P0-P2 remained.
6. Verified four locales, keyboard access, focus, contrast, reduced motion, target
   size, and overflow at 320/375/390/768/844-landscape/1024/1440 pixels.

## Evidence

- Focused unit and message proof: 12 tests passed.
- Focused Playwright proof: 3 tests passed in 7.6 seconds.
- Full repository coverage proof: 2,848 tests passed, 1 skipped; aggregate line
  coverage 84.81 percent against the required 60 percent floor.
- Final local `pnpm pr:verify`: passed, including the production-like build,
  bundle-size checks, 142 full-gate browser tests plus 8 not-applicable skips,
  and the 13-pass PR smoke lane.
- Final local `pnpm security:guard`: passed with all enforced checks clean.
- Independent `pnpm e2e:gate`: 142 passed, 8 skipped, 0 failed.
- Canonical planning/documentation checks passed: `plan:status`, `plan:audit`,
  `track:audit`, and `docs:verify`.
- Browser console: 0 errors; two existing development CSS-preload warnings.
- Manual browser zoom at 200 percent remains the named human merge check and is not
  represented as automated certification.

**implementation QA result: passed**

Merge readiness still requires the gate's named human SQ/EN/SR/MK linguistic and
legal/commercial copy disposition plus the manual 200 percent zoom check. No merge
or production-alias claim is made by this QA record.
