import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './strict-firefox.fixture.mjs';
import { readOwned, readPinned } from '../image-custody.mjs';
import { assertOwnedBrowserOutput, browserRowsComplete } from '../browser-output.mjs';
import { readPlan } from '../app/fixture-plan.js';
const plan = readPlan();
const identities = JSON.parse(readOwned(process.env.M4_COMPILED_BROWSER_COOKIE_FILE, 32768, true));
if (
  identities.version !== 1 ||
  identities.cases?.length !== 3 ||
  identities.cases.some(
    (row, i) =>
      row.profile !== plan.scenarios[i].profile ||
      !Array.isArray(row.cookies) ||
      row.cookies.length < 1 ||
      row.cookies.length > 4 ||
      row.cookies.some(
        c =>
          Object.keys(c).sort().join('|') !== 'name|value' ||
          typeof c.name !== 'string' ||
          typeof c.value !== 'string' ||
          c.name.length > 256 ||
          c.value.length > 8192 ||
          /[\r\n\u0000]/u.test(c.name + c.value)
      )
  )
)
  throw Error('Owned browser cookie fixture refused');
const map = readPinned(
  path.join(import.meta.dirname, '../m4-build-image.json'),
  process.env.M4_COMPILED_IMAGE_MANIFEST_SHA256,
  32 * 1024 * 1024
).actionMap;
test.describe.configure({ mode: 'serial' });
const exports = ['runAdminAssignment', 'runAgentAssignment', 'runStaffAssignment'];
const results = [];
let denial;
test.afterAll(async () => {
  const output = assertOwnedBrowserOutput(process.env.M4_COMPILED_BROWSER_OUTPUT);
  fs.writeFileSync(
    output + '/observed-actions.json',
    JSON.stringify(
      {
        version: 1,
        qualificationOnly: true,
        rows: results,
        denial,
        complete: browserRowsComplete(results, denial),
        SQLOraclesExecutedHere: false,
        nativeAdmission: false,
        productionCCredit: 0,
      },
      null,
      2
    ) + '\n',
    { flag: 'wx', mode: 0o600 }
  );
});
for (const [index, scenario] of plan.scenarios.entries()) {
  test(
    'actual compiled ' + scenario.profile + ' action and cache',
    async ({ browser, baseURL }) => {
      const context = await browser.newContext({
        baseURL,
        ignoreHTTPSErrors: false,
      });
      const cookie = identities.cases[index].cookies.map(row => ({
        ...row,
        url: baseURL,
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      }));
      await context.addCookies(cookie);
      const page = await context.newPage(),
        calls = [];
      page.on('request', request => {
        if (request.method() === 'POST' && request.headers()['next-action'])
          calls.push(request.headers()['next-action']); // Observe framework-produced references only.
      });
      const area = scenario.profile === 'staff' ? 'staff' : 'admin';
      const url = '/sq/' + area + '/claims/' + encodeURIComponent(scenario.claimId);
      try {
        await page.goto(url);
        const probe = page.getByTestId('cache-witness');
        const first = await probe.getAttribute('data-cache-token');
        const firstWitness = JSON.parse(await probe.textContent());
        expect(firstWitness).toMatchObject({
          runId: plan.runId,
          profile: scenario.profile,
          claimId: scenario.claimId,
          token: first,
        });
        expect(first).toBeTruthy();
        await page.reload();
        await expect(probe).toHaveAttribute('data-cache-token', first);
        const identity = page.getByTestId('operation-id');
        await expect(identity).not.toHaveValue('');
        const operationId = await identity.inputValue();
        await page.getByTestId('execute').click();
        const state = page.getByTestId('action-result');
        await expect(state).toContainText('"success":true');
        const returned = JSON.parse(await state.textContent());
        expect(returned.operationId).toBe(operationId);
        expect(returned.outcome).toBe('settled');
        await expect(probe).not.toHaveAttribute('data-cache-token', first);
        const refreshed = await probe.getAttribute('data-cache-token');
        const nextWitness = JSON.parse(await probe.textContent());
        expect(nextWitness).toMatchObject({
          runId: plan.runId,
          profile: scenario.profile,
          claimId: scenario.claimId,
          token: refreshed,
          generation: firstWitness.generation + 1,
        });
        await page.reload();
        await expect(identity).toHaveValue(operationId);
        await expect(probe).toHaveAttribute('data-cache-token', refreshed);
        expect(calls).toHaveLength(1);
        expect(map.exports[calls[0]]).toBe(exports[index]);
        results.push({
          profile: scenario.profile,
          claimId: scenario.claimId,
          operationId,
          frameworkActionId: calls[0],
          firstCacheToken: first,
          refreshedCacheToken: refreshed,
          warmHit: true,
          refreshedHit: true,
          browserResult: returned,
        });
      } finally {
        await context.close();
      }
    }
  );
}
test('missing cookie denies without cache invalidation', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: false,
  });
  try {
    const page = await context.newPage(),
      scenario = plan.scenarios[0];
    await page.goto('/sq/admin/claims/' + encodeURIComponent(scenario.claimId));
    const probe = page.getByTestId('cache-witness'),
      token = await probe.getAttribute('data-cache-token');
    await page.reload();
    await expect(probe).toHaveAttribute('data-cache-token', token);
    const calls = [];
    page.on('request', request => {
      if (request.method() === 'POST' && request.headers()['next-action'])
        calls.push(request.headers()['next-action']);
    });
    await expect(page.getByTestId('operation-id')).not.toHaveValue('');
    const operationId = await page.getByTestId('operation-id').inputValue();
    await page.getByTestId('execute').click();
    await expect(page.getByTestId('action-result')).toContainText('Unauthorized');
    const browserResult = JSON.parse(await page.getByTestId('action-result').textContent());
    await page.reload();
    await expect(probe).toHaveAttribute('data-cache-token', token);
    expect(calls).toHaveLength(1);
    expect(map.exports[calls[0]]).toBe('runAdminAssignment');
    denial = {
      profile: scenario.profile,
      claimId: scenario.claimId,
      operationId,
      frameworkActionId: calls[0],
      firstCacheToken: token,
      refreshedCacheToken: await probe.getAttribute('data-cache-token'),
      warmHit: true,
      browserResult,
      expectedDurableRows: 0,
    };
  } finally {
    await context.close();
  }
});
