export default {
  testDir: './tests',
  testMatch: [
    'fixture-browser.spec.mjs',
    'named-access-browser.spec.mjs',
    'fixture-leakage-browser.spec.mjs',
    'receipt-directory-browser.spec.mjs',
    'receipt-signing-browser.spec.mjs',
  ],
  workers: 1,
  use: { headless: true },
};
