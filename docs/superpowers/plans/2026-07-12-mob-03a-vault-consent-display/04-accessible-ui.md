# Task 4: Accessible AI-extraction consent card

**Files:** new card/test, extracted evidence section, existing detail page/test,
and `sq`, `mk`, `en` `claims-tracking.json` messages.

- [ ] Write RED component tests: hidden has no marker; erased is neutral and
      count-free; accepted/withdrawn/missing use distinct safe copy; only accepted
      renders a version; headings/statuses have accessible names; forbidden raw
      fields/categories never render; all consent copy is AI-extraction-qualified.
- [ ] Add localized title, exact AI-extraction description, category, metadata
      time, statuses, recorded date, version, empty/unavailable, and erased copy.
- [ ] Build a semantic section with visible status text and
      `data-testid="member-vault-consent"`; use the existing date helper and add no
      action, link, upload/download, or mutation.
- [ ] Extract the existing `OpsDocumentsPanel` block into
      `MemberClaimEvidenceSection.tsx`, place the card beside it, and preserve the
      pre-existing panel behavior while shrinking the 405-line legacy page.
- [ ] Run card/detail tests, `pnpm i18n:check`, `pnpm i18n:purity:check`, line
      counts, and `pnpm check:modularity-guard`.
- [ ] Commit: `feat: render MOB-03a consent summary`.
