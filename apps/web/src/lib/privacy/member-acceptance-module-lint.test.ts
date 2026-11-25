// @vitest-environment node
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const eslint = new ESLint({
  cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  overrideConfig: { languageOptions: { parserOptions: { project: false } } },
});

it.each([
  ['require("node:fs");', '@typescript-eslint/no-require-imports'],
  [
    'import { createRequire as cr } from "node:module"; cr(import.meta.url);',
    'no-restricted-imports',
  ],
  ['import { createRequire as cr } from "module"; cr(import.meta.url);', 'no-restricted-imports'],
  [
    'import * as loader from "node:module"; loader.createRequire(import.meta.url);',
    'no-restricted-imports',
  ],
  ['void import("node:module");', 'no-restricted-syntax'],
  [
    'const { createRequire: load } = await import(`node:module`); void load(import.meta.url);',
    'no-restricted-syntax',
  ],
  ['void import(`module`);', 'no-restricted-syntax'],
  ["void import(`node:${'module'}`);", 'no-restricted-syntax'],
  [
    'import { Module } from "node:module"; Module.createRequire(import.meta.url);',
    'no-restricted-imports',
  ],
  ['import M from "module"; M.createRequire(import.meta.url);', 'no-restricted-imports'],
  ['const load = require; load("node:fs");', 'no-restricted-globals'],
  ['const load = module.require; load("node:fs");', 'no-restricted-globals'],
])('rejects %s under web src', async (source, ruleId) => {
  const [result] = await eslint.lintText(source, { filePath: 'src/module-loader-fixture.ts' });
  expect(result.fatalErrorCount).toBe(0);
  expect(result.messages).toContainEqual(expect.objectContaining({ ruleId, severity: 2 }));
});

it('permits the Tailwind plugin require in its configuration', async () => {
  const [result] = await eslint.lintFiles(['tailwind.config.js']);
  expect(result.errorCount).toBe(0);
});
