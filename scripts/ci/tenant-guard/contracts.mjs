// Source-bound operation contracts, filled from the measured inventory (see tenant-guard-contract.mjs).
// A module, not JSON, so the protected required workflow loads it through its closed .mjs closure.
const deepFreeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const CONTRACTS = deepFreeze([
  {
    file: 'apps/web/src/app/api/documents/[id]/route.ts',
    unit: 'GET',
    kinds: {
      'value:db': 2,
    },
    sha256: '4985fd403c1066179bc0754624f9c942e4401751727409b771bc8ceff173916f',
    reason:
      'Unchanged base route hands the ambient client to the document access core only for the post-local cross-tenant grant fallback (withDocumentReadContext/withGrantReadContext pin the grant-resolved tenant); local reads run in the session tenant context.',
  },
  {
    file: 'apps/web/src/app/api/documents/[id]/download/route.ts',
    unit: 'GET',
    kinds: {
      'value:db': 2,
    },
    sha256: '7d2788c7883d701ab445f80d0b8959291088d1c7f6abae2ec10e871a493ed419',
    reason:
      'Unchanged base download route: same ambient-client hand-off as the signed-url route, used only by the cross-tenant grant fallback and signed-url creation for the already-authorized document.',
  },
  {
    file: 'apps/web/src/app/api/documents/cross-tenant-document-lookup.ts',
    unit: 'withDocumentReadContext',
    kinds: {
      execute: 3,
      'connection-control': 3,
    },
    sha256: '8efb049acad249a156791edb4022e597b4b69910e54d2d2a871c6e767ab4581b',
    reason:
      'Case-grant cross-tenant read context (base): enables row security and pins tenant/access GUCs to the grant-resolved home tenant inside one transaction. Residual: move to a kernel case-grant producer after the pilot. Sink: callers must stay unchanged.',
  },
  {
    file: 'apps/web/src/app/api/documents/durable-case-grants.ts',
    unit: 'withGrantReadContext',
    kinds: {
      execute: 3,
      'connection-control': 3,
    },
    sha256: '032893c64f86120fff49599581eafc326abfc677fe89da60b76ac52aef2e3d2e',
    reason:
      'Case-grant table read context (base): enables row security and pins tenant/access GUCs to the validated access tenant for case_scoped_access_grants reads. Residual: kernel case-grant producer after the pilot. Sink: callers must stay unchanged.',
  },
  {
    file: 'apps/web/src/i18n/messages.ts',
    unit: 'loadNamespaceMessages',
    kinds: {
      'dynamic-import': 3,
    },
    sha256: '0af58e17306a4683040248ab06634c86a10c18d57239d8dc67255da0a903fcbb',
    reason:
      'Template imports resolve only to ../messages/<locale>/<namespace>.json catalogs (data, no code); locale comes from the routing allowlist.',
  },
  {
    file: 'apps/web/src/app/[locale]/_core.entry.tsx',
    unit: 'generateMetadata',
    kinds: {
      'dynamic-import': 1,
    },
    sha256: '60aa9052ede1e2f386767e6d261b9d9f971e68c4010ccc1920fabae4562631dd',
    reason:
      'Template import resolves only to @/messages/<locale>/metadata.json (data, no code); locale comes from the routing allowlist.',
  },
  {
    file: 'apps/web/src/lib/auth/different-email-recovery-store.ts',
    unit: 'withUserLock',
    kinds: {
      execute: 1,
    },
    sha256: '2908771827505f9bcf61dc8388cb8b689ed9fba4920acf9f1c8e60d753641f38',
    reason:
      'Pre-tenant account recovery (listed dbAdmin caller): per-user transaction advisory lock pg_advisory_xact_lock; no tenant data, no connection-control.',
  },
  {
    file: 'apps/web/src/lib/auth/different-email-recovery-store.ts',
    unit: 'confirmReplacementProof',
    kinds: {
      execute: 1,
    },
    sha256: '33ae8abe4e4fb22eaad35da3faedd1cb104fa04dc04a0c599ad45d1b367b83ac',
    reason:
      'Pre-tenant account recovery: share-row-exclusive lock on the user table to serialize the email replacement proof check; fixed SQL, no connection-control.',
  },
  {
    file: 'apps/web/src/lib/auth/schema.ts',
    unit: 'databaseAdapter',
    kinds: {
      'value:dbAdmin': 1,
    },
    sha256: 'd517b65eaa6592b889a835087fc41d7e229ea5e46f283d9dc7cf4aab7e630dbe',
    reason:
      "better-auth's drizzle adapter: identity/session storage precedes any tenant and runs on the admin connection by design (Supabase Auth -> better-auth layering).",
  },
  {
    file: 'apps/web/src/lib/auth/member-number-session-hook.ts',
    unit: 'runMemberNumberSessionHook',
    kinds: {
      'value:dbAdmin': 1,
    },
    sha256: '6a0f984accdd754bf685c0a546aa612f5228e1374aef98e3cd5804d1a75caa62',
    reason:
      "Pre-tenant auth session hook: hands the admin client to generateMemberNumberWithRetry for the session user's own member number.",
  },
  {
    file: 'apps/web/src/lib/auth/member-number-user-create-hook.ts',
    unit: 'runMemberNumberUserCreateHook',
    kinds: {
      'value:dbAdmin': 1,
    },
    sha256: 'e88a04005b778e4bd9315537e8b1cfc7d9616658433247fd7ffb3594fe541cff',
    reason:
      'Pre-tenant auth user-create hook: hands the admin client to generateMemberNumberWithRetry for the newly created user.',
  },
  {
    file: 'packages/database/src/db.ts',
    unit: 'loadOptionalSentry',
    kinds: {
      eval: 1,
    },
    sha256: 'd5c2d753187f4221a545960b819d5adfb9f3d28bb42f70962164f04e6bc346fb',
    reason:
      "Kernel: new Function wraps a fixed import('@sentry/nextjs') so bundlers do not resolve the optional dependency; the specifier is a constant.",
  },
  {
    file: 'packages/domain-activities/src/get-member.ts',
    unit: 'hasMemberActivitiesTable',
    kinds: {
      execute: 1,
    },
    sha256: '1fdec2442e9cc933540e300e33bc9ef97d3794fa4fd68985ca65a47bd2bf1949',
    reason:
      "Fixed to_regclass('public.member_activities') existence probe; returns a boolean, reads no tenant rows.",
  },
  {
    file: 'packages/domain-activities/src/log-member.ts',
    unit: 'hasMemberActivitiesTable',
    kinds: {
      execute: 1,
    },
    sha256: 'ffb1adf7d32a9aa814cf08d1f7e00dcdcbd9ecd82c832045a65d49b51d6d30bc',
    reason:
      "Fixed to_regclass('public.member_activities') existence probe; returns a boolean, reads no tenant rows.",
  },
  {
    file: 'packages/database/src/migrate.ts',
    unit: '<ExpressionStatement@34>',
    kinds: {
      'value:dbAdmin': 1,
    },
    sha256: '76ce4b397d9a0484baaf2250554a6920fa459277ae6a94c5e0dfe68424c4e3a3',
    reason:
      'Migration CLI: drizzle migrate runs on the owner/admin connection; the RLS runtime role cannot create objects. Not imported by runtime code.',
  },
  {
    file: 'apps/web/src/adapters/crm/lead-follow-up-repository.ts',
    unit: 'createCrmLeadFollowUpRepository',
    kinds: {
      execute: 2,
    },
    sha256: 'b618b73bda9f1bdb1fca1edc12bc6ab407215104ae9d3c6d08111d805636ff31',
    reason:
      "Parameterized follow-up insert/complete on the repository authority's tenant transaction; row tenant_id is the authority tenant and a caller tenant mismatch throws before SQL.",
  },
  {
    file: 'apps/web/src/app/api/policies/analyze/_document-lifecycle-guard.ts',
    unit: 'lockActiveDocument',
    kinds: {
      execute: 1,
    },
    sha256: '6af299c43f226a0277a4a051164c64e65a53e4c4d0be3d88e109887ae9a15eb6',
    reason:
      "Parameterized FOR UPDATE row lock on one active document by exact id and tenant, inside the caller's tenant transaction; reads only the id.",
  },
  {
    file: 'apps/web/src/lib/ai/claim-pipeline-persist.ts',
    unit: 'lockActiveDocument',
    kinds: {
      execute: 1,
    },
    sha256: '4874c3cbaca1210f63cd2a9fcfb81d32888e963f5552616e0b2836898bb3422b',
    reason:
      "Parameterized FOR UPDATE row lock on one active document by exact id and tenant, inside the caller's tenant transaction; reads only the id.",
  },
  {
    file: 'packages/domain-claims/src/claims/jurisdiction-handoff-store.ts',
    unit: 'lockHandoffClaim',
    kinds: {
      execute: 1,
    },
    sha256: '7075581d3179ff618f5c64bcb699acafff67878adc5f27b123376f32a4f88494',
    reason:
      'Parameterized FOR UPDATE lock of one claim by tenant and id inside the handoff tenant transaction; returns nothing.',
  },
  {
    file: 'packages/domain-claims/src/claims/lifecycle-read-sql.ts',
    unit: 'claimAliasColumn',
    kinds: {
      'sql.raw': 1,
    },
    sha256: '01515117e17a2e4eda0f8691f20d94e7ebde813d50b65291578faeb9a8e92dcd',
    reason: String.raw`Identifier-only raw SQL: the alias is validated against ^[A-Za-z_]\w*$ and the column names are fixed code constants; no value reaches sql.raw.`,
  },
  {
    file: 'packages/domain-claims/src/claims/recovery-invariant-evidence.ts',
    unit: 'lockEscalationAgreementEvidence',
    kinds: {
      execute: 1,
    },
    sha256: '6d6a0d4652edf996ee0adf5a5b31cb74fbf7f0396093d5d06651ac99469ef439',
    reason:
      "Parameterized FOR UPDATE read of one claim's escalation agreement evidence by tenant and claim inside the transition tenant transaction.",
  },
  {
    file: 'packages/domain-claims/src/claims/recovery-invariant-evidence.ts',
    unit: 'lockNoFeeEvidence',
    kinds: {
      execute: 1,
    },
    sha256: '76cad4e5c3f74aac84f84160dd3213f06f4f6a962e33174508aea5a2a4ceaf74',
    reason:
      "Parameterized FOR UPDATE read of one claim's no-fee evidence by tenant and claim inside the transition tenant transaction.",
  },
  {
    file: 'packages/domain-claims/src/claims/transition-evidence-read.ts',
    unit: 'lockTransitionEvidence',
    kinds: {
      execute: 1,
    },
    sha256: 'dace638fe8f8288182d76db2e77e42e7591a0cc496c2f38b3066a91310a05907',
    reason:
      "Parameterized FOR UPDATE read of a claim's non-revoked transition evidence scoped by access/home tenant and claim inside the transition tenant transaction.",
  },
  {
    file: 'packages/domain-claims/src/staff-claims/matter-allowance.ts',
    unit: 'countRecoveryMatterUsageInWindow',
    kinds: {
      execute: 1,
    },
    sha256: 'e9541dfa0debd0ffefbf1865211ca3c4a608ecab864e53196402bf3814f87d3e',
    reason:
      'Parameterized transaction-scoped advisory lock keyed by tenant and subscription to serialize matter allowance counting; no row data.',
  },
]);
