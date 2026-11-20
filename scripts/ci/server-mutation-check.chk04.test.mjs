import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodeUnit } from './server-mutation/ast.mjs';
import { ids, registryOf, runCheck, tree } from './fixtures/server-mutation-check/harness.mjs';

const A = 'apps/web/src/actions';
const IMPORT = "'use server';\nimport { defineAction } from '@/lib/safe-action';\n";
const def = (name, extra = '', basis = "{ kind: 'role', roles: STAFF }") =>
  `defineAction({ name: '${name}', basis: ${basis}, input: schema, subject: { type: 'claim', from: 'claimId' }, handler: async () => 1${extra} })`;

test('CHK-04 units: value exports followed through re-exports and export *, types excluded', t => {
  const root = tree(t, {
    [`${A}/impl.ts`]: `${IMPORT}export const good = ${def('a.good')};\nexport type T = string;\nexport interface I { a: 1 }\n`,
    [`${A}/index.ts`]:
      "'use server';\nexport { good as renamed } from './impl';\nexport * from './more';\nexport async function plain() {}\n",
    [`${A}/more.ts`]: 'export async function fromStar() {}\nexport type Hidden = number;\n',
  });
  const result = runCheck('CHK-04', root);
  // impl#good, index#renamed (resolves to the compliant definition), index#fromStar, index#plain.
  assert.deepEqual(result.units, { export: 4, route: 0 });
  assert.deepEqual(ids(result).sort(byCodeUnit), [`${A}/index.ts#fromStar`, `${A}/index.ts#plain`]);
});

test('CHK-04: a spread, a computed key or a duplicate key in the definition is a violation (r4 B2)', t => {
  const root = tree(t, {
    [`${A}/a.ts`]: `${IMPORT}const open = { basis: { kind: 'public', entry: 'x' } };\nexport const spread = defineAction({ name: 'a.spread', basis: { kind: 'role', roles: STAFF }, input: schema, subject: { type: 'none' }, handler: async () => 1, ...open });\nexport const computed = defineAction({ ['name']: 'a.c', basis: { kind: 'self' }, input: schema, subject: { type: 'none' }, handler: async () => 1 });\nexport const duplicate = defineAction({ name: 'a.d', basis: { kind: 'self' }, basis: { kind: 'public', entry: 'x' }, input: schema, subject: { type: 'none' }, handler: async () => 1 });\nexport const basisSpread = defineAction({ name: 'a.b', basis: { kind: 'self', ...open.basis }, input: schema, subject: { type: 'none' }, handler: async () => 1 });\n`,
  });
  const messages = Object.fromEntries(
    runCheck('CHK-04', root).findings.map(f => [f.id.split('#')[1], f.message])
  );
  assert.match(messages.spread, /spread element/u);
  assert.match(messages.computed, /computed key/u);
  assert.match(messages.duplicate, /duplicate key basis/u);
  assert.match(messages.basisSpread, /basis: spread element/u);
});

test('CHK-04: missing subject, non-literal name, non-literal kind and a non-wrapper callee are violations', t => {
  const root = tree(t, {
    [`${A}/b.ts`]: `${IMPORT}import { defineAction as other } from './elsewhere';\nconst N = 'n';\nexport const noSubject = defineAction({ name: 'b.ns', basis: { kind: 'self' }, input: schema, handler: async () => 1 });\nexport const dynamicName = defineAction({ name: N, basis: { kind: 'self' }, input: schema, subject: { type: 'none' }, handler: async () => 1 });\nexport const dynamicKind = defineAction({ name: 'b.k', basis: { kind: N }, input: schema, subject: { type: 'none' }, handler: async () => 1 });\nexport const notWrapper = other({ name: 'b.o', basis: { kind: 'self' }, input: schema, subject: { type: 'none' }, handler: async () => 1 });\nexport let mutable = ${def('b.let')};\n`,
  });
  const found = ids(runCheck('CHK-04', root))
    .map(id => id.split('#')[1])
    .sort(byCodeUnit);
  assert.deepEqual(found, ['dynamicKind', 'dynamicName', 'mutable', 'noSubject', 'notWrapper']);
});

test('CHK-04: a compliant definition passes; a definition outside a use-server module does not', t => {
  const root = tree(t, {
    [`${A}/ok.ts`]: `${IMPORT}export const ok = ${def('ok.one')};\n`,
    [`${A}/plain-core.ts`]: `import { defineAction } from '@/lib/safe-action';\nexport const core = ${def('core.one')};\n`,
    [`${A}/reexport.ts`]: "'use server';\nexport { core } from './plain-core';\n",
  });
  assert.deepEqual(ids(runCheck('CHK-04', root)), [`${A}/reexport.ts#core`]);
});

test('CHK-04: a name used twice repo-wide flags both definitions', t => {
  const root = tree(t, {
    [`${A}/one.ts`]: `${IMPORT}export const first = ${def('same.name')};\n`,
    [`${A}/two.ts`]: `${IMPORT}export const second = ${def('same.name')};\n`,
  });
  assert.deepEqual(ids(runCheck('CHK-04', root)).sort(byCodeUnit), [
    `${A}/one.ts#first`,
    `${A}/two.ts#second`,
  ]);
});

test('CHK-04: a public definition passes only when the registry binds it; a listed alias passes', t => {
  const pub = "{ kind: 'public', entry: 'intake' }";
  const root = tree(t, {
    [`${A}/pub.ts`]: `${IMPORT}export const intake = ${def('intake.submit', '', pub)};\nexport { intake as intakeAlias };\n`,
    [`${A}/rogue.ts`]: `${IMPORT}export const rogue = ${def('rogue.submit', '', pub)};\n`,
  });
  const entry = {
    id: 'intake',
    kind: 'server-action',
    module: `${A}/pub.ts`,
    export: 'intake',
    operation: 'intake.submit',
    rateLimit: { limit: 5, windowSeconds: 60 },
    aliases: [`${A}/pub.ts#intakeAlias`],
    writes: true,
    closedBy: null,
    source: 'fixture',
  };
  assert.deepEqual(ids(runCheck('CHK-04', root, registryOf([entry]))), [`${A}/rogue.ts#rogue`]);
  const withoutAlias = { ...entry, aliases: [] };
  assert.deepEqual(ids(runCheck('CHK-04', root, registryOf([withoutAlias]))).sort(byCodeUnit), [
    `${A}/pub.ts#intakeAlias`,
    `${A}/rogue.ts#rogue`,
  ]);
});

test("CHK-04: an inline 'use server' function is a unit and never compliant", t => {
  const root = tree(t, {
    'apps/web/src/components/form.tsx':
      "export function Form() {\n  async function save() {\n    'use server';\n    return 1;\n  }\n  return save;\n}\n",
  });
  const found = ids(runCheck('CHK-04', root));
  assert.equal(found.length, 1);
  assert.match(found[0], /^apps\/web\/src\/components\/form\.tsx#save#[0-9a-f]{12}$/u);
});

test('CHK-04: every exported route method is a unit; a registered one with its denied test is compliant', t => {
  const R = 'apps/web/src/app/api/thing/route.ts';
  const root = tree(t, {
    [R]: 'async function handler() { return new Response(null, { status: 405 }); }\nexport async function POST() { return new Response(null); }\nexport const GET = handler;\nexport const { PUT, PATCH } = make();\nexport { handler as DELETE };\n',
    'apps/web/src/app/api/thing/route.test.ts':
      "import { POST } from './route';\nit('refuses', async () => { await POST(); });\n",
  });
  const route = title => ({
    id: 'thing',
    kind: 'route',
    module: R,
    method: 'POST',
    authentication: 'secret-header',
    effect: 'work',
    deniedTest: { path: 'apps/web/src/app/api/thing/route.test.ts', title },
    writes: true,
    closedBy: null,
    source: 'fixture',
  });
  const registered = runCheck('CHK-04', root, registryOf([route('refuses')]));
  assert.deepEqual(registered.units, { export: 0, route: 5 });
  assert.deepEqual(
    ids(registered)
      .map(id => id.split('#')[1])
      .sort(byCodeUnit),
    ['DELETE', 'GET', 'PATCH', 'PUT']
  );
  const missingTitle = ids(runCheck('CHK-04', root, registryOf([route('no such title')])));
  assert.ok(missingTitle.includes(`${R}#POST`));
});

test('CHK-04 reports any importer of runPublicIntake except its own test', t => {
  const root = tree(t, {
    'apps/web/src/lib/safe-action.public.ts': 'export async function runPublicIntake() {}\n',
    'apps/web/src/lib/safe-action.public.test.ts':
      "import { runPublicIntake } from './safe-action.public';\n",
    [`${A}/intake.ts`]:
      "'use server';\nimport { runPublicIntake } from '@/lib/safe-action.public';\nexport const x = 1;\nvoid runPublicIntake;\n",
  });
  const found = ids(runCheck('CHK-04', root));
  assert.ok(found.includes(`${A}/intake.ts#imports-runPublicIntake`));
  assert.ok(!found.some(id => id.includes('safe-action.public.test.ts')));
});

test('CHK-04 reports dynamic imports and requires of the public intake module (Astra r1 B09)', t => {
  const root = tree(t, {
    'apps/web/src/lib/safe-action.public.ts': 'export async function runPublicIntake() {}\n',
    [`${A}/lazy.ts`]:
      "export async function f() {\n  const m = await import('@/lib/safe-action.public');\n  return m;\n}\n",
    [`${A}/cjs.js`]: "const m = require('../lib/safe-action.public');\nmodule.exports = m;\n",
    [`${A}/unrelated.ts`]: "export async function g() {\n  return import('@/lib/other');\n}\n",
  });
  const found = ids(runCheck('CHK-04', root));
  assert.ok(found.includes(`${A}/lazy.ts#imports-runPublicIntake`), found.join('\n'));
  assert.ok(found.includes(`${A}/cjs.js#imports-runPublicIntake`), found.join('\n'));
  assert.ok(!found.some(id => id.includes('unrelated.ts')));
});

test('CHK-04 counts a JavaScript use-server module', t => {
  const root = tree(t, { [`${A}/legacy.js`]: "'use server';\nexport async function act() {}\n" });
  assert.ok(ids(runCheck('CHK-04', root)).includes(`${A}/legacy.js#act`));
});

test('CHK-04: a route at the app root is a route unit (Astra r9 B33)', t => {
  const R = 'apps/web/src/app/route.ts';
  const root = tree(t, { [R]: 'export async function POST() { return new Response(null); }\n' });
  const result = runCheck('CHK-04', root);
  assert.deepEqual(result.units, { export: 0, route: 1 });
  assert.deepEqual(ids(result), [`${R}#POST`]);
});
