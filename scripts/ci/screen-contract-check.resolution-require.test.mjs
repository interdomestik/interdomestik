import assert from 'node:assert/strict';
import test from 'node:test';

import { lint, tree } from './fixtures/screen-contract-check/harness.mjs';
import { W } from './fixtures/screen-contract-check/resolution-fixtures.mjs';

const screen = `${W}/components/f.tsx`;
const lintWith = (t, rel, body) => lint(tree(t, { [rel]: body }));
const refused = /loads a module by .*, a request D-1 does not model; .*scanner PR first/u;

const assertRefused = (t, rel, body, request = body) =>
  assert.rejects(
    lintWith(t, rel, body),
    error =>
      refused.test(error.message) &&
      error.message.startsWith(`${rel} loads a module by ${request},`),
    body
  );

test('D-1: value requests for the module builtin are refused at the source', async t => {
  const aliased = "import { createRequire as makeRequire } from 'node:module';";
  const namespace = "import * as nm from 'node:module';";
  for (const [body, request] of [
    [
      `${aliased} const load = makeRequire(import.meta.url); load('@interdomestik/database');`,
      aliased,
    ],
    ["import { createRequire as m } from 'node:module';"],
    [namespace],
    ["import nm from 'module';"],
    ["import { type Module, createRequire as m } from 'node:module';"],
    ["export { createRequire as m } from 'node:module';"],
    ["export * from 'module';"],
    ["const nm = await import('node:module');", "import('node:module')"],
    ["const nm = require('node:module');", "require('node:module')"],
    ["const nm = module.require('node:module');", "module.require('node:module')"],
    ["import nm = require('node:module');"],
    [`${namespace} const key = 'createRequire'; nm[key](import.meta.url);`, namespace],
    [
      `${namespace} const key = 'createRequire'; const { [key]: f } = nm; f(import.meta.url);`,
      namespace,
    ],
  ])
    await assertRefused(t, screen, body, request);
});

test('D-1: other loader entry points are refused through member access', async t => {
  for (const [body, request] of [
    ["process.getBuiltinModule('node:module');", 'process.getBuiltinModule'],
    ["process.mainModule.require('x');", 'process.mainModule'],
    ["const get = proc['getBuiltinModule'];", "proc['getBuiltinModule']"],
    ["const main = proc['mainModule'];", "proc['mainModule']"],
    ["mod['createRequire'](import.meta.url);", "mod['createRequire'](import.meta.url)"],
    // A member of the CommonJS `module` other than `exports` reaches its loader.
    ["const k = 'createRequire'; module.constructor[k](import.meta.url);", 'module.constructor'],
    ['const id = module.id;', 'module.id'],
  ])
    await assertRefused(t, screen, body, request);
});

test('D-1: type-only module edges and createRequire data reads are accepted', async t => {
  for (const body of [
    "import type { createRequire as F } from 'node:module';",
    "import { type createRequire as F } from 'node:module';",
    "export type { createRequire as F } from 'node:module';",
    "export { type createRequire as F } from 'node:module';",
    "import type nm = require('node:module');",
    "type Factory = typeof import('node:module').createRequire;",
    'const enabled = settings.createRequire;',
    "const createRequire = 'enabled'; const v = settings[createRequire];",
    "vi.mock('node:module', () => ({ createRequire: vi.fn() }));",
  ])
    assert.ok(await lintWith(t, screen, body), body);
  const jsDoc = [
    "/** @import { createRequire as F } from 'node:module' */",
    "/** @type {typeof import('node:module').createRequire} */",
    'let factory;',
  ].join('\n');
  assert.ok(await lintWith(t, `${W}/components/f.js`, jsDoc));
});

test('D-1: the reviewed module import and createRequire call require exact file and text', async t => {
  const reviewedFile = 'packages/database/src/migration-callback-source-verifier.ts';
  const importText = "import { createRequire } from 'node:module';";
  const callText = 'createRequire(import.meta.url)';
  const reviewed = `${importText}\nconst requireFromHere = ${callText};`;
  assert.ok(await lintWith(t, reviewedFile, reviewed));
  await assertRefused(t, screen, importText);
  const editedImport = importText.replace(' }', '  }');
  await assertRefused(t, reviewedFile, reviewed.replace(importText, editedImport), editedImport);
  const editedCall = callText.replace('import.meta.url', ' import.meta.url ');
  await assertRefused(t, reviewedFile, reviewed.replace(callText, editedCall), editedCall);
});
