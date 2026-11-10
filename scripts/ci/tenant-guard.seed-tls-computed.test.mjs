import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { run } from './tenant-guard-test-support.mjs';
import { APP, refused, repositoryFixture, RUNTIME } from './tenant-guard-seed-tls-test-support.mjs';

const COMPUTED = {
  importConcat: "import('../packages/database/src/seed-target-' + 'tls.ts');",
  importVariable: "const target = '../packages/database/src/seed-target-tls.ts'; import(target);",
  importTemplate: 'const name = "tls"; import(`../packages/database/src/seed-target-${name}.ts`);',
  require: "require('../packages/database/src/seed-target-' + 'tls.ts');",
  resolve: "require.resolve('../packages/database/src/seed-target-' + 'tls.ts');",
  requireAlias: "const load = require; const target = 'seed'; load(target);",
  requireAssigned: 'let load; load = require; load(target);',
  requireReassigned: "let load = require('node:module'); load = require; load(target);",
  resolveAlias: 'const resolve = require.resolve; resolve(target);',
  createRequire:
    "import { createRequire } from 'node:module'; createRequire(import.meta.url)(target);",
  createRequireAlias:
    "import { createRequire as make } from 'module'; const load = make(import.meta.url); load(target);",
  createRequireNamespace:
    "import * as mod from 'node:module'; mod.createRequire(import.meta.url)(target);",
  createRequireAwait:
    "const { createRequire } = await import('node:module'); createRequire(import.meta.url)(target);",
  createRequireDestructured:
    "const { createRequire: make } = require('node:module'); make(import.meta.url)(target);",
};

for (const [form, source] of Object.entries(COMPUTED)) {
  test(`R3 web root refuses nonliteral ${form} as R-a`, () => {
    const file = 'apps/web/instrumentation.ts';
    const rootSource = source.replaceAll('../packages/', '../../packages/');
    refused(repositoryFixture({ [file]: rootSource }), file);
  });
  test(`R3 on-demand bridge refuses nonliteral ${form} at its runtime re-export`, () => {
    const bridge = 'scripts/seed-bridge.ts';
    const result = repositoryFixture(
      {
        [bridge]: source,
        [RUNTIME]: "export * from '../../../scripts/seed-bridge';",
      },
      ({ sources }) => assert.ok(!sources.has(bridge))
    );
    refused(result, RUNTIME);
  });
}

test('R3 uncollected computed require taints an app importer across a cycle', () => {
  refused(
    repositoryFixture({
      'scripts/a.ts': "export * from './b';",
      'scripts/b.ts': "export * from './a'; require(target);",
      [APP]: "import '../../../scripts/a';",
    }),
    APP
  );
});

test('R3 literal root loaders, including no-substitution templates, remain admitted', () => {
  assert.deepEqual(
    repositoryFixture({
      'apps/web/tailwind.config.js':
        "module.exports = { plugins: [require('tailwindcss-animate')] };",
      'apps/web/instrumentation.ts': [
        "import('ordinary'); require.resolve('ordinary');",
        'import(`ordinary`); require(`ordinary`);',
        "const load = require; load('ordinary');",
        "import { createRequire } from 'node:module'; createRequire(import.meta.url)('ordinary');",
      ].join('\n'),
    }).violations,
    []
  );
});

test('R3 local functions called require are not treated as Node loaders', () => {
  assert.deepEqual(
    repositoryFixture({
      'scripts/ordinary.ts': 'function require(target) { return target; } require(value);',
      [RUNTIME]: "export * from '../../../scripts/ordinary';",
    }).violations,
    []
  );
});

for (const file of [APP, RUNTIME]) {
  test(`R3 collected-root computed loader policy is unchanged in ${file}`, () => {
    const source = 'import(target); require(target); require.resolve(target);';
    assert.deepEqual(
      repositoryFixture({ [file]: source }).violations,
      run({ [file]: source }).violations
    );
  });
}

test('R3 current web root files remain at zero violations', () => {
  const dir = new URL('../../apps/web/', import.meta.url);
  const files = Object.fromEntries(
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.[cm]?[jt]sx?$/u.test(entry.name))
      .map(entry => [`apps/web/${entry.name}`, fs.readFileSync(new URL(entry.name, dir), 'utf8')])
  );
  assert.deepEqual(repositoryFixture(files).violations, []);
});

// Generated output under collected roots is not in the collected source set, so neither the
// existing R-e/L1 checks nor a directory prefix may exempt it (PR #2043 review, P2).
for (const bridge of [
  'packages/example/dist/bridge.js',
  'packages/database/build/bridge.mjs',
  'apps/web/src/.next/bridge.js',
]) {
  test(`R3 uncollected generated bridge ${bridge} refuses a computed import`, () => {
    const depth = bridge.split('/').length - 1;
    const target = `${'../'.repeat(depth)}packages/database/src/seed-target-tls.ts`;
    const result = repositoryFixture(
      {
        [bridge]: `const target = '${target}'; import(target);`,
        [APP]: `import '${'../'.repeat(APP.split('/').length - 1)}${bridge}';`,
      },
      ({ sources }) => assert.ok(!sources.has(bridge))
    );
    refused(result, APP);
  });
}
