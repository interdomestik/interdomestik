import assert from 'node:assert/strict';
import path from 'node:path/posix';
import test from 'node:test';
import { KERNEL, run } from './tenant-guard-test-support.mjs';
import * as manifest from './tenant-guard/manifest.mjs';

const TLS = 'packages/database/src/seed-target-tls.ts';
const GUARD = 'packages/database/src/seed-target-guard.ts';
const CLOSURE = [
  TLS,
  GUARD,
  'packages/database/src/seed.ts',
  'packages/database/src/seed-assert.ts',
  'packages/database/src/seed-full/index.ts',
  'packages/database/src/seed-golden/index.ts',
  'packages/database/src/seed-golden.ts',
  'packages/database/src/seed-workload/index.ts',
  'packages/database/src/seed-packs/agent-pack.ts',
  'packages/database/src/seed-packs/ks-workflow-pack.ts',
];
const tlsSource =
  "import postgres from 'postgres'; export const installSeedTlsClients = () => postgres;";
const ordinarySource = 'export const installSeedTlsClients = () => {};';
const relative = (from, to) => {
  const specifier = path.relative(path.dirname(from), to).replace(/\.ts$/u, '');
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
};
const EDGES = {
  named: s => `import { installSeedTlsClients } from '${s}';`,
  namespace: s => `import * as seed from '${s}';`,
  sideEffect: s => `import '${s}';`,
  type: s => `import type { installSeedTlsClients } from '${s}';`,
  exportNamed: s => `export { installSeedTlsClients } from '${s}';`,
  exportStar: s => `export * from '${s}';`,
  exportNamespace: s => `export * as seed from '${s}';`,
  exportType: s => `export type { installSeedTlsClients } from '${s}';`,
  dynamic: s => `export const load = () => import('${s}');`,
  template: s => 'export const load = () => import(`' + s + '`);',
  require: s => `export const load = () => require('${s}');`,
  equals: s => `import seed = require('${s}');`,
  importType: s => `type Seed = typeof import('${s}');`,
};
function refused(result, file) {
  assert.ok(
    result.violations.some(v => v.file === file && v.rule === 'R-a' && /seed-only/u.test(v.detail)),
    JSON.stringify(result.violations)
  );
}

test('seed closure is the exact finite main importer set, with no unscanned pilot claims', () => {
  assert.deepEqual([...manifest.SEED_TLS_CLOSURE].sort(), [...CLOSURE].sort());
});

test('only the exact seed TLS module gains a driver admission', () => {
  assert.deepEqual(run({ [TLS]: tlsSource }).violations, []);
  const sibling = 'packages/database/src/seed-target-tls-extra.ts';
  assert.ok(
    run({ [sibling]: tlsSource }).violations.some(v => v.file === sibling && v.rule === 'R-d')
  );
});

for (const [form, edge] of Object.entries(EDGES)) {
  test(`closure files may import each other via ${form}`, () => {
    for (const from of CLOSURE) {
      for (const to of CLOSURE.filter(file => file !== from)) {
        assert.deepEqual(
          run({ [to]: ordinarySource, [from]: edge(relative(from, to)) }).violations,
          [],
          `${from} -> ${to}`
        );
      }
    }
  });
  for (const from of [
    'apps/web/src/attack.ts',
    'packages/database/src/runtime.ts',
    'packages/database/src/index.ts',
  ]) {
    test(`runtime ${form} ingress is refused for every closure member: ${from}`, () => {
      for (const to of CLOSURE) {
        refused(
          run({
            [to]: ordinarySource,
            [from]: `${KERNEL[from] ?? ''}\n${edge(relative(from, to))}`,
          }),
          from
        );
      }
    });
  }
  test(`tests may import every closure member via ${form}`, () => {
    const from = 'packages/database/test/seed.test.ts';
    for (const to of CLOSURE) {
      assert.deepEqual(
        run({ [to]: ordinarySource, [from]: edge(relative(from, to)) }).violations,
        []
      );
    }
  });
}

const FORWARDERS = {
  wrapper: 'export const runSeed = () => installSeedTlsClients();',
  value: 'export const runSeed = installSeedTlsClients;',
  object: 'export const runSeed = { install: installSeedTlsClients };',
  defaultObject: 'export default { install: installSeedTlsClients };',
  defaultAlias: 'const x = installSeedTlsClients; export default x;',
};
for (const [form, forwarding] of Object.entries(FORWARDERS)) {
  test(`Astra ${form} forwarding through the seed guard is refused`, () => {
    const file = 'apps/web/src/attack.ts';
    refused(
      run({
        [TLS]: tlsSource,
        [GUARD]: `import { installSeedTlsClients } from './seed-target-tls'; ${forwarding}`,
        [file]: "import { runSeed } from '@interdomestik/database/seed-target-guard'; runSeed();",
      }),
      file
    );
  });
}
test('Astra side-effect ingress is refused even without any exported seed capability', () => {
  const file = 'apps/web/src/attack.ts';
  refused(
    run({
      [TLS]: tlsSource,
      [GUARD]:
        "import { installSeedTlsClients } from './seed-target-tls'; installSeedTlsClients();",
      [file]: "import '@interdomestik/database/seed-target-guard';",
    }),
    file
  );
});

for (const spelling of [
  '@interdomestik/database/seed-target-guard',
  '../../../packages/database/src/seed-target-guard.js',
  'seed-alias',
]) {
  test(`resolver spelling cannot hide closure ingress: ${spelling}`, () => {
    const file = 'apps/web/src/attack.ts';
    refused(
      run(
        { [GUARD]: 'export {};', [file]: `import '${spelling}';` },
        {
          resolution: { pathRules: [{ pattern: 'seed-alias', targets: [GUARD] }], baseRoots: [] },
        }
      ),
      file
    );
  });
}

for (const [form, edge] of Object.entries(EDGES)) {
  test(`non-test ${form} ingress into a tainted test is refused`, () => {
    const file = 'packages/database/src/runtime.ts';
    refused(
      run({
        [TLS]: tlsSource,
        'packages/database/test/handler.test.ts':
          "import { installSeedTlsClients } from '../src/seed-target-tls'; export const GET = () => installSeedTlsClients();",
        [file]: edge('../test/handler.test'),
      }),
      file
    );
  });
  test(`test taint follows ${form} edges without export-origin assumptions`, () => {
    const file = 'apps/web/src/route.ts';
    refused(
      run({
        [TLS]: tlsSource,
        'apps/web/src/handler.test.ts': `${edge('@interdomestik/database/seed-target-tls')} export const GET = () => {};`,
        [file]: "export { GET } from './handler.test';",
      }),
      file
    );
  });
}

test('taint traverses test cycles, side effects and ordinary intermediate modules', () => {
  const a = 'packages/database/src/runtime-a.ts';
  const b = 'packages/database/src/runtime-b.ts';
  const result = run({
    [TLS]: tlsSource,
    'packages/database/test/a.test.ts': "import './b.test'; import '../src/bridge';",
    'packages/database/test/b.test.ts': "import './a.test';",
    'packages/database/src/bridge.ts': "import './seed-target-tls';",
    [a]: "export * from '../test/a.test';",
    [b]: "export * from '../test/b.test';",
  });
  refused(result, a);
  refused(result, b);
  refused(result, 'packages/database/src/bridge.ts');
});

test('unrelated test export cycles are not tainted by seed confinement', () => {
  assert.deepEqual(
    run({
      'packages/database/test/a.test.ts': "export * from './b.test';",
      'packages/database/test/b.test.ts': "export * from './a.test';",
      'packages/database/src/runtime.ts': "export * from '../test/a.test';",
    }).violations,
    []
  );
});

for (const spelling of [
  './seed-target-tls.ts?seed=1',
  './seed-target-tls.ts#seed',
  './%73eed-target-tls.ts',
  './seed-target%2Dtls.ts',
  'file:///workspace/packages/database/src/seed-target-tls.ts',
]) {
  test(`URL module spelling cannot hide seed ingress: ${spelling}`, () => {
    const file = 'packages/database/src/runtime.ts';
    refused(run({ [TLS]: tlsSource, [file]: `import '${spelling}';` }), file);
    refused(run({ [TLS]: tlsSource, [file]: `import('${spelling}');` }), file);
  });
}
for (const body of [
  "export const load = () => import(('../src/seed-target-tls'));",
  "const p = '../src/seed-target-tls'; export const load = () => import(p);",
  "const load = require; export const run = () => load('../src/seed-target-tls');",
]) {
  test(`runtime cannot enter a test with an opaque module edge: ${body}`, () => {
    const file = 'packages/database/src/runtime.ts';
    refused(
      run({
        [TLS]: tlsSource,
        'packages/database/test/helper.test.ts': body,
        [file]: "export * from '../test/helper.test';",
      }),
      file
    );
  });
}

for (const source of [
  "import { createRequire } from 'node:module'; const load=createRequire(import.meta.url); export const run=()=>load('../src/seed-target-tls');",
  "const { createRequire } = await import('node:module'); const load=createRequire(import.meta.url);",
  "const { createRequire } = require('module'); const load=createRequire(import.meta.url);",
  "import mod = require('node:module'); mod.createRequire(import.meta.url);",
]) {
  test(`a test using Node module loaders is conservatively tainted: ${source}`, () => {
    const file = 'packages/database/src/runtime.ts';
    refused(
      run({
        [TLS]: tlsSource,
        'packages/database/test/helper.test.ts': source,
        [file]: "export * from '../test/helper.test';",
      }),
      file
    );
  });
}
for (const specifier of [
  'FILE:///workspace/packages/database/src/seed-target-tls.ts',
  'data:text/javascript,import("./seed-target-tls")',
]) {
  test(`unsupported URL scheme is refused: ${specifier}`, () => {
    const file = 'packages/database/src/runtime.ts';
    refused(run({ [TLS]: tlsSource, [file]: `import('${specifier}');` }), file);
  });
}

test('a test importing a process loader is conservatively tainted', () => {
  const file = 'packages/database/src/runtime.ts';
  refused(
    run({
      'packages/database/test/helper.test.ts':
        "import { getBuiltinModule as builtin } from 'node:process'; export const load=builtin('module');",
      [file]: "export * from '../test/helper.test';",
    }),
    file
  );
});
