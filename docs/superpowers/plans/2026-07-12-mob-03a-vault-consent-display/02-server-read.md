# Task 2: Exact MK tenant and consent read

**Files:**

- `apps/web/src/features/claims/tracking/server/getMemberVaultConsentDisplay.ts`
- matching focused test/support files

- [ ] Write RED tests proving missing/KS/AL/mismatched tenants return `hidden`
      before documents; non-vehicle/property and erased subjects also short-circuit.
- [ ] The first query selects only `tenants.code` and `countryCode` by tenant ID.
      Continue only for exact `{ code: 'MK', countryCode: 'MK' }`.
- [ ] Write RED predicate tests. Document reads require tenant, claim, and
      `category=evidence`. Consent reads require tenant, subject, claim, eligible
      document IDs, exact type/purpose, and `recordedAt DESC, id DESC`. Skip consent
      read when there are no eligible documents.
- [ ] Read only:
  - tenants: code, countryCode;
  - documents: id, category, createdAt;
  - consents: id, documentId, type, purpose, status, recordedAt, privacyVersion.
- [ ] Pass rows to the pure mapper. Add `db-access-guard` explanations. Import no
      writer, storage, upload/download, share-pack, event, or outbox module.
- [ ] Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/claims/tracking/server/getMemberVaultConsentDisplay*.test.ts
pnpm check:db-access
pnpm --filter @interdomestik/web type-check
wc -l apps/web/src/features/claims/tracking/server/getMemberVaultConsentDisplay*.ts
pnpm check:modularity-guard
```

- [ ] Commit: `feat: add tenant-safe MOB-03a read`.
