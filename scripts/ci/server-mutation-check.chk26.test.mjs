import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodeUnit } from './server-mutation/ast.mjs';
import {
  F,
  ROUTE,
  TEST,
  TITLE,
  forecastEntry,
  routeProblems,
  withForecast,
} from './fixtures/server-mutation-check/forecast.mjs';
import {
  fixtureCase,
  ids,
  pageEntry,
  registryOf,
  runCheck,
  tree,
} from './fixtures/server-mutation-check/harness.mjs';

test('CHK-26: the forecast route and its denied test pass, with only the open-closure item', t => {
  const root = withForecast(t);
  const found = ids(runCheck('CHK-26', root, registryOf([forecastEntry()])));
  assert.deepEqual(found, [`cron-forecast@${F}/route.ts#GET#no-closure`]);
});

test('CHK-26: a reassigned entry id is a new closure item (r4 B8)', t => {
  const root = withForecast(t);
  const found = ids(runCheck('CHK-26', root, registryOf([forecastEntry({ id: 'cron-renamed' })])));
  assert.deepEqual(found, [`cron-renamed@${F}/route.ts#GET#no-closure`]);
});

test('CHK-26: simple-register passes as closed-410; any statement before the return fails', t => {
  const files = fixtureCase('simple-register');
  const S = 'apps/web/src/app/api/simple-register';
  const entry = {
    id: 'retired',
    kind: 'route',
    module: `${S}/route.ts`,
    method: 'POST',
    authentication: 'closed-410',
    deniedTest: {
      path: `${S}/route.test.ts`,
      title: 'returns gone because the endpoint is retired',
    },
    writes: false,
    closedBy: null,
    source: 'fixture',
  };
  assert.deepEqual(routeProblems(tree(t, files), [entry]), []);
  const working = files[`${S}/route.ts`].replace(
    'export async function POST(_req: NextRequest) {',
    'export async function POST(_req: NextRequest) {\n  await record();'
  );
  assert.deepEqual(routeProblems(tree(t, { ...files, [`${S}/route.ts`]: working }), [entry]), [
    'closed-410 body is not exactly one return',
  ]);
  const reads = files[`${S}/route.ts`].replace(
    '{ status: 410 }',
    '{ status: 410, headers: _req.headers }'
  );
  assert.ok(routeProblems(tree(t, { ...files, [`${S}/route.ts`]: reads }), [entry]).length > 0);
});

test('CHK-26: a removed authenticator fails even with its old test', t => {
  const route = ROUTE.replace(
    /const ingress = authorizeCronRequest\(\{[\s\S]*?\n {2}\}\n/u,
    'const ingress = {};\n'
  );
  assert.deepEqual(routeProblems(withForecast(t, route), [forecastEntry()]), [
    'authenticator not called in the method or its direct core',
  ]);
});

test('CHK-26: an effect call before the authenticator fails', t => {
  const route = ROUTE.replace(
    '  const ingress = authorizeCronRequest(',
    '  await runCrmForecastSnapshotSchedulerCore({} as never);\n  const ingress = authorizeCronRequest('
  );
  assert.match(
    routeProblems(withForecast(t, route), [forecastEntry()])[0],
    /call before the authenticator: runCrmForecastSnapshotSchedulerCore/u
  );
});

test('CHK-26: a test of an unrelated route or of a sibling method fails', t => {
  const unrelated = TEST.replace(
    "import { GET } from './route';",
    "import { GET } from '../other/route';"
  );
  const root = withForecast(t, ROUTE, unrelated, {
    [`apps/web/src/app/api/cron/crm/other/route.ts`]: 'export async function GET() {}\n',
  });
  assert.deepEqual(routeProblems(root, [forecastEntry()]), [
    'denied test does not import that method from the route module',
  ]);
  const sibling = ROUTE.replace(
    'export async function GET(',
    'export async function POST(_r: NextRequest) { return NextResponse.json(null); }\nexport async function GET('
  );
  assert.deepEqual(
    routeProblems(withForecast(t, sibling), [forecastEntry({ method: 'POST' })]).at(-1),
    'denied test does not import that method from the route module'
  );
});

test('CHK-26: a skipped test or a skipped suite fails', t => {
  const skipped = TEST.replace(`it('${TITLE}'`, `it.skip('${TITLE}'`);
  assert.deepEqual(routeProblems(withForecast(t, ROUTE, skipped), [forecastEntry()]), [
    'denied test title not found (or skipped)',
  ]);
  const suite = TEST.replace(/describe\(/u, 'describe.skip(');
  assert.deepEqual(routeProblems(withForecast(t, ROUTE, suite), [forecastEntry()]), [
    'denied test sits in a skipped or filtered suite',
  ]);
});

test('CHK-26: no zero-call assertion, or one on a different mock, fails', t => {
  const none = TEST.replace(
    '    expect(hoisted.runCrmForecastSnapshotSchedulerCore).not.toHaveBeenCalled();\n',
    ''
  );
  assert.deepEqual(routeProblems(withForecast(t, ROUTE, none), [forecastEntry()]), [
    'no zero-call assertion on the effect mock',
  ]);
  const other = TEST.replace(
    'expect(hoisted.runCrmForecastSnapshotSchedulerCore).not.toHaveBeenCalled()',
    'expect(hoisted.logCrmForecastSnapshotSchedulerResult).not.toHaveBeenCalled()'
  );
  assert.deepEqual(routeProblems(withForecast(t, ROUTE, other), [forecastEntry()]), [
    'no zero-call assertion on the effect mock',
  ]);
});

test('CHK-26: a denied test outside a CI test lane fails', t => {
  const entry = forecastEntry({ deniedTest: { path: `scripts/elsewhere.test.ts`, title: TITLE } });
  assert.deepEqual(
    routeProblems(withForecast(t, ROUTE, TEST, { 'scripts/elsewhere.test.ts': TEST }), [entry]),
    ['denied test is not in a CI test lane']
  );
});

test('CHK-26: server-action entries need their export; a second claimant is a violation', t => {
  const A = 'apps/web/src/actions/intake.ts';
  const root = tree(t, { [A]: "'use server';\nexport async function submit() {}\n" });
  const action = (id, exp) => ({
    id,
    kind: 'server-action',
    module: A,
    export: exp,
    operation: null,
    rateLimit: null,
    writes: true,
    closedBy: null,
    source: 'fixture',
  });
  const found = ids(
    runCheck(
      'CHK-26',
      root,
      registryOf([action('one', 'submit'), action('two', 'submit'), action('three', 'gone')])
    )
  );
  assert.ok(found.includes(`two@${A}#submit#second-claimant`));
  assert.ok(found.includes(`three@${A}#gone#missing-binding`));
});

test('CHK-26: every page outside the four portals is listed and every listed page exists', t => {
  const root = tree(t, {
    'apps/web/src/app/[locale]/(site)/about/page.tsx':
      'export default function P() { return null; }\n',
    'apps/web/src/app/[locale]/(app)/member/page.tsx':
      'export default function P() { return null; }\n',
    'apps/web/src/app/[locale]/pricing/page.tsx': 'export default function P() { return null; }\n',
  });
  const found = ids(
    runCheck(
      'CHK-26',
      root,
      registryOf([
        pageEntry('about', 'apps/web/src/app/[locale]/(site)/about/page.tsx'),
        pageEntry('gone', 'apps/web/src/app/gone/page.tsx'),
      ])
    )
  );
  assert.ok(found.includes('page-unlisted@apps/web/src/app/[locale]/pricing/page.tsx'));
  assert.ok(found.includes('page-missing@apps/web/src/app/gone/page.tsx'));
  assert.ok(!found.some(id => id.includes('/member/')));
});

test('CHK-26: identity mechanisms are detected through conditional spreads and resolved to their import', t => {
  const P = 'apps/web/src/lib/auth/providers.ts';
  const root = tree(t, {
    [P]: "import { emailOTP } from 'better-auth/plugins/email-otp';\nimport { magicLink } from 'better-auth/plugins';\nimport { local } from './local-plugin';\nexport function build(g: unknown) {\n  return {\n    emailAndPassword: { enabled: true },\n    plugins: [emailOTP({}), magicLink({}), local()],\n    ...(g ? { socialProviders: { github: g } } : {}),\n  };\n}\n",
    'apps/web/src/lib/auth/local-plugin.ts': 'export const local = () => ({});\n',
  });
  const mech = (id, key) => ({
    id,
    kind: 'auth-mechanism',
    module: P,
    export: 'build',
    ...key,
    writes: true,
    closedBy: null,
    source: 'fixture',
  });
  const entries = [
    mech('pw', { configKey: 'emailAndPassword' }),
    mech('gh', { configKey: 'socialProviders.github' }),
    mech('otp', { plugin: 'better-auth/plugins/email-otp#emailOTP' }),
    mech('local', { plugin: 'apps/web/src/lib/auth/local-plugin#local' }),
    mech('stale', { plugin: 'better-auth/plugins#twoFactor' }),
  ];
  const found = ids(runCheck('CHK-26', root, registryOf(entries))).filter(
    id => !id.endsWith('#no-closure')
  );
  assert.deepEqual(found.sort(byCodeUnit), [
    `auth-missing@${P}#build#plugin(better-auth/plugins#twoFactor)`,
    `auth-unlisted@${P}#build#plugin(better-auth/plugins#magicLink)`,
  ]);
});
