export const WP13_LOCALE_OWNERS = [
  ['legal-acceptance.json', 'wp13-legal-i18n-contract'],
  ['legal-documents.json', 'wp13-legal-i18n-contract'],
];

/** @type {ReadonlyArray<readonly [RegExp, string]>} */
export const WP13_STRUCTURED_OWNERS = [
  [/^apps\/web\/src\/lib\/privacy\/member-acceptance-entries\.json$/u, 'wp13-entry-registry'],
  [
    /^packages\/database\/src\/legal-document-versions\.json$/u,
    'wp13-legal-document-versions-contract',
  ],
];
