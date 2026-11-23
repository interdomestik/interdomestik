/** @type {ReadonlyArray<readonly [RegExp, string]>} */
export const WP13_STRUCTURED_OWNERS = [
  [/^apps\/web\/src\/lib\/privacy\/member-acceptance-entries\.json$/u, 'wp13-entry-registry'],
  [
    /^apps\/web\/src\/messages\/(?:de|en|mk|sq|sr)\/legal-(?:acceptance|documents)\.json$/u,
    'wp13-legal-i18n-contract',
  ],
  [
    /^packages\/database\/src\/legal-document-versions\.json$/u,
    'wp13-legal-document-versions-contract',
  ],
];
