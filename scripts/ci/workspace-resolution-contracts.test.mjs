import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readTsconfig(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  const content = fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(content);
}

test('web Next.js config transpiles the domain-ai workspace package', async () => {
  const module = await import(pathToFileURL(path.join(rootDir, 'apps/web/next.config.mjs')).href);
  const nextConfig = module.default;

  assert.ok(Array.isArray(nextConfig.transpilePackages));
  assert.ok(nextConfig.transpilePackages.includes('@interdomestik/domain-ai'));
});

test('web tsconfig resolves domain-ai workspace sources', () => {
  const tsconfig = readTsconfig('apps/web/tsconfig.json');
  const paths = tsconfig.compilerOptions?.paths ?? {};
  const include = tsconfig.include ?? [];

  assert.deepEqual(paths['@interdomestik/domain-ai'], ['../../packages/domain-ai/src']);
  assert.deepEqual(paths['@interdomestik/domain-ai/*'], ['../../packages/domain-ai/src/*']);
  assert.ok(include.includes('../../packages/domain-ai/src/**/*.ts'));
});
