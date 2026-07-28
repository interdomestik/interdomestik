// prettier-ignore
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const KEY = 'interdomestik_free_start_recovery_v1';
const LOCK = 'interdomestik:free-start:anonymous-draft:v1';
// prettier-ignore
type BarrierWindow = Window & { __idaHeld?: boolean; __idaRelease?: () => void; __idaResults?: Record<string, string> };

// prettier-ignore
function resolveIdaTarget(info: TestInfo): TestInfo {
  const explicit = process.env.IDA_RECOVERY_ORIGIN?.trim();
  const configured = explicit || process.env.IDA_HOST?.trim() || 'ida.127.0.0.1.nip.io:3000';
  const target = new URL(configured.includes('://') ? configured : `http://${configured}`);
  if (!explicit && target.hostname === 'ida.127.0.0.1.nip.io') target.hostname = 'ida.localhost';
  return { ...info, project: { ...info.project, use: { ...info.project.use, baseURL: `${target.origin}/${routes.getLocale(info)}`, extraHTTPHeaders: {}, ignoreHTTPSErrors: target.protocol === 'https:' || Boolean(info.project.use.ignoreHTTPSErrors) } } } as TestInfo;
}

// prettier-ignore
async function withPage(browser: Browser, info: TestInfo, callback: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, extraHTTPHeaders: info.project.use.extraHTTPHeaders, ignoreHTTPSErrors: Boolean(info.project.use.ignoreHTTPSErrors), storageState: undefined });
  try { await callback(await context.newPage()); } finally { await context.close(); }
}

// prettier-ignore
async function openOrganizer(page: Page, info: TestInfo, recovery = true) {
  const response = await gotoApp(page, routes.home('en'), info, { marker: 'free-start-intake-shell' });
  expect([200, 304]).toContain(response?.status());
  const organizer = page.getByTestId('premium-free-start-organizer');
  await expect(organizer).toBeVisible();
  if (recovery) {
    const capability = await page.evaluate(() => ({ locks: typeof navigator.locks?.request === 'function', origin: location.origin, secure: isSecureContext }));
    expect(capability).toEqual({ locks: true, origin: new URL(String(info.project.use.baseURL)).origin, secure: true });
  }
  return organizer;
}

// prettier-ignore
async function selectVehicle(organizer: Locator) {
  const vehicle = organizer.getByTestId('free-start-category-vehicle');
  await expect(async () => { await vehicle.click(); await expect(vehicle).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 }); }).toPass({ timeout: 10_000 });
}

// prettier-ignore
async function holdLock(page: Page) {
  await page.evaluate(lock => { const view = window as BarrierWindow; view.__idaHeld = false; void navigator.locks.request(lock, { mode: 'exclusive' }, () => new Promise<void>(resolve => { view.__idaHeld = true; view.__idaRelease = resolve; })); }, LOCK);
  await expect.poll(() => page.evaluate(() => Boolean((window as BarrierWindow).__idaHeld))).toBe(true);
}

// prettier-ignore
async function releaseLock(page: Page) {
  await page.evaluate(() => { const view = window as BarrierWindow; view.__idaRelease?.(); view.__idaRelease = undefined; view.__idaHeld = false; });
}

// prettier-ignore
async function queueMutation(page: Page, id: string, op: 'remove' | 'write', expected: string, value = '', pending = 1) {
  await page.evaluate(({ expected, id, key, lock, op, value }) => { const view = window as BarrierWindow; const results = view.__idaResults ??= {}; results[id] = 'pending'; void navigator.locks.request(lock, { mode: 'exclusive' }, () => { const current = localStorage.getItem(key); if (op === 'remove') { if (current === expected) { localStorage.removeItem(key); results[id] = 'removed'; } else results[id] = 'changed'; return; } let currentTime = -Infinity; try { currentTime = Date.parse(JSON.parse(current ?? '').updatedAt); } catch {} const candidateTime = Date.parse(JSON.parse(value).updatedAt); if (currentTime >= candidateTime) results[id] = 'conflict'; else { localStorage.setItem(key, value); results[id] = 'saved'; } }); }, { expected, id, key: KEY, lock: LOCK, op, value });
  await expect.poll(() => page.evaluate(lock => navigator.locks.query().then(value => value.pending.filter(item => item.name === lock).length), LOCK)).toBe(pending);
}

// prettier-ignore
async function result(page: Page, id: string, expected: string) {
  await expect.poll(() => page.evaluate(key => (window as BarrierWindow).__idaResults?.[key], id)).toBe(expected);
}

test.describe('pre-membership Free Start recovery', () => {
  // prettier-ignore
  test('restores every eligible fact after a cold same-browser return', async ({ browser }, info) => {
    const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async first => {
      const organizer = await openOrganizer(first, ida);
      await selectVehicle(organizer);
      await organizer.getByRole('button', { name: 'Continue to guided intake' }).click();
      await organizer.getByLabel('What happened?').selectOption('collision');
      await organizer.getByLabel('When did it happen?').fill('2026-07-15');
      await organizer.getByLabel('Who are you dealing with?').fill('Northwind Insurance');
      await organizer.getByLabel('What do you want to recover?').selectOption('repair');
      await organizer.getByLabel('Brief summary').fill('Rear bumper damage after a low-speed collision.');
      await organizer.getByRole('button', { name: 'Review your summary' }).click();
      const returned = await first.context().newPage();
      await first.close();
      const next = await openOrganizer(returned, ida);
      await next.getByRole('button', { name: 'Continue with these notes' }).click();
      await expect(next.getByRole('heading', { name: 'Review your Free Start pack shell.' })).toBeVisible();
      await expect(next).toContainText(/Collision damage|Northwind Insurance|Rear bumper damage/);
    });
  });

  // prettier-ignore
  test('serializes two-page writes, conditional removals and invalid cleanup in both grant orders', async ({ browser }, info) => {
    const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async first => {
      const organizer = await openOrganizer(first, ida);
      await selectVehicle(organizer);
      await expect(organizer.getByTestId('anonymous-draft-recovery-status')).toBeVisible();
      const second = await first.context().newPage();
      const returned = await openOrganizer(second, ida);
      await expect(returned.getByTestId('anonymous-draft-recovery-offer')).toBeVisible();
      const seed = await first.evaluate(key => localStorage.getItem(key), KEY);
      expect(seed && await second.evaluate(key => localStorage.getItem(key), KEY)).toBe(seed);
      if (!seed) throw new Error('missing shared seed');
      const origin = new URL(String(ida.project.use.baseURL)).origin;
      await Promise.all([first.goto(`${origin}/api/health`), second.goto(`${origin}/api/health`)]);
      const record = JSON.parse(seed), candidate = (summary: string, offset: number) => JSON.stringify({ ...record, draft: { ...record.draft, summary }, updatedAt: new Date(Date.parse(record.updatedAt) + offset).toISOString(), expiresAt: new Date(Date.parse(record.expiresAt) + offset).toISOString() });
      const older = candidate('Older candidate.', 10), newest = candidate('Newest candidate.', 20);
      for (const order of [[older, newest], [newest, older]] as const) {
        await first.evaluate(({ key, seed }) => localStorage.setItem(key, seed), { key: KEY, seed });
        await holdLock(first);
        await queueMutation(second, 'first-write', 'write', seed, order[0]);
        await queueMutation(first, 'second-write', 'write', seed, order[1], 2);
        await result(second, 'first-write', 'pending'); await result(first, 'second-write', 'pending');
        await releaseLock(first);
        await result(second, 'first-write', 'saved'); await result(first, 'second-write', order[0] === newest ? 'conflict' : 'saved');
        expect(await first.evaluate(key => localStorage.getItem(key), KEY)).toBe(newest);
      }
      for (const order of ['remove-first', 'write-first'] as const) {
        await first.evaluate(({ key, seed }) => localStorage.setItem(key, seed), { key: KEY, seed });
        await holdLock(first);
        const calls = order === 'remove-first' ? [[second, 'remove', 'remove', seed, ''], [first, 'write', 'write', seed, newest]] as const : [[second, 'write', 'write', seed, newest], [first, 'remove', 'remove', seed, '']] as const;
        for (const [index, [page, id, op, expected, value]] of calls.entries()) await queueMutation(page, id, op, expected, value, index + 1);
        await releaseLock(first);
        await result(calls[0][0], calls[0][1], order === 'remove-first' ? 'removed' : 'saved');
        await result(calls[1][0], calls[1][1], order === 'remove-first' ? 'saved' : 'changed');
        expect(await second.evaluate(key => localStorage.getItem(key), KEY)).toBe(newest);
      }
      for (const invalid of ['', '{', JSON.stringify({ ...record, expiresAt: '2000-01-01T00:00:00.000Z' }), JSON.stringify({ ...record, updatedAt: new Date(Date.now() + 60_001).toISOString() })]) {
        await first.evaluate(({ invalid, key }) => localStorage.setItem(key, invalid), { invalid, key: KEY });
        await holdLock(first); await queueMutation(second, 'cleanup', 'remove', invalid); await queueMutation(first, 'valid', 'write', invalid, newest, 2); await releaseLock(first);
        await result(second, 'cleanup', 'removed'); await result(first, 'valid', 'saved');
        expect(await first.evaluate(key => localStorage.getItem(key), KEY)).toBe(newest);
      }
      const final = await openOrganizer(second, ida);
      await expect(final.getByTestId('anonymous-draft-recovery-offer')).toBeVisible();
    });
  });

  // prettier-ignore
  test('keeps discard, generic hosts, no-JavaScript and storage denial truthful', async ({ browser }, info) => {
    const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async page => { const organizer = await openOrganizer(page, ida); await selectVehicle(organizer); await page.reload(); const returned = page.getByTestId('premium-free-start-organizer'); await returned.getByRole('button', { name: 'Discard from this device' }).click(); await expect(returned.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0); expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull(); });
    await withPage(browser, info, async page => { const organizer = await openOrganizer(page, info, false); await selectVehicle(organizer); await expect(organizer).toHaveAttribute('data-save-behavior', 'explicit-only'); expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull(); });
    const noJs = await browser.newContext({ baseURL: ida.project.use.baseURL, extraHTTPHeaders: ida.project.use.extraHTTPHeaders, ignoreHTTPSErrors: Boolean(ida.project.use.ignoreHTTPSErrors), javaScriptEnabled: false, storageState: undefined });
    try { const page = await noJs.newPage(); await gotoApp(page, routes.home('en'), ida, { marker: 'free-start-intake-shell' }); await expect(page.getByTestId('premium-free-start-organizer')).not.toContainText('can recover here for 30 days'); } finally { await noJs.close(); }
    await withPage(browser, ida, async page => { await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('blocked', 'SecurityError'); } })); const organizer = await openOrganizer(page, ida); await selectVehicle(organizer); await expect(organizer).toHaveAttribute('data-save-behavior', 'explicit-only'); await expect(organizer).toContainText('Browser recovery is unavailable'); });
  });
});
