// prettier-ignore
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const KEY = 'interdomestik_free_start_recovery_v1';
const LOCK = 'interdomestik:free-start:anonymous-draft:v1';
// prettier-ignore
type BarrierWindow = Window & { __idaHeld?: boolean; __idaRelease?: () => void };

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
async function expectPending(page: Page, count: number) {
  await expect.poll(() => page.evaluate(lock => navigator.locks.query().then(value => (value.pending ?? []).filter(item => item.name === lock).length), LOCK)).toBe(count);
}

test.describe('pre-membership Free Start recovery', () => {
  // prettier-ignore
  test('restores every eligible fact after a cold same-browser return', async ({ browser }, info) => {
    const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async first => {
      const organizer = await openOrganizer(first, ida); await selectVehicle(organizer);
      await organizer.getByRole('button', { name: 'Continue to guided intake' }).click(); await organizer.getByLabel('What happened?').selectOption('collision'); await organizer.getByLabel('When did it happen?').fill('2026-07-15');
      await organizer.getByLabel('Who are you dealing with?').fill('Northwind Insurance'); await organizer.getByLabel('What do you want to recover?').selectOption('repair'); await organizer.getByLabel('Brief summary').fill('Rear bumper damage after a low-speed collision.');
      await organizer.getByRole('button', { name: 'Review your summary' }).click();
      const returned = await first.context().newPage(); await first.close(); const next = await openOrganizer(returned, ida);
      await next.getByRole('button', { name: 'Continue with these notes' }).click();
      await expect(next.getByRole('heading', { name: 'Review your Free Start pack shell.' })).toBeVisible();
      await Promise.all(['Vehicle damage', 'Collision damage', '2026-07-15', 'Northwind Insurance', 'Repair or replacement costs', 'Rear bumper damage after a low-speed collision.'].map(value => expect(next).toContainText(value)));
    });
  });

  // prettier-ignore
  test('serializes production writes in both page orders and starts a fresh epoch after sibling discard', async ({ browser }, info) => {
    test.setTimeout(300_000);
    const ida = resolveIdaTarget(info);
    for (const reverse of [false, true]) {
      await withPage(browser, ida, async seed => {
        const seedOrganizer = await openOrganizer(seed, ida);
        await selectVehicle(seedOrganizer);
        await seedOrganizer.getByRole('button', { name: 'Continue to guided intake' }).click();
        await seedOrganizer.getByLabel('Brief summary').fill('Shared seed.');
        await expect.poll(() => seed.evaluate(key => localStorage.getItem(key), KEY)).toContain('Shared seed.');
        const first = await seed.context().newPage(), firstOrganizer = await openOrganizer(first, ida);
        const second = await seed.context().newPage(), secondOrganizer = await openOrganizer(second, ida);
        await seed.close();
        await firstOrganizer.getByRole('button', { name: 'Continue with these notes' }).click();
        await secondOrganizer.getByRole('button', { name: 'Continue with these notes' }).click();
        await expect(firstOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0);
        await expect(secondOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0);
        const fields = reverse ? [secondOrganizer, firstOrganizer] : [firstOrganizer, secondOrganizer];
        await holdLock(first);
        await fields[0].getByLabel('Brief summary').fill(`Older ${reverse}.`);
        await expectPending(first, 1);
        await fields[1].getByLabel('Brief summary').fill(`Newest ${reverse}.`);
        await expectPending(first, 2);
        await releaseLock(first);
        await expect.poll(() => first.evaluate(key => localStorage.getItem(key), KEY)).toContain(`Newest ${reverse}.`);
      });
    }
    for (const reverse of [false, true]) {
      await withPage(browser, ida, async seed => {
        const seedOrganizer = await openOrganizer(seed, ida); await selectVehicle(seedOrganizer); await seedOrganizer.getByRole('button', { name: 'Continue to guided intake' }).click(); await seedOrganizer.getByLabel('Brief summary').fill('Discard seed.');
        const first = await seed.context().newPage(), firstOrganizer = await openOrganizer(first, ida); const second = await seed.context().newPage(), secondOrganizer = await openOrganizer(second, ida); await seed.close(); await firstOrganizer.getByRole('button', { name: 'Continue with these notes' }).click(); await secondOrganizer.getByRole('button', { name: 'Continue with these notes' }).click(); await expect(firstOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0); await expect(secondOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0); await holdLock(first);
        const discard = () => secondOrganizer.getByRole('button', { name: 'Discard from this device' }).evaluate(button => (button as HTMLButtonElement).click()), edit = () => firstOrganizer.getByLabel('Brief summary').fill(`Edit survives discard ${reverse}.`); if (reverse) { await edit(); await expectPending(first, 1); await discard(); } else { await discard(); await expectPending(first, 1); await edit(); } await expectPending(first, 2); await releaseLock(first);
        await expect.poll(() => first.evaluate(key => localStorage.getItem(key), KEY)).toContain(`Edit survives discard ${reverse}.`);
      });
    }
    for (const reverse of [false, true]) {
      await withPage(browser, ida, async seed => {
        const seedOrganizer = await openOrganizer(seed, ida); await selectVehicle(seedOrganizer); await seedOrganizer.getByRole('button', { name: 'Continue to guided intake' }).click(); await seedOrganizer.getByLabel('Brief summary').fill('Cleanup seed.');
        const first = await seed.context().newPage(), firstOrganizer = await openOrganizer(first, ida); const second = await seed.context().newPage(), secondOrganizer = await openOrganizer(second, ida); await seed.close(); await firstOrganizer.getByRole('button', { name: 'Continue with these notes' }).click(); await secondOrganizer.getByRole('button', { name: 'Continue with these notes' }).click(); await expect(firstOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0); await expect(secondOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0); await holdLock(first);
        const corrupt = () => first.evaluate(key => localStorage.setItem(key, '{'), KEY), edit = () => firstOrganizer.getByLabel('Brief summary').fill(`Edit survives cleanup ${reverse}.`); if (reverse) { await edit(); await expectPending(first, 1); await corrupt(); } else { await corrupt(); await expectPending(first, 1); await edit(); } await expectPending(first, 2); await releaseLock(first);
        await expect.poll(() => first.evaluate(key => localStorage.getItem(key), KEY)).toContain(`Edit survives cleanup ${reverse}.`);
      });
    }
    await withPage(browser, ida, async first => {
      const firstOrganizer = await openOrganizer(first, ida);
      await selectVehicle(firstOrganizer);
      const second = await first.context().newPage(), secondOrganizer = await openOrganizer(second, ida);
      await secondOrganizer.getByRole('button', { name: 'Continue with these notes' }).click();
      await secondOrganizer.getByRole('button', { name: 'Discard from this device' }).click();
      await expect(firstOrganizer).toHaveAttribute('data-save-behavior', 'explicit-only');
      await firstOrganizer.getByRole('button', { name: 'Start another draft' }).click();
      await selectVehicle(firstOrganizer);
      await firstOrganizer.getByRole('button', { name: 'Continue to guided intake' }).click();
      await firstOrganizer.getByLabel('Brief summary').fill('Fresh epoch facts.');
      await expect.poll(() => first.evaluate(key => localStorage.getItem(key), KEY)).toContain('Fresh epoch facts.');
      await first.evaluate(key => localStorage.setItem(key, '{'), KEY);
      await first.reload();
      await openOrganizer(first, ida);
      await expect.poll(() => first.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
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
