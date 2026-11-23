// The bundler closure binds each executable Next config and its local imports by raw bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as bundlerCases from './tenant-guard-bundler-test-cases.mjs';
import { recordFor } from './tenant-guard-schema-test-support.mjs';
import { bundlerCheckoutProblem } from './tenant-guard/bundler-checkout.mjs';
import { bundlerClosure } from './tenant-guard/bundler-closure.mjs';
import {
  resolverCandidateProblem,
  resolverPair,
  resolverRecordProblem,
} from './tenant-guard/rules-resolver-state.mjs';
import { sha256 } from './tenant-guard/rules-digest.mjs';
import { schemaTreeFromBlobs } from './tenant-guard/sources.mjs';

const NEXT = 'apps/web/next.config.mjs';
const HELPER = 'apps/web/src/lib/helper.mjs';
const MANIFEST = 'apps/web/package.json';
const SCOPE = { name: '@interdomestik/web', exports: null, imports: null, type: null };
const nextConfig = (extra = '') =>
  "import plugin from 'next-intl/plugin';\n" +
  "import { helper } from './src/lib/helper.mjs';\n" +
  `${extra}export default { env: { A: process.env.A ?? helper } };\n`;
const fixture = {
  [MANIFEST]: JSON.stringify({ name: '@interdomestik/web' }),
  [NEXT]: nextConfig(),
  [HELPER]: 'export const helper = 1;\n',
};

function image(changes = {}, extraListing = []) {
  const blobs = new Map(
    Object.entries({ ...fixture, ...changes }).filter(([, text]) => text !== null)
  );
  const files = new Map([...blobs.keys()].map(file => [file, { mode: '100644', kind: 'blob' }]));
  for (const file of extraListing) files.set(file, { mode: '100644', kind: 'blob' });
  return schemaTreeFromBlobs(blobs, files);
}
const closure = (changes, extra) => bundlerClosure(image(changes, extra));
const refuses = (changes, pattern, extra) => {
  const result = closure(changes, extra);
  assert.equal(result.value, undefined, JSON.stringify(result.value));
  assert.match(result.reason, pattern);
};

test('the closure binds bytes, exact import targets, externals and package scopes', () => {
  assert.deepEqual(closure().value, {
    files: [
      [NEXT, sha256(fixture[NEXT])],
      [HELPER, sha256(fixture[HELPER])],
    ],
    edges: [
      [NEXT, './src/lib/helper.mjs', HELPER],
      [NEXT, 'next-intl/plugin', 'external:next-intl/plugin'],
    ],
    externals: ['next-intl/plugin'],
    scopes: [
      [NEXT, MANIFEST, SCOPE],
      [HELPER, MANIFEST, SCOPE],
    ],
  });
});

test('a tree without a bundler config has an empty closure', () => {
  assert.deepEqual(closure({ [NEXT]: null, [HELPER]: null }).value, {
    files: [],
    edges: [],
    externals: [],
    scopes: [],
  });
});

test('one byte anywhere in the closure, a new or a deleted config changes the value', () => {
  const before = closure().value;
  for (const changes of [
    { [HELPER]: 'export const helper = 2;\n' },
    { [NEXT]: `${fixture[NEXT]} ` },
    { [NEXT]: null },
    { 'packages/ui/next.config.mjs': 'export default {};\n' },
    { 'next.config.mjs': 'export default {};\n' },
  ]) {
    const { value, reason } = closure(changes);
    assert.notEqual(value, undefined, reason);
    assert.notDeepEqual(value, before, JSON.stringify(changes));
  }
});

test('swapping the config import bindings changes B even with identical helpers', () => {
  const config = (x, y) =>
    `import x from './${x}.mjs'; import y from './${y}.mjs'; export default [x, y];`;
  const a = 'apps/web/a.mjs';
  const b = 'apps/web/b.mjs';
  const helpers = { [a]: 'export default 1;', [b]: 'export default 1;' };
  const before = closure({ ...helpers, [NEXT]: config('a', 'b') }).value;
  const after = closure({ ...helpers, [NEXT]: config('b', 'a') }).value;
  assert.deepEqual(before.edges, [
    [NEXT, './a.mjs', a],
    [NEXT, './b.mjs', b],
  ]);
  assert.deepEqual(after.edges, before.edges);
  assert.deepEqual(after.files.slice(0, 2), before.files.slice(0, 2));
  assert.notDeepEqual(after.files.at(-1), before.files.at(-1));
  assert.notDeepEqual(after, before);
});

test('swapping identical targets between two importers changes the edge triples', () => {
  const a = 'apps/web/a.mjs';
  const b = 'apps/web/b.mjs';
  const x = 'apps/web/x.mjs';
  const y = 'apps/web/y.mjs';
  const common = {
    [NEXT]: "import './x.mjs'; import './y.mjs'; export default {};",
    [a]: 'export default 1;',
    [b]: 'export default 1;',
  };
  const localEdges = (left, right) =>
    closure({
      ...common,
      [x]: `import './${left}.mjs';`,
      [y]: `import './${right}.mjs';`,
    }).value.edges.filter(([importer]) => importer !== NEXT);
  assert.deepEqual(localEdges('a', 'b'), [
    [x, './a.mjs', a],
    [y, './b.mjs', b],
  ]);
  assert.deepEqual(localEdges('b', 'a'), [
    [x, './b.mjs', b],
    [y, './a.mjs', a],
  ]);
});

test('two imports of the same specifier produce one edge and a valid record', () => {
  const baseline = resolverPair(image({ [NEXT]: nextConfig("import 'next-intl/plugin';\n") }));
  assert.deepEqual(baseline.bundler.edges, [
    [NEXT, './src/lib/helper.mjs', HELPER],
    [NEXT, 'next-intl/plugin', 'external:next-intl/plugin'],
  ]);
  assert.equal(resolverRecordProblem({ baseline, successor: null }), null);
});

for (const [label, extra, pattern] of bundlerCases.grammarRefusals) {
  test(`the closed grammar refuses ${label}`, () =>
    refuses({ [NEXT]: nextConfig(extra), 'apps/web/data.mjs': 'export default 1;\n' }, pattern));
}

test('the grammar applies to every closure file, not only the config', () => {
  refuses(
    { [HELPER]: "export const helper = require('x');\n" },
    /loader reference require in apps\/web\/src\/lib\/helper\.mjs/u
  );
});

for (const [label, code] of bundlerCases.grammarAdmissions) {
  test(`the closed grammar admits ${label}`, () => {
    const { value, reason } = closure({ [NEXT]: code });
    assert.ok(value, reason);
  });
}

for (const [label, specifier, pattern] of bundlerCases.externalRefusals) {
  test(`an external edge refuses ${label}`, () =>
    refuses({ [NEXT]: `import x from '${specifier}';\n${nextConfig()}` }, pattern));
}

test('a tsconfig path rule that matches a bare specifier refuses it', () =>
  refuses(
    {
      'apps/web/tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { 'next-intl/*': ['./src/lib/*'] } },
      }),
    },
    /path rule matches next-intl\/plugin/u
  ));

for (const [label, specifier, pattern] of bundlerCases.localRefusals) {
  test(`a local edge refuses ${label}`, () =>
    refuses({ [NEXT]: `import '${specifier}';\n${nextConfig()}` }, pattern));
}

test('a config root that is not an ES module, or not canonically spelled, refuses', () => {
  refuses({ 'apps/web/next.config.ts': 'export default {};\n' }, /non-module closure file/u);
  refuses({ 'apps/web/Next.config.mjs': 'export default {};\n' }, /non-canonical config/u);
});

test('an unparseable closure file refuses', () =>
  refuses({ [HELPER]: 'export const = ;\n' }, /unparseable closure file/u));

test('a closure file must also parse as a Node ES module', () => {
  for (const text of ['export default {}; return;', 'with (a) {}\nexport default {};'])
    refuses({ [NEXT]: text }, /invalid ES module apps\/web\/next\.config\.mjs/u);
  refuses(
    { [NEXT]: '<!-- x\nexport default {};' },
    /unparseable closure file apps\/web\/next\.config\.mjs/u
  );
});

test('roots and local targets under generated directories refuse regardless of case', () => {
  for (const dir of ['apps/build', 'apps/Build', 'Apps/Build', 'packages/Dist']) {
    const root = `${dir}/next.config.mjs`;
    refuses(
      { [root]: 'export default {};\n' },
      new RegExp(`bundler config under a generated directory ${root}`, 'u')
    );
  }
  refuses(
    { [NEXT]: "import './dist/helper.mjs';\n", 'apps/web/dist/helper.mjs': fixture[HELPER] },
    /bundler config under a generated directory apps\/web\/dist\/helper\.mjs/u
  );
});

test('a case-fold collision on any prefix of a closure file refuses', () => {
  refuses({}, /case-fold collision apps\/web\/src\/Lib/u, ['apps/web/src/Lib/PACKAGE.JSON']);
  refuses({}, /case-fold collision/u, ['apps/web/src/lib/Helper.mjs']);
  refuses({}, /case-fold collision/u, ['Apps/x.txt']);
});

test('a non-canonical package.json or node_modules beside an ancestor refuses', () => {
  refuses({}, /non-canonical package\.json apps\/web\/src\/lib\/PACKAGE\.JSON/u, [
    'apps/web/src/lib/PACKAGE.JSON',
  ]);
  refuses({}, /non-canonical node_modules apps\/Node_Modules/u, ['apps/Node_Modules/x/index.js']);
  refuses({}, /non-canonical package\.json apps\/web\/PACKAGE\.JSON/u, ['apps/web/PACKAGE.JSON']);
});

test('path folding lowercases ASCII letters only', () => {
  const file = 'apps/web/K.mjs';
  const result = closure({ [NEXT]: "import './K.mjs';", [file]: 'export default 1;' }, [
    'apps/web/K.mjs',
  ]);
  assert.deepEqual(result.value?.edges, [[NEXT, './K.mjs', file]], result.reason);
});

test('a tracked node_modules above a closure file refuses', () =>
  refuses({}, /tracked node_modules above/u, ['apps/web/node_modules/next-intl/plugin.js']));

test('a nested manifest is bound as the scope and a self-reference refuses', () => {
  const nested = 'apps/web/src/lib/package.json';
  const scoped = closure({ [nested]: JSON.stringify({ name: 'helpers', type: 'module' }) }).value;
  assert.deepEqual(scoped.scopes[1], [
    HELPER,
    nested,
    { name: 'helpers', exports: null, imports: null, type: 'module' },
  ]);
  refuses(
    {
      [nested]: JSON.stringify({ name: 'next-intl', exports: { './plugin': './helper.mjs' } }),
      [HELPER]: "import plugin from 'next-intl/plugin';\nexport const helper = plugin;\n",
    },
    /self-reference next-intl\/plugin/u
  );
  refuses({ [nested]: '{' }, /unparseable package scope/u);
});

test('checkout binds raw bytes and rejects symlinks and checkout-only configs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundler-checkout-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const helper = 'tools/config-helper.mjs';
  const docs = 'apps/web/next.config.md';
  const text = 'export const value = 1;\n';
  const candidate = image({
    [NEXT]: "import '../../tools/config-helper.mjs';\nexport default {};\n",
    [helper]: text,
    [docs]: '# Bundler configuration\n',
  });
  const base = image();
  assert.equal(resolverCandidateProblem(base, candidate, recordFor(base, candidate)), null);
  const write = (file, text) => {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  };
  write(NEXT, candidate.blobs.get(NEXT));
  write(helper, text);
  write(docs, candidate.blobs.get(docs));
  assert.equal(bundlerCheckoutProblem(root, candidate), null);
  assert.equal(candidate.sources.has(helper), false);
  assert.equal(candidate.inputs.has(helper), false);
  write(helper, text.replaceAll('\n', '\r\n'));
  const mismatch = `candidate: checkout differs from merge blob ${helper}`;
  assert.equal(bundlerCheckoutProblem(root, candidate), mismatch);
  fs.unlinkSync(path.join(root, helper));
  write('tools/alternate.mjs', text);
  fs.symlinkSync('alternate.mjs', path.join(root, helper));
  assert.equal(bundlerCheckoutProblem(root, candidate), mismatch);
  fs.unlinkSync(path.join(root, helper));
  assert.equal(bundlerCheckoutProblem(root, candidate), mismatch);
  write(helper, text);
  for (const file of ['apps/web/next.config.ts', 'apps/web/next.config.cjs', 'NEXT.Config.cjs']) {
    write(file, 'export default {};\n');
    assert.equal(
      bundlerCheckoutProblem(root, candidate),
      `candidate: checkout bundler config not in the merge tree ${file}`
    );
    fs.unlinkSync(path.join(root, file));
  }
});
