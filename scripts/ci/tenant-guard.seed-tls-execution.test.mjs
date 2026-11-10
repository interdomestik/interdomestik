import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { run } from './tenant-guard-test-support.mjs';

const RUNTIME = 'packages/database/src/runtime.ts';
const VERIFIER = 'packages/database/src/migration-callback-source-verifier.ts';
const verifier = readFileSync(new URL(`../../${VERIFIER}`, import.meta.url), 'utf8');
const FORMS = {
  globalConstructor: 'globalThis.constructor.constructor(code)();',
  globalConstructorComputed: "globalThis['constructor']['constructor'](code)();",
  functionAlias: 'const Build = Function; Build(code)();',
  functionGlobal: 'globalThis.Function(code)();',
  functionComputed: "globalThis['Function'](code)();",
  functionReflect: 'Reflect.construct(Function, [code])();',
  functionNew: 'new Function(code)();',
  evalAlias: 'const run = eval; run(code);',
  evalSequence: '(0, eval)(code);',
  evalGlobal: 'globalThis.eval(code);',
  evalComputed: "globalThis['eval'](code);",
  globalAlias: 'const root = globalThis; const Build = root.Function; Build(code)();',
  evalDirect: 'eval(code);',
};
for (const [form, source] of Object.entries(FORMS)) {
  test(`R2 opaque execution reference in database is refused: ${form}`, () => {
    assert.ok(
      run({ [RUNTIME]: source }).violations.some(
        v => v.file === RUNTIME && v.rule === 'R-e' && /database loader/u.test(v.detail)
      )
    );
  });
  test(`R2 verifier appended execution reference is refused: ${form}`, () => {
    assert.ok(
      run({ [VERIFIER]: `${verifier}\n${source}` }).violations.some(
        v => v.file === VERIFIER && v.rule === 'R-e' && /database loader/u.test(v.detail)
      )
    );
  });
}
for (const [form, source] of Object.entries({
  ...FORMS,
  computedImport: 'import(path);',
  computedTemplate: 'import(`./${path}`);',
  requireAlias: 'const load = require; load(path);',
  createRequire:
    "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url);",
})) {
  for (const importer of ['packages/database/src/runtime.ts', 'apps/web/src/route.ts']) {
    test(`R2 opaque test taint ${form} re-exported by ${importer}`, () => {
      const relative =
        importer === RUNTIME ? './handler.test' : '../../../packages/database/src/handler.test';
      const result = run({
        'packages/database/src/handler.test.ts': `${source}\nexport const handler = () => {};`,
        [importer]: `export { handler } from '${relative}';`,
      });
      assert.ok(
        result.violations.some(
          v => v.file === importer && v.rule === 'R-a' && /seed-only/u.test(v.detail)
        ),
        JSON.stringify(result.violations)
      );
    });
  }
}
test('R2 local shadowed execution names and plain member names stay admitted', () => {
  assert.deepEqual(
    run({
      [RUNTIME]:
        'const Function = (x: string) => x; const eval = Function; const object = { Function }; eval("data"); object.Function("data");',
    }).violations,
    []
  );
});
