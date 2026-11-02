import assert from 'node:assert/strict';
import test from 'node:test';
import { PACKAGES, assertRefused, file, run } from './tenant-guard-test-support.mjs';

// Wildcard resolution must agree with the runtime resolvers (Node exports, tsconfig paths).
const ADMIN_READ = ['export const read = () => dbAdmin.select();'];

test('export patterns resolve as Node does: every target star takes the match; multi-star keys never match', async () => {
  const { packageCandidates } = await import('./tenant-guard/package-exports.mjs');
  const pkg = {
    dir: 'packages/x',
    exports: { './*': './src/*/entry-*.ts', './a*b*': './src/hidden.ts' },
  };
  assert.ok(packageCandidates(pkg, '/db').includes('packages/x/src/db/entry-db.ts'));
  assert.ok(!packageCandidates(pkg, '/a1b2').includes('packages/x/src/hidden.ts'));
});

test('wildcard substitution is literal: `$` sequences in a match cannot redirect resolution', async () => {
  const { packageCandidates } = await import('./tenant-guard/package-exports.mjs');
  const pkg = { dir: 'packages/x', exports: { './*': './src/*/entry-*.mjs' } };
  assert.ok(packageCandidates(pkg, '/$$').includes('packages/x/src/$$/entry-$$.mjs'));
  assert.ok(!packageCandidates(pkg, '/$$').includes('packages/x/src/$/entry-$.mjs'));
  // A benign `$` file next to the real `$$` target: the graph must reach the real one.
  const files = {
    'packages/database/src/$.ts': 'export const dbAdmin: any = {};\n',
    'packages/database/src/$$.ts': "export { dbAdmin } from './db';\n",
  };
  const packages = new Map(PACKAGES);
  packages.set('evil-db', {
    name: 'evil-db',
    dir: 'packages/database',
    exports: { './*': './src/*.ts' },
    main: null,
  });
  const resolution = {
    pathRules: [{ pattern: 'alias/*', targets: ['packages/database/src/*'] }],
    baseRoots: [],
  };
  for (const [specifier, options] of [
    ['alias/$$', { resolution }],
    ['evil-db/$$', { packages }],
  ]) {
    const result = run(
      { ...files, ...file([`import { dbAdmin } from '${specifier}';`, ...ADMIN_READ]) },
      options
    );
    assertRefused(result, 'R-a', /dbAdmin is not available to this file/u);
  }
});
