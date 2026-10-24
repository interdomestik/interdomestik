import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSourceModel } from './db-access-source.mjs';

test('external-module resolution retains aliases, local targets and the nearest package boundary', () => {
  const sources = new Map([
    [
      'apps/web/package.json',
      JSON.stringify({
        name: '@interdomestik/web',
        dependencies: { allowed: '1', '@scope/allowed': '1' },
        devDependencies: { development: '1' },
      }),
    ],
    [
      'apps/web/src/nested/package.json',
      JSON.stringify({
        name: '@interdomestik/nested',
        optionalDependencies: { 'nested-only': '1' },
      }),
    ],
    [
      'packages/example/package.json',
      JSON.stringify({ name: '@interdomestik/example', peerDependencies: { 'domain-only': '1' } }),
    ],
    ['apps/web/local/index.ts', 'export const local = 1;'],
    ['apps/web/src/page.ts', 'export {};'],
  ]);
  const model = createSourceModel(sources, sources);
  const web = 'apps/web/src/page.ts',
    nested = 'apps/web/src/nested/page.ts';
  for (const [name, from, expected] of [
    ['allowed', web, true],
    ['allowed/subpath', web, true],
    ['@scope/allowed/subpath', web, true],
    ['development', web, true],
    ['unknown', web, false],
    ['@scope/unknown', web, false],
    ['./allowed', web, false],
    ['@/allowed', web, false],
    ['#allowed', web, false],
    ['@interdomestik/example', web, false],
    ['local', web, false],
    ['node:fs', web, true],
    ['allowed', nested, false],
    ['nested-only', nested, true],
    ['nested-only', web, false],
    ['allowed', 'apps/web/src/nested-other/page.ts', true],
    ['domain-only', 'packages/example/src/file.ts', true],
    ['allowed', 'packages/example/src/file.ts', false],
    ['node:fs', 'unowned/file.ts', true],
    ['allowed', 'unowned/file.ts', false],
  ])
    assert.equal(model.externalModule(name, from), expected, `${name} from ${from}`);
});
