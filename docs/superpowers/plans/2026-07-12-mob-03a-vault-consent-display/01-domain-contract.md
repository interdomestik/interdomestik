# Task 1: Pure fail-closed display contract

**Files:**

- `packages/domain-claims/src/claims/vault-consent-display.ts`
- `packages/domain-claims/src/claims/vault-consent-display*.test.ts`
- `packages/domain-claims/src/index.ts`

- [ ] Write failing tests for exact MK code/country, vehicle/property allowlist,
      erased subject state, and eligible empty display.
- [ ] Run the focused test and confirm RED because the module does not exist.
- [ ] Define `VaultConsentDisplay` as `hidden | subject_erased | ready(items)`.
      `subject_erased` carries no items. Items expose only `category: evidence`,
      `updatedAt`, accepted/withdrawn/missing status, recorded time, and version.
- [ ] Make the gate tests GREEN with the minimal implementation.
- [ ] Write the next failing tests proving:
  - only evidence documents survive; legal, medical-like, and unknown do not;
  - only exact AI extraction type and purpose are eligible;
  - latest consent sorts by `recordedAt DESC, id DESC`;
  - accepted exposes version; withdrawn and missing do not;
  - `updatedAt` is the latest eligible document/consent timestamp;
  - output excludes IDs, names, MIME/size/path, and subject/user fields.
- [ ] Implement explicit allowlists and deterministic selection, then rerun.
- [ ] Export the contract from `packages/domain-claims/src/index.ts`.
- [ ] Run:

```bash
pnpm --filter @interdomestik/domain-claims test:unit --run src/claims/vault-consent-display.test.ts src/claims/vault-consent-display-selection.test.ts src/claims/vault-consent-display-safety.test.ts
pnpm --filter @interdomestik/domain-claims type-check
wc -l packages/domain-claims/src/claims/vault-consent-display*.ts
pnpm check:modularity-guard
```

- [ ] Keep every new file at `<=150` lines and commit:
      `feat: add MOB-03a display contract`.
