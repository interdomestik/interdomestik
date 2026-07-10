import { createRequire } from 'node:module';

import { startConsoleServer } from '../server/start.mjs';

const requireFromWeb = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { expect, test } = requireFromWeb('@playwright/test');

let origin;
let server;

test.beforeAll(async () => {
  server = await startConsoleServer({ port: 0 });
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('loads complete fixture bundles under connect-src none without fetch or XHR', async ({
  page,
}) => {
  await page.addInitScript(() => {
    globalThis.fixtureNetworkCalls = { fetch: 0, xhr: 0 };
    globalThis.fetch = () => {
      globalThis.fixtureNetworkCalls.fetch += 1;
      throw new Error('fetch must not be called');
    };
    globalThis.XMLHttpRequest = class {
      constructor() {
        globalThis.fixtureNetworkCalls.xhr += 1;
        throw new Error('XMLHttpRequest must not be constructed');
      }
    };
  });

  const response = await page.goto(origin);
  expect(response.headers()['content-security-policy']).toContain("connect-src 'none'");
  const result = await page.evaluate(async () => {
    const { createFixtureRepository } = await import('/src/data/fixture-repository.mjs');
    const repository = createFixtureRepository();
    const bundles = await Promise.all([
      repository.loadAssignmentBundle('assign_mob03a_part_a'),
      repository.loadAssignmentBundle('assign_mob03a_part_b'),
    ]);
    return {
      bundleIds: bundles.map(bundle => bundle.value.packet.id),
      itemCounts: bundles.map(bundle => bundle.value.packet.items.length),
      networkCalls: globalThis.fixtureNetworkCalls,
    };
  });

  expect(result).toEqual({
    bundleIds: ['mob-03a-part-a', 'mob-03a-part-b'],
    itemCounts: [4, 4],
    networkCalls: { fetch: 0, xhr: 0 },
  });
});
