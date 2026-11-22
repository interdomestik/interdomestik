import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodeUnit } from './server-mutation/ast.mjs';
import { ids, runCheck, tree } from './fixtures/server-mutation-check/harness.mjs';

const ROUTE_IMPORT = "import { defineRoute } from '@/lib/safe-route';\n";
const routePath = name => `apps/web/src/app/api/${name}/route.ts`;
const routeDef = (method = "'POST'", basis = "{ kind: 'self' }", extra = '') =>
  `defineRoute({ name: 'fixture.write', method: ${method}, basis: ${basis}, subject: { type: 'none' }, handler: async () => 1${extra} })`;

const invalidLimit = 'rateLimit.limit is not a positive integer literal';
const invalidWindow = 'rateLimit.windowSeconds is not a positive integer literal';
for (const [name, limits, problem] of [
  ['literal limits', 'rateLimit: { limit: 2, windowSeconds: 60 }, maxBodyBytes: 1_024'],
  ['variable body limit', 'maxBodyBytes: cap', 'maxBodyBytes is not a numeric literal'],
  ['variable limiter', 'rateLimit: limiter', 'rateLimit: not an object literal'],
  ['variable limiter window', 'rateLimit: { limit: 2, windowSeconds: seconds }', invalidWindow],
  ['shorthand limiter value', 'rateLimit: { limit, windowSeconds: 60 }', invalidLimit],
  ['computed limiter window value', 'rateLimit: { limit: 2, windowSeconds: 30 + 30 }', invalidWindow],
  ['awaited limiter window', 'rateLimit: { limit: 2, windowSeconds: await 60 }', invalidWindow],
  ['zero limiter value', 'rateLimit: { limit: 0, windowSeconds: 60 }', invalidLimit],
  ['fractional limiter window', 'rateLimit: { limit: 2, windowSeconds: 1.5 }', invalidWindow],
  ['non-finite limiter value', 'rateLimit: { limit: 1e999, windowSeconds: 60 }', invalidLimit],
  ['spread in limiter', 'rateLimit: { limit: 2, windowSeconds: 60, ...other }', 'rateLimit: spread element'],
  ['computed limiter key', "rateLimit: { ['limit']: 2, windowSeconds: 60 }", 'rateLimit: computed key'],
  ['duplicate limiter key', 'rateLimit: { limit: 2, limit: 3, windowSeconds: 60 }', 'rateLimit: duplicate key limit'],
]) {
  test(`CHK-04 form (d): ${name}`, t => {
    const file = routePath('limits');
    const extra = `, ${limits}`;
    const root = tree(t, {
      [file]: `${ROUTE_IMPORT}const limit = 2, seconds = 60, cap = 1024, other = {};
const limiter = { limit, windowSeconds: seconds };
export const POST = ${routeDef(undefined, undefined, extra)};`,
    });
    const result = runCheck('CHK-04', root);
    assert.deepEqual(result.units, { export: 0, route: 1 });
    assert.deepEqual(result.findings, problem ? [{ id: `${file}#POST`, file, message: problem }] : []);
  });
}

test('CHK-04: eligible direct writing route definitions pass and an unwrapped writer fails', t => {
  const writer = routePath('direct-write');
  const root = tree(t, {
    [writer]: 'export async function POST() { await db.insert(entries).values({ value: 1 }); }',
    [routePath('write')]:
      ROUTE_IMPORT +
      ['POST', 'PUT', 'PATCH', 'DELETE']
        .map(method => {
          const methodLiteral = `'${method}'`;
          return `export const ${method} = ${routeDef(methodLiteral)};`;
        })
        .join('\n'),
  });

  const result = runCheck('CHK-04', root);
  assert.deepEqual(result.units, { export: 0, route: 5 });
  assert.deepEqual(ids(result), [`${writer}#POST`]);
});

test('CHK-04: requires a literal writing method equal to the export plus literal metadata', t => {
  const root = tree(t, {
    [routePath('mismatch')]: `${ROUTE_IMPORT}export const PATCH = ${routeDef()};`,
    [routePath('dynamic')]:
      `${ROUTE_IMPORT}const method = 'POST'; export const POST = ${routeDef('method')};`,
    [routePath('read')]: `${ROUTE_IMPORT}export const GET = ${routeDef("'GET'")};`,
    [routePath('spread')]:
      `${ROUTE_IMPORT}export const POST = ${routeDef(undefined, undefined, ', ...other')};`,
    [routePath('computed')]:
      `${ROUTE_IMPORT}export const POST = ${routeDef().replace('name:', "['name']:")};`,
    [routePath('duplicate')]:
      `${ROUTE_IMPORT}export const POST = ${routeDef(undefined, undefined, ", method: 'POST'")};`,
    [routePath('dynamic-kind')]:
      `${ROUTE_IMPORT}const basisKind = 'self'; export const POST = ${routeDef(undefined, '{ kind: basisKind }')};`,
    [routePath('dynamic-name')]:
      `${ROUTE_IMPORT}const name = 'fixture.write'; export const POST = ${routeDef().replace("'fixture.write'", 'name')};`,
    [routePath('dynamic-subject')]:
      `${ROUTE_IMPORT}const subject = 'none'; export const POST = ${routeDef().replace("'none'", 'subject')};`,
  });
  const findings = Object.fromEntries(
    runCheck('CHK-04', root).findings.map(f => [f.id, f.message])
  );
  assert.deepEqual(
    Object.keys(findings).sort(byCodeUnit),
    [
      'computed#POST',
      'duplicate#POST',
      'dynamic#POST',
      'dynamic-kind#POST',
      'dynamic-name#POST',
      'dynamic-subject#POST',
      'mismatch#PATCH',
      'read#GET',
      'spread#POST',
    ]
      .map(item => {
        const [file, method] = item.split('#');
        return `${routePath(file)}#${method}`;
      })
      .sort(byCodeUnit)
  );
  assert.match(findings[`${routePath('mismatch')}#PATCH`], /literal matching/u);
  assert.match(findings[`${routePath('dynamic')}#POST`], /literal matching/u);
  assert.match(findings[`${routePath('read')}#GET`], /writing method/u);
  assert.match(findings[`${routePath('spread')}#POST`], /spread element/u);
  assert.match(findings[`${routePath('computed')}#POST`], /computed key/u);
  assert.match(findings[`${routePath('duplicate')}#POST`], /duplicate key/u);
  assert.match(
    findings[`${routePath('dynamic-kind')}#POST`],
    /basis.kind is not a string literal/u
  );
  assert.match(findings[`${routePath('dynamic-name')}#POST`], /name is not a string literal/u);
  assert.match(
    findings[`${routePath('dynamic-subject')}#POST`],
    /subject.type is not a string literal/u
  );
});

test('CHK-04: refuses closed bases, wrappers, indirect exports and other imports as form (d)', t => {
  const root = tree(t, {
    [routePath('public')]:
      `${ROUTE_IMPORT}export const POST = ${routeDef(undefined, "{ kind: 'public', entry: 'x' }")};`,
    [routePath('signature')]:
      `${ROUTE_IMPORT}export const POST = ${routeDef(undefined, "{ kind: 'signature', entry: 'x' }")};`,
    [routePath('wrapper')]:
      `${ROUTE_IMPORT}const inner = ${routeDef()}; export async function POST(r, c) { return inner(r, c); }`,
    [routePath('indirect')]: `${ROUTE_IMPORT}const POST = ${routeDef()}; export { POST };`,
    [routePath('wrong-import')]:
      `import { defineRoute } from './elsewhere'; export const POST = ${routeDef()};`,
    [routePath('relative-import')]:
      `import { defineRoute } from '../../../lib/safe-route'; export const POST = ${routeDef()};`,
  });
  assert.deepEqual(
    ids(runCheck('CHK-04', root)).sort(byCodeUnit),
    ['indirect', 'public', 'relative-import', 'signature', 'wrapper', 'wrong-import']
      .map(name => `${routePath(name)}#POST`)
      .sort(byCodeUnit)
  );
});
