// CHK-26 bindings found by the first implementation review (Astra r1 B05, B06): the denial branch
// tests the authenticator's result, a direct core's caller does no work first, the status assertion
// is on the invoked method's response, portals are judged as the proxy judges them, and a base
// registration of a live action cannot be dropped silently.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createParser, listSourceFiles, scanRoots } from './server-mutation/ast.mjs';
import {
  ROUTE,
  TEST,
  forecastEntry,
  routeProblems,
  withForecast,
} from './fixtures/server-mutation-check/forecast.mjs';
import {
  check,
  ids,
  pageEntry,
  registryOf,
  runCheck,
  tree,
} from './fixtures/server-mutation-check/harness.mjs';

const NO_DENIAL = 'no denial return between authenticator and effect';

test('CHK-26: an early return that does not test the authenticator result is no denial', t => {
  const route = ROUTE.replace('if (!ingress) {', "if (request.nextUrl.searchParams.get('dry')) {");
  assert.ok(routeProblems(withForecast(t, route), [forecastEntry()]).includes(NO_DENIAL));
});

test('CHK-26: the authenticator call inside the denial condition passes', t => {
  const route = ROUTE.replace(
    /const ingress = (authorizeCronRequest\(\{[\s\S]*?\n {2}\}\));\n {2}if \(!ingress\) \{/u,
    'const ingress = null as never;\n  if (!$1) {'
  );
  assert.notEqual(route, ROUTE);
  assert.deepEqual(routeProblems(withForecast(t, route), [forecastEntry()]), []);
});

test('CHK-26: a method that works before delegating to its authenticating core fails', t => {
  const D = 'apps/web/src/app/api/cron/core-route';
  const root = tree(t, {
    [`${D}/route.ts`]:
      "import { core } from './_core';\nimport { audit } from './side';\nexport async function GET(request: Request) {\n  await audit();\n  return core(request);\n}\n",
    [`${D}/_core.ts`]:
      "import { authorizeCronRequest } from '../_auth';\nimport { runEffect } from './effect';\nexport async function core(request: Request) {\n  const ingress = authorizeCronRequest({ authorizationHeader: request.headers.get('authorization') });\n  if (!ingress) return new Response(null, { status: 401 });\n  return runEffect();\n}\n",
  });
  const entry = forecastEntry({
    id: 'core-route',
    module: `${D}/route.ts`,
    effect: 'runEffect',
    deniedTest: { path: `${D}/route.test.ts`, title: 'x' },
  });
  assert.ok(routeProblems(root, [entry]).includes('call before the authenticator: audit'));
});

test("CHK-26: a denial status asserted on another response is not the method's", t => {
  const other = TEST.replace(
    'expect(res.status).toBe(401);',
    'const other = new Response(null, { status: 401 });\n    expect(other.status).toBe(401);'
  );
  assert.notEqual(other, TEST);
  assert.deepEqual(routeProblems(withForecast(t, ROUTE, other), [forecastEntry()]), [
    "no 401/403/404 status assertion on that method's response",
  ]);
});

test('CHK-26: a portal is the first URL segment after the locale, as the proxy decides', t => {
  const page = 'export default function P() { return null; }\n';
  const nested = 'apps/web/src/app/[locale]/(site)/help/member/page.tsx';
  const slot = 'apps/web/src/app/[locale]/(app)/member/(portal)/@case/page.tsx';
  const found = ids(runCheck('CHK-26', tree(t, { [nested]: page, [slot]: page })));
  assert.ok(found.includes(`page-unlisted@${nested}`), found.join('\n'));
  assert.ok(
    !found.some(id => id.includes('@case')),
    'a slot of the member portal is a portal page'
  );
  const listed = registryOf([pageEntry('slot', slot)]);
  assert.ok(
    ids(runCheck('CHK-26', tree(t, { [slot]: page }), listed)).includes(`page-missing@${slot}`)
  );
});

test('CHK-26: a live action registered in the base cannot leave the registry silently', t => {
  const A = 'apps/web/src/actions/intake.ts';
  const root = tree(t, { [A]: "'use server';\nexport async function submit() {}\n" });
  const row = {
    id: 'intake',
    kind: 'server-action',
    module: A,
    export: 'submit',
    operation: null,
    rateLimit: null,
    writes: true,
    closedBy: null,
    source: 'fixture',
  };
  const run = (registry, baseRegistry) =>
    ids(
      check('CHK-26').run({
        root,
        files: listSourceFiles(root, scanRoots(root)),
        parse: createParser(root),
        registry,
        baseRegistry,
      })
    );
  const other = registryOf([pageEntry('none', 'apps/web/src/app/none/page.tsx')]);
  assert.ok(run(other, registryOf([row])).includes(`intake@${A}#submit#deregistered`));
  assert.ok(!run(registryOf([row]), registryOf([row])).some(id => id.endsWith('#deregistered')));
  const gone = tree(t, {});
  const ctx = {
    root: gone,
    files: listSourceFiles(gone, scanRoots(gone)),
    parse: createParser(gone),
  };
  const removed = check('CHK-26').run({ ...ctx, registry: other, baseRegistry: registryOf([row]) });
  assert.ok(!ids(removed).some(id => id.endsWith('#deregistered')), 'a removed export may go');
});
