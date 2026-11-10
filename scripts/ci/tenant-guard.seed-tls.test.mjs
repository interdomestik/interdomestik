import assert from 'node:assert/strict';
import path from 'node:path/posix';
import test from 'node:test';
import { KERNEL, run } from './tenant-guard-test-support.mjs';

const TLS = 'packages/database/src/seed-target-tls.ts';
const SEED_IMPORTERS = [
  'packages/database/src/seed-target-guard.ts',
  'scripts/pilot/import-pilot-database.ts',
  'scripts/pilot/day1_multi_seeder.ts',
];
const tlsSource =
  "import postgres from 'postgres';\nexport const installSeedTlsClients = () => postgres;\n";
const specifierFrom = file => {
  const relative = path.relative(path.dirname(file), TLS).replace(/\.ts$/u, '');
  return relative.startsWith('.') ? relative : `./${relative}`;
};
const IMPORTS = {
  named: specifier => `import { installSeedTlsClients } from '${specifier}';`,
  namespace: specifier => `import * as seedTls from '${specifier}';`,
  effect: specifier => `import '${specifier}';`,
  dynamic: specifier => `export const load = () => import('${specifier}');`,
  require: specifier => `export const load = () => require('${specifier}');`,
  equals: specifier => `import seedTls = require('${specifier}');`,
  type: specifier => `import type { installSeedTlsClients } from '${specifier}';`,
};
const REEXPORTS = {
  named: specifier => `export { installSeedTlsClients } from '${specifier}';`,
  star: specifier => `export * from '${specifier}';`,
  namespace: specifier => `export * as seedTls from '${specifier}';`,
  type: specifier => `export type { installSeedTlsClients } from '${specifier}';`,
  local: specifier =>
    `import { installSeedTlsClients } from '${specifier}'; export { installSeedTlsClients };`,
  alias: specifier =>
    `import { installSeedTlsClients as install } from '${specifier}'; export { install as seed };`,
  localNamespace: specifier => `import * as seedTls from '${specifier}'; export { seedTls };`,
  default: specifier =>
    `import { installSeedTlsClients } from '${specifier}'; export default installSeedTlsClients;`,
};

test('only the exact seed TLS module gains a driver admission', () => {
  assert.deepEqual(run({ [TLS]: tlsSource }).violations, []);
  const sibling = 'packages/database/src/seed-target-tls-extra.ts';
  const result = run({ [sibling]: tlsSource });
  assert.ok(result.violations.some(v => v.file === sibling && v.rule === 'R-d'));
});

for (const file of [...SEED_IMPORTERS, 'packages/database/test/seed-target-tls.test.ts']) {
  for (const [form, statement] of Object.entries(IMPORTS)) {
    // CommonJS import-equals is independently refused by L1, even for an approved seed caller.
    if (form === 'equals') continue;
    test(`seed TLS ${form} import is admitted from ${file}`, () => {
      const result = run({ [TLS]: tlsSource, [file]: statement(specifierFrom(file)) });
      assert.deepEqual(result.violations, []);
    });
  }
}

for (const file of [
  'apps/web/src/attack.ts',
  'packages/database/src/index.ts',
  'packages/database/src/runtime.ts',
  'packages/domain-claims/src/attack.ts',
  'packages/database/src/seed-target-guard-extra.ts',
  'scripts/pilot/unapproved-seeder.ts',
]) {
  for (const [form, statement] of Object.entries(IMPORTS)) {
    test(`seed TLS ${form} import is refused from ${file}`, () => {
      const result = run({
        [TLS]: tlsSource,
        [file]: `${KERNEL[file] ?? ''}\n${statement(specifierFrom(file))}`,
      });
      assert.ok(
        result.violations.some(
          v => v.file === file && v.rule === 'R-a' && /seed-only module/u.test(v.detail)
        ),
        JSON.stringify(result.violations)
      );
    });
  }
}

for (const file of ['packages/database/src/index.ts', ...SEED_IMPORTERS]) {
  for (const [form, statement] of Object.entries(REEXPORTS)) {
    test(`seed TLS ${form} re-export is refused from ${file}`, () => {
      const result = run({
        [TLS]: tlsSource,
        [file]: `${KERNEL[file] ?? ''}\n${statement(specifierFrom(file))}`,
      });
      assert.ok(
        result.violations.some(
          v =>
            v.file === file && v.rule === 'R-a' && /re-export of seed-only module/u.test(v.detail)
        ),
        JSON.stringify(result.violations)
      );
    });
  }
}

test('a resolver alias cannot hide a runtime import of seed TLS', () => {
  const result = run(
    { [TLS]: tlsSource, 'apps/web/src/attack.ts': "import 'seed-tls-alias';" },
    { resolution: { pathRules: [{ pattern: 'seed-tls-alias', targets: [TLS] }], baseRoots: [] } }
  );
  assert.ok(result.violations.some(v => v.rule === 'R-a' && /seed-only module/u.test(v.detail)));
});

for (const form of ['named', 'star', 'namespace']) {
  for (const [file, statement] of [
    ['packages/database/src/runtime.ts', IMPORTS.dynamic],
    ['packages/database/src/runtime.ts', IMPORTS.require],
    ['packages/database/src/index.ts', REEXPORTS.star],
  ]) {
    test(`runtime code cannot reach seed TLS through a test ${form} re-export: ${statement.name}`, () => {
      const result = run({
        [TLS]: tlsSource,
        'packages/database/test/tls.test.ts': REEXPORTS[form]('../src/seed-target-tls'),
        [file]: `${KERNEL[file] ?? ''}\n${statement('../test/tls.test')}`,
      });
      assert.ok(
        result.violations.some(
          v => v.file === file && v.rule === 'R-a' && /seed-only module/u.test(v.detail)
        ),
        JSON.stringify(result.violations)
      );
    });
  }
}

test('nested test namespace forwarding is refused even when its export graph has a cycle', () => {
  const result = run({
    [TLS]: tlsSource,
    'packages/database/test/tls.test.ts': "export * from '../src/seed-target-tls';",
    'packages/database/test/wrapper.test.ts':
      "export * as seed from './tls.test'; export * as cycle from './cycle.test';",
    'packages/database/test/cycle.test.ts': "export * as back from './wrapper.test';",
    'packages/database/src/runtime.ts': "export const load = () => import('../test/wrapper.test');",
  });
  assert.ok(
    result.violations.some(
      v => v.file === 'packages/database/src/runtime.ts' && /seed-only module/u.test(v.detail)
    ),
    JSON.stringify(result.violations)
  );
});

test('an unrelated namespace export cycle is unaffected by the seed-only restriction', () => {
  const result = run({
    'packages/database/src/cycle-a.ts': "export * as b from './cycle-b';",
    'packages/database/src/cycle-b.ts': "export * as a from './cycle-a';",
    'packages/database/src/runtime.ts': "export const load = () => import('./cycle-a');",
  });
  assert.deepEqual(result.violations, []);
});
