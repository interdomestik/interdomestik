import { createRequire } from 'node:module';

import { startBrowserPortalServer } from './browser-auth-fixture.mjs';

const requireFromWeb = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { expect, test } = requireFromWeb('@playwright/test');
let origin;
let server;

test.beforeAll(async () => ({ origin, server } = await startBrowserPortalServer()));
test.afterAll(async () => new Promise(resolve => server.close(resolve)));

test('server-only fixtures and source maps are unreachable from the browser', async ({ request }) => {
  for (const path of [
    '/data/assignments.json',
    '/server/fixtures/data/assignments.json',
    '/data/items/m03a-medical-boundary.mjs',
    '/src/app.mjs.map',
  ]) {
    const response = await request.get(origin + path);
    expect([404, 415], path).toContain(response.status());
    expect(await response.text()).not.toMatch(/Gazmend|medical|assignment|packet/iu);
  }
});
