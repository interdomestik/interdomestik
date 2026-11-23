import nextPlugin from '@next/eslint-plugin-next';
import boundariesPlugin from 'eslint-plugin-boundaries';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import { dirname } from 'path';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'eslint.config.mjs',
      'coverage/**',
      'playwright-report/**',
      'debug-pdf.js',
      'debug-pdf-2.js',
      'inspect_pdf.js',
      'test_worker_setup.js',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'require', message: 'Use ES module imports to load application dependencies.' },
        { name: 'module', message: 'Use ES module imports to load application dependencies.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: ['node:module', 'module'].map(name => ({
            name,
            message: 'Use ES module imports to load application dependencies.',
          })),
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^(node:)?module$/]',
          message: 'Use named imports for Node module utilities.',
        },
        {
          selector:
            'ImportExpression > TemplateLiteral.source > TemplateElement[value.cooked=/^(node:)?module$/]',
          message: 'Use named imports for Node module utilities.',
        },
        {
          selector:
            'ImportExpression > TemplateLiteral.source > TemplateElement[value.cooked=/^node:/]',
          message: 'Load Node built-ins with static imports.',
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooksPlugin,
      boundaries: boundariesPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      'boundaries/include': ['**/*'],
      'boundaries/elements': [
        {
          type: 'app',
          mode: 'full',
          pattern: ['apps/web/**/*'],
        },
        {
          type: 'domain',
          mode: 'full',
          pattern: ['../../packages/domain-*/**/*'],
        },
        {
          type: 'shared',
          mode: 'full',
          pattern: ['../../packages/shared-*/**/*'],
        },
        {
          type: 'ui',
          mode: 'full',
          pattern: ['../../packages/ui/**/*'],
        },
        {
          type: 'database',
          mode: 'full',
          pattern: ['../../packages/database/**/*'],
        },
      ],
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/no-unescaped-entities': 'off',
      // Boundaries
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: 'app',
              allow: ['domain', 'shared', 'ui', 'database'],
            },
          ],
        },
      ],
      'boundaries/no-unknown': 'error',
    },
  },
  {
    files: ['next-env.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  }
);
