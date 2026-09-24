import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.turbo/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Existing oversized fixture: keep it linted without forcing an unrelated test split.
    files: ['packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/extras.test.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  }
);
