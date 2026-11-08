// Reviewed C1 admission for the German locale (see c1-admissions.mjs for the all-or-nothing
// semantics). Owner approval 2026-11-08 (chat): "Yes, approved" for this admission and S2 repin.
export const DE_LOCALE_ADDITION = {
  id: 'de-locale-addition-2026-11',
  reason:
    "Reviewed locale list: LOCALES gains 'de' as a fifth supported locale. The member portal " +
    'context reads it only to resolve the request locale; tenant resolution, session authority ' +
    'and the case-summary and membership reads it hands the tenant to are unchanged.',
  files: [
    {
      file: 'apps/web/src/i18n/locales.ts',
      sha256: 'a0d2c7399c561fe51e3f2ce8786a064d864c02713a2c4ab26fe93d6d69834d5d',
      units: ['LOCALES'],
    },
  ],
  sinkEdges: [],
};
