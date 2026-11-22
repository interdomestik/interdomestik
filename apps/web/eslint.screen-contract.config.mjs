// The dedicated ESLint config of the screen-contract checks (WP-05 design §3). It is loaded only by
// `scripts/ci/screen-contract-check.mjs` (overrideConfigFile, cwd = the target tree), never by
// `pnpm lint`. Paths are relative to the target tree's root.
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

import screenContract from './eslint/screen-contract/index.mjs';

const SOURCES = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const isOff = value => (Array.isArray(value) ? value[0] : value) === 'off';
const asError = value => (Array.isArray(value) ? ['error', ...value.slice(1)] : 'error');

// Recommended rules that cannot run in this workspace, each with its reason (a named limit of the
// PR). The workspace override `minimatch: '>=10.2.3'` removes the default export that this rule's
// label-content helper calls, so it throws on every <label> with an element child; the local
// `labelled-control` rule covers the control side. A contract test fails once the rule runs again.
export const A11Y_EXCLUDED = Object.freeze({
  'jsx-a11y/label-has-associated-control': 'throws under the workspace minimatch override',
});

// The `recommended` rules of eslint-plugin-jsx-a11y that the set enables, each at `error`.
export const A11Y_RULES = Object.freeze(
  Object.fromEntries(
    Object.entries(jsxA11y.flatConfigs.recommended.rules)
      .filter(([name, value]) => !isOff(value) && !(name in A11Y_EXCLUDED))
      .map(([name, value]) => [name, asError(value)])
  )
);

export const LOCAL_RULES = Object.freeze({
  'screen-contract/no-database-import': 'error',
  'screen-contract/exports-resolution': 'error',
  'screen-contract/layer-order': 'error',
  'screen-contract/no-adhoc-format': 'error',
  'screen-contract/consent-control-registered': 'error',
  'screen-contract/labelled-control': 'error',
});

export default [
  {
    files: [`apps/web/src/**/*.${SOURCES}`, `packages/*/src/**/*.${SOURCES}`],
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'jsx-a11y': jsxA11y, 'screen-contract': screenContract },
    settings: {
      'jsx-a11y': {
        components: {
          Input: 'input',
          Button: 'button',
          Label: 'label',
          Checkbox: 'input',
          Textarea: 'textarea',
        },
      },
    },
    rules: { ...A11Y_RULES, ...LOCAL_RULES },
  },
];
