import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from './tenant-guard-test-support.mjs';

const RUNTIME = 'packages/database/src/runtime.ts';
function refused(result, file = RUNTIME) {
  assert.ok(
    result.violations.some(
      v => v.file === file && v.rule === 'R-e' && /database loader/u.test(v.detail)
    ),
    JSON.stringify(result.violations)
  );
}

test('global state aliases admit named client properties and symbol-keyed state', () => {
  assert.deepEqual(
    run({
      [RUNTIME]: `const TARGET = Symbol.for('seed');
    const state = globalThis as typeof globalThis & { [TARGET]?: unknown };
    const second = state; second.queryClientAdmin = {};
    const value = state[TARGET]; Object.defineProperty(state, TARGET, { value });`,
    }).violations,
    []
  );
});
for (const use of [
  "state.require('./seed-target-tls');",
  "const key='require'; state[key]('./seed-target-tls');",
  "const {require: load}=state; load('./seed-target-tls');",
]) {
  test(`a cast global-state alias cannot supply a loader: ${use}`, () => {
    refused(run({ [RUNTIME]: `const state = globalThis as any; ${use}` }));
  });
}

for (const source of [
  'export const state = globalThis as any;',
  'const local = globalThis as any; export const state = local;',
  'export const state = process;',
]) {
  test(`a global alias cannot escape through an exported declaration: ${source}`, () => {
    const file = 'packages/database/src/state.ts';
    refused(
      run({
        [file]: source,
        [RUNTIME]:
          "import { state } from './state'; const key='require'; state[key]('./seed-target-tls');",
      }),
      file
    );
  });
}

for (const use of [
  'const value = Object.defineProperty(state, KEY, {value: 1}); value[key]();',
  'Object.defineProperty(state, KEY, {value: 1})[key]();',
  'export const value = Object.defineProperty(state, KEY, {value: 1});',
]) {
  test(`a symbol property definition cannot leak its global return: ${use}`, () => {
    refused(
      run({
        [RUNTIME]: `const KEY=Symbol.for('seed'); const state=globalThis as any; const key='require'; ${use}`,
      })
    );
  });
}

for (const root of ['process', 'globalThis']) {
  test(`valueOf cannot return the global loader receiver: ${root}`, () => {
    refused(
      run({
        [RUNTIME]: `const state=${root}; const target=state.valueOf(); const key='require'; target[key]('./seed-target-tls');`,
      })
    );
  });
}
