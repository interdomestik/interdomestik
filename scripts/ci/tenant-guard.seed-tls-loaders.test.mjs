import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { KERNEL, PACKAGES, pinsOf, run } from './tenant-guard-test-support.mjs';
import { CONTRACTS } from './tenant-guard/contracts.mjs';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { evaluate } from './tenant-guard/rules.mjs';
import { collectUnits, parseSource, unitName } from './tenant-guard/syntax.mjs';

const RUNTIME = 'packages/database/src/runtime.ts';
const VERIFIER = 'packages/database/src/migration-callback-source-verifier.ts';
const LOADERS = {
  dynamic: "const path = './seed-target-tls'; import(path);",
  template: 'const name = "seed-target-tls"; import(`./${name}`);',
  requireVariable: "const path = './seed-target-tls'; require(path);",
  requireTemplate: 'const name = "seed-target-tls"; require(`./${name}`);',
  requireAlias: "const load = require; load('./seed-target-tls');",
  requireParentheses: "(require)('./seed-target-tls');",
  requireCall: "require.call(null, './seed-target-tls');",
  requireOptional: "require?.('./seed-target-tls');",
  createRequire:
    "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); load('./seed-target-tls');",
  createRequireAlias:
    "import { createRequire as makeLoader } from 'module'; const load = makeLoader(import.meta.url);",
  createRequireNamespace: "import * as mod from 'node:module'; mod.createRequire(import.meta.url);",
  createRequireComputed:
    "import * as mod from 'node:module'; mod['createRequire'](import.meta.url);",
  createRequireCarrier:
    "import { createRequire } from 'node:module'; const makeLoader = createRequire;",
  createRequireCommonJs:
    "const { createRequire } = require('node:module'); createRequire(import.meta.url);",
  createRequireDynamic:
    "const { createRequire } = await import('node:module'); createRequire(import.meta.url);",
  createRequireEquals: "import mod = require('node:module'); mod.createRequire(import.meta.url);",
};
function refused(result, file = RUNTIME) {
  assert.ok(
    result.violations.some(
      v => v.file === file && v.rule === 'R-e' && /database loader/u.test(v.detail)
    ),
    JSON.stringify(result.violations)
  );
}
for (const [form, source] of Object.entries(LOADERS)) {
  test(`computed database loader is refused: ${form}`, () => refused(run({ [RUNTIME]: source })));
}

test('literal loaders of ordinary database modules remain admitted', () => {
  assert.deepEqual(
    run({
      'packages/database/src/ordinary.ts': 'export const value = 1;',
      [RUNTIME]:
        "import('./ordinary'); require('./ordinary'); import ordinary = require('./ordinary');",
    }).violations,
    []
  );
});
test('a local function named require is not a Node loader', () => {
  assert.deepEqual(
    run({
      [RUNTIME]: 'function require(value: string) { return value; } const x = require; x("data");',
    }).violations,
    []
  );
});

function existingUnit(file, name) {
  const source = parseSource(file, readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
  return collectUnits(source)
    .find(unit => unitName(unit, source) === name)
    .getText(source);
}
const requireUnit = existingUnit(VERIFIER, 'requireFromHere');
const importUnit = existingUnit(VERIFIER, 'importModule');
const verifierSites = `import { createRequire } from 'node:module';\n${requireUnit}\n${existingUnit(VERIFIER, 'CALLBACK_SOURCE_OPS')}`;

function baseline(changes) {
  const sources = new Map(Object.entries({ ...KERNEL, ...changes }));
  const graph = createModuleGraph({ sources, packages: PACKAGES });
  return evaluate({
    sources,
    trusted: sources,
    graph,
    contracts: CONTRACTS.filter(
      contract =>
        contract.unit === 'loadOptionalSentry' &&
        changes[contract.file]?.includes('function loadOptionalSentry')
    ),
    legacyPins: pinsOf(sources),
  });
}

test('the two exact main migration verifier loader units stay admitted', () => {
  assert.deepEqual(baseline({ [VERIFIER]: verifierSites }).violations, []);
});
test('the existing db.ts loadOptionalSentry unit retains its source-bound eval admission', () => {
  const file = 'packages/database/src/db.ts';
  assert.deepEqual(
    baseline({ [file]: `${KERNEL[file]}\n${existingUnit(file, 'loadOptionalSentry')}` }).violations,
    []
  );
});
test('migration unit names do not grant loader permission in another file', () => {
  refused(run({ [RUNTIME]: verifierSites }));
});
test('another unit in the verifier file cannot acquire a computed loader', () => {
  refused(
    run({ [VERIFIER]: `${verifierSites}\nexport const runtime = (url: string) => import(url);` }),
    VERIFIER
  );
});
test('changing an admitted verifier unit voids its loader exception', () => {
  refused(
    run({ [VERIFIER]: verifierSites.replace('import(url)', "import(url + '/seed-target-tls')") }),
    VERIFIER
  );
});
test('a second loader inside an admitted verifier unit is refused', () => {
  refused(
    run({ [VERIFIER]: verifierSites.replace('import(url)', '(import(url), import(other))') }),
    VERIFIER
  );
});
test('new Function remains refused outside the exact existing Sentry contract', () => {
  for (const file of [RUNTIME, VERIFIER, 'packages/database/src/db.ts']) {
    const result = run({
      [file]: `${KERNEL[file] ?? ''}\nfunction loadOptionalSentry() { return new Function('x', 'return import(x)'); }`,
    });
    assert.ok(
      result.violations.some(v => v.file === file && v.rule === 'R-e' && /Function/u.test(v.detail))
    );
  }
});

for (const source of [
  "module.require('./seed-target-tls');",
  "globalThis.require('./seed-target-tls');",
  "globalThis['require']('./seed-target-tls');",
  "module.constructor._load('./seed-target-tls', module);",
  "process.getBuiltinModule('module').createRequire(import.meta.url)('./seed-target-tls');",
  "export * from 'node:module';",
]) {
  test(`indirect loader access is refused: ${source}`, () => refused(run({ [RUNTIME]: source })));
}

test('a second identical importModule property does not inherit the main site exemption', () => {
  refused(
    run({
      [VERIFIER]: `${verifierSites}\nconst another = { importModule: ${importUnit} }; another.importModule('./seed-target-tls');`,
    }),
    VERIFIER
  );
});
test('the main createRequire result cannot gain a new invocation or escape', () => {
  for (const use of ["requireFromHere('./seed-target-tls');", 'export { requireFromHere };']) {
    refused(run({ [VERIFIER]: `${verifierSites}\n${use}` }), VERIFIER);
  }
});

test('runtime cannot acquire the verifier computed-loader object through any module edge', () => {
  for (const statement of [
    "import { CALLBACK_SOURCE_OPS } from './migration-callback-source-verifier'; CALLBACK_SOURCE_OPS.importModule('./seed-target-tls');",
    "import * as verifier from './migration-callback-source-verifier'; verifier.CALLBACK_SOURCE_OPS.importModule('./seed-target-tls');",
    "export * from './migration-callback-source-verifier';",
    "import('./migration-callback-source-verifier');",
    "require('./migration-callback-source-verifier');",
  ])
    refused(run({ [VERIFIER]: verifierSites, [RUNTIME]: statement }));
});
test('the two checked migration verifier entry functions remain importable', () => {
  assert.deepEqual(
    run({
      [VERIFIER]: verifierSites,
      [RUNTIME]:
        "import { verifyMigrationCallbackSources, recheckMigrationCallbackSources } from './migration-callback-source-verifier';",
    }).violations,
    []
  );
});
test('the exact main verifier consumers retain their loader access', () => {
  assert.deepEqual(
    baseline({
      [VERIFIER]: `${verifierSites}\n${existingUnit(VERIFIER, 'resolveCallbackSource')}\n${existingUnit(VERIFIER, 'verifyMigrationCallbackSources')}`,
    }).violations,
    []
  );
});
test('changing the main verifier consumer cannot redirect the admitted loader', () => {
  refused(
    run({
      [VERIFIER]: `${verifierSites}\n${existingUnit(VERIFIER, 'verifyMigrationCallbackSources').replace('ops.importModule(urls[0])', "ops.importModule('./seed-target-tls')")}`,
    }),
    VERIFIER
  );
});
test('the admitted operations object cannot escape from a new verifier unit', () => {
  refused(
    run({ [VERIFIER]: `${verifierSites}\nexport const seed = CALLBACK_SOURCE_OPS;` }),
    VERIFIER
  );
});

for (const source of [
  "const key='require'; globalThis[key]('./seed-target-tls');",
  "module['requ'+'ire']('./seed-target-tls');",
  "const { require: load } = module; load('./seed-target-tls');",
  "const { require: load } = globalThis; load('./seed-target-tls');",
  "const key='getBuiltinModule'; process[key]('module');",
  "const p = process; p['getBuiltin'+'Module']('module');",
  "const p = globalThis.process; p['getBuiltin'+'Module']('module');",
  "import * as mod from 'node:module'; const key='createRequire'; mod[key](import.meta.url);",
]) {
  test(`computed or escaped loader global is refused: ${source}`, () =>
    refused(run({ [RUNTIME]: source })));
}

test('a shadowed Object.freeze cannot receive the admitted computed loader', () => {
  refused(
    run({
      [VERIFIER]: `const Object = { freeze: (ops: any) => { const load = Reflect.get(ops, 'import' + 'Module'); load('./seed-target-tls'); return ops; } };\n${verifierSites}`,
    }),
    VERIFIER
  );
});

test('new behavior in the loader-bearing operations object voids its exception', () => {
  const changed = verifierSites.replace(
    "noFollowFlag: typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0,",
    "get noFollowFlag() { const key = 'import' + 'Module'; const load = this[key]; load('./seed-target-tls'); return 1; },"
  );
  assert.notEqual(changed, verifierSites);
  refused(run({ [VERIFIER]: changed }), VERIFIER);
});

for (const source of [
  "import process from 'node:process'; const key='getBuiltinModule'; const mod=process[key]('module'); const make='createRequire'; mod[make](import.meta.url);",
  "import { getBuiltinModule as builtin } from 'node:process'; const mod=builtin('module'); const key='createRequire'; mod[key](import.meta.url);",
  "const { getBuiltinModule: builtin } = await import('node:process'); builtin('module');",
  "export * from 'node:process';",
]) {
  test(`imported process loader access is refused: ${source}`, () =>
    refused(run({ [RUNTIME]: source })));
}
