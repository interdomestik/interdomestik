# Task 3: Safe member DTO integration

**Files:** tracking server document mapper, Vault serializer/test, claim-detail
query/tests/types, and existing member claim-detail page/tests.

- [ ] Record baseline line counts. `getMemberClaimDetail.ts` begins at 156 lines
      and must finish at or below 150.
- [ ] Write RED tests expecting `vaultConsentDisplay`, correct helper arguments,
      and page serialization of ready dates while hidden/erased remain item-free.
- [ ] Extract the existing document mapping into `member-claim-documents.ts`.
- [ ] Add `vaultConsentDisplay` to `ClaimTrackingDetailDto`. Call the read only
      after the owner-scoped claim exists.
- [ ] Serialize only `updatedAt` and `consentRecordedAt`; never add IDs.
- [ ] Run focused claim-detail, serializer, and page tests, then line counts and
      `pnpm check:modularity-guard`.
- [ ] Every touched/new production file must end at or below 150 lines.
- [ ] Commit: `feat: expose MOB-03a member DTO`.
