import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodeUnit } from './server-mutation/ast.mjs';
import { ratchet } from './server-mutation/baseline.mjs';
import { fixtureCase, ids, runCheck, tree } from './fixtures/server-mutation-check/harness.mjs';

const M = 'packages/domain-x/src/write.ts';
const HEAD = "import { z } from 'zod';\nimport { db, things } from './db';\n";
const findingsOf = (t, body) => runCheck('CHK-05', tree(t, { [M]: HEAD + body })).findings;
const messages = (t, body) =>
  findingsOf(t, body)
    .map(f => f.message)
    .join('\n');

test('CHK-05: the catalogue command passes', t => {
  const result = runCheck('CHK-05', tree(t, fixtureCase('catalogue')));
  assert.equal(result.units, 1);
  assert.deepEqual(result.findings, []);
});

test('CHK-05: the notification-settings path before a34986463 fails at both helper writes', t => {
  const files = fixtureCase('notification-settings-pre-a34986463');
  const root = tree(t, files);
  const C = 'apps/web/src/app/api/settings/notifications/_core.ts';
  const helper = runCheck('CHK-05', root).findings.filter(f => f.file === C);
  assert.deepEqual(
    helper.map(f => f.line).sort((a, b) => a - b),
    [92, 114]
  );
  assert.ok(helper.every(f => /spread preferences: parameter args/u.test(f.message)));
  const routeUnits = ids(runCheck('CHK-04', root)).filter(id =>
    id.startsWith('apps/web/src/app/api/settings/notifications/route.ts#')
  );
  assert.deepEqual(routeUnits.sort(byCodeUnit), [
    'apps/web/src/app/api/settings/notifications/route.ts#GET',
    'apps/web/src/app/api/settings/notifications/route.ts#POST',
  ]);
});

test('CHK-05: parsed input through a strict schema passes (parse, guarded safeParse, handler parameter)', t => {
  const body = `const S = z.strictObject({ name: z.string().trim().refine(v => v.length > 0), tags: z.array(z.enum(['a'])) });
export async function a(raw: unknown) { const v = S.parse(raw); await db.insert(things).values({ ...v, tenantId: 't' }); }
export async function b(raw: unknown) { const r = S.safeParse(raw); if (!r.success) return; await db.update(things).set({ ...r.data }); }
import { defineAction } from '@/lib/safe-action';
export const c = defineAction({ input: S, handler: async (input) => db.insert(things).values({ ...input }) });
export async function d(raw: unknown) { const v = z.object({ n: z.string() }).strict().parse(raw); await db.insert(things).values(v); }`;
  assert.deepEqual(findingsOf(t, body), []);
});

test('CHK-05: each unparsed or open form is refused', t => {
  const cases = {
    jsonParse:
      'export async function f(s: string) { await db.insert(things).values({ ...JSON.parse(s) }); }',
    loose:
      'const L = z.object({ a: z.string() });\nexport async function f(r: unknown) { await db.insert(things).values({ ...L.parse(r) }); }',
    unguarded:
      'const S = z.strictObject({ a: z.string() });\nexport async function f(r: unknown) { const p = S.safeParse(r); await db.insert(things).values({ ...p.data }); }',
    unknownMember:
      'const S = z.strictObject({ meta: z.unknown() });\nexport async function f(r: unknown) { await db.insert(things).values({ ...S.parse(r) }); }',
    overwrite:
      'const S = z.strictObject({ a: z.string() }).overwrite(v => v);\nexport async function f(r: unknown) { await db.insert(things).values({ ...S.parse(r) }); }',
    objectRefine:
      'const S = z.strictObject({ a: z.string() }).refine(v => !!v);\nexport async function f(r: unknown) { await db.insert(things).values({ ...S.parse(r) }); }',
    param: 'export async function f(body: object) { await db.update(things).set({ ...body }); }',
    alias:
      'export async function f(r: Request) { const body = await r.json(); const row = { ...body }; await db.insert(things).values(row); }',
  };
  for (const [name, body] of Object.entries(cases))
    assert.equal(findingsOf(t, body).length, 1, name);
  assert.match(messages(t, cases.loose), /parse schema is not a strict object/u);
  assert.match(messages(t, cases.unguarded), /p\.data without a preceding success guard/u);
  assert.match(messages(t, cases.unknownMember), /spread path: z\.unknown/u);
  assert.match(messages(t, cases.overwrite), /parse schema adds overwrite/u);
});

test('CHK-05: a handler parameter has provenance only from the imported wrapper factory', t => {
  const handler =
    'export const c = defineAction({ input: S, handler: async (input) => db.insert(things).values({ ...input }) });';
  const S = 'const S = z.strictObject({ a: z.string() });\n';
  const local = `${S}const defineAction = (d: any) => d;\n${handler}`;
  assert.match(messages(t, local), /parameter input/u);
  const otherModule = `${S}import { defineAction } from './helpers';\n${handler}`;
  assert.match(messages(t, otherModule), /parameter input/u);
  const noInput = `import { defineAction } from '@/lib/safe-action';\n${handler.replace('input: S, ', '')}`;
  assert.match(messages(t, noInput), /parameter input/u);
});

test('CHK-05: a quoted or computed identity key counts as the identity key', t => {
  const S = 'const S = z.strictObject({ a: z.string() });\n';
  for (const key of ["'tenantId'", '"tenantId"', "['tenantId']"])
    assert.match(
      messages(
        t,
        `${S}export async function f(r: unknown) { await db.insert(things).values({ ${key}: 't', ...S.parse(r) }); }`
      ),
      /spread after identity key tenantId/u,
      key
    );
});

test('CHK-05: no spread may follow an identity key (tenant keys and owner columns)', t => {
  const S = 'const S = z.strictObject({ a: z.string() });\n';
  assert.match(
    messages(
      t,
      `${S}export async function f(r: unknown) { await db.insert(things).values({ tenantId: 't', ...S.parse(r) }); }`
    ),
    /spread after identity key tenantId/u
  );
  assert.match(
    messages(
      t,
      `${S}export async function f(r: unknown) { await db.insert(things).values({ ownerId: 'u', ...S.parse(r) }); }`
    ),
    /spread after identity key ownerId/u
  );
  assert.deepEqual(
    findingsOf(
      t,
      `${S}export async function f(r: unknown) { await db.insert(things).values({ ...S.parse(r), ownerId: 'u' }); }`
    ),
    []
  );
});

const branchy = (inFirst, extra = '') => `export async function f(a: boolean, b: object) {
  ${extra}if (a) { ${inFirst ? 'await db.insert(things).values({ ...b });' : ''} }
  else { ${inFirst ? '' : 'await db.insert(things).values({ ...b });'} }
  if (!a) { await db.update(things).set({ ...b }); }
}`;

test('CHK-05 ids: a violation moved between branches is one fixed and one new (r4 B8)', t => {
  const before = ids(runCheck('CHK-05', tree(t, { [M]: HEAD + branchy(true) })));
  const after = ids(runCheck('CHK-05', tree(t, { [M]: HEAD + branchy(false) })));
  const result = ratchet(after, before);
  assert.equal(result.new.length, 1);
  assert.equal(result.fixed.length, 1);
  assert.match(result.new[0], /if\([0-9a-f]{12}\)\.else/u);
});

test('CHK-05 ids: an unrelated guard or a removed sibling branch leaves ids unchanged (r5 B8)', t => {
  const base = ids(runCheck('CHK-05', tree(t, { [M]: HEAD + branchy(true) }))).sort(byCodeUnit);
  const guarded = ids(
    runCheck('CHK-05', tree(t, { [M]: HEAD + branchy(true, 'if (!b) return;\n  ') }))
  ).sort(byCodeUnit);
  assert.deepEqual(guarded, base);
  const fewer =
    HEAD + branchy(true).replace('  if (!a) { await db.update(things).set({ ...b }); }\n', '');
  const remaining = ids(runCheck('CHK-05', tree(t, { [M]: fewer })));
  assert.deepEqual(
    remaining,
    base.filter(id => !id.includes('#update('))
  );
});

test('CHK-05 ids: two sibling constructs with one identity make the write ambiguous', t => {
  const body =
    'export async function f(a: boolean, b: object) {\n  if (a) { await db.insert(things).values({ ...b }); }\n  if (a) { return; }\n}';
  const [finding] = findingsOf(t, body);
  assert.equal(finding.ambiguous, true);
  assert.match(finding.id, /^ambiguous:/u);
});
