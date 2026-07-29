import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
// prettier-ignore
import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from '@playwright/test';

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
type Pair = Readonly<{
  first: Page;
  firstOrganizer: Locator;
  second: Page;
  secondOrganizer: Locator;
}>;
// prettier-ignore
async function seededPair(context: BrowserContext, info: TestInfo, summary: string): Promise<Pair> {
  const seed = await context.newPage(); await seed.addInitScript(key => localStorage.removeItem(key), KEY);
  const seedOrganizer = await openOrganizer(seed, info); await selectVehicle(seedOrganizer); await seedOrganizer.getByRole('button', { name: 'Continue to guided intake' }).click(); await seedOrganizer.getByLabel('Brief summary').fill(summary); await expect.poll(() => seed.evaluate(key => localStorage.getItem(key), KEY)).toContain(summary);
  const first = await context.newPage(), firstOrganizer = await openOrganizer(first, info); const second = await context.newPage(), secondOrganizer = await openOrganizer(second, info); await seed.close();
  await firstOrganizer.getByRole('button', { name: 'Continue with these notes' }).click(); await secondOrganizer.getByRole('button', { name: 'Continue with these notes' }).click(); await expect(firstOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0); await expect(secondOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0);
  return { first, firstOrganizer, second, secondOrganizer };
}
// prettier-ignore
async function closePair(pair: Pair) { await pair.second.close(); await pair.first.close(); }
// prettier-ignore
async function installInvalid(page: Page, kind: 'empty' | 'expired' | 'future' | 'malformed') {
  await page.evaluate(({ key, kind, ttl }) => { const now = Date.now(); if (kind === 'empty' || kind === 'malformed') return localStorage.setItem(key, kind === 'empty' ? '' : '{'); const record = JSON.parse(localStorage.getItem(key) ?? '{}') as { expiresAt: string; updatedAt: string }; const updated = kind === 'expired' ? now - ttl - 1 : now + 60_001; record.updatedAt = new Date(updated).toISOString(); record.expiresAt = new Date(updated + ttl).toISOString(); localStorage.setItem(key, JSON.stringify(record)); }, { key: KEY, kind, ttl: 30 * 24 * 60 * 60 * 1_000 });
}
// prettier-ignore
async function freshLogin(page: Page, info: TestInfo) {
  const origin = new URL(String(info.project.use.baseURL)).origin;
  const response = await page.request.post(`${origin}/api/auth/sign-in/email`, { data: { email: E2E_USERS.KS_MEMBER.email, password: E2E_PASSWORD, additionalData: { tenantId: 'tenant_ks' } }, headers: { Origin: origin, Referer: `${origin}${routes.login(info)}`, 'x-tenant-id': 'tenant_ks' } });
  expect(response.ok()).toBe(true);
}
// prettier-ignore
async function deleteSavedDraft(page: Page, organizer: Locator, summary: string) {
  await organizer.getByTestId('free-start-manage-open').click(); const row = page.locator('[data-testid^="free-start-draft-"]').filter({ hasText: summary }); await expect(row).toHaveCount(1); await row.locator('[data-testid^="free-start-delete-"]').click(); await page.getByTestId('free-start-delete-confirm').click(); await expect(organizer.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'deleted'); await expect(row).toHaveCount(0);
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
  test('serializes writes and discard in both page orders and starts a fresh epoch', async ({ browser }, info) => {
    test.setTimeout(300_000); const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async keeper => {
      for (const reverse of [false, true]) { const pair = await seededPair(keeper.context(), ida, `Shared seed ${reverse}.`); const fields = reverse ? [pair.secondOrganizer, pair.firstOrganizer] : [pair.firstOrganizer, pair.secondOrganizer]; await holdLock(pair.first); await fields[0].getByLabel('Brief summary').fill(`Older ${reverse}.`); await expectPending(pair.first, 1); await fields[1].getByLabel('Brief summary').fill(`Newest ${reverse}.`); await expectPending(pair.first, 2); await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(`Newest ${reverse}.`); await closePair(pair); }
      for (const reverse of [false, true]) { const pair = await seededPair(keeper.context(), ida, `Discard seed ${reverse}.`); await holdLock(pair.first); const discard = () => pair.secondOrganizer.getByRole('button', { name: 'Discard from this device' }).evaluate(button => (button as HTMLButtonElement).click()), edit = () => pair.firstOrganizer.getByLabel('Brief summary').fill(`Edit survives discard ${reverse}.`); if (reverse) { await edit(); await expectPending(pair.first, 1); await discard(); } else { await discard(); await expectPending(pair.first, 1); await edit(); } await expectPending(pair.first, 2); await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(`Edit survives discard ${reverse}.`); await closePair(pair); }
      const pair = await seededPair(keeper.context(), ida, 'Fresh epoch seed.'); await pair.secondOrganizer.getByRole('button', { name: 'Discard from this device' }).click(); await expect(pair.firstOrganizer).toHaveAttribute('data-save-behavior', 'explicit-only'); await pair.firstOrganizer.getByRole('button', { name: 'Start another draft' }).click(); await selectVehicle(pair.firstOrganizer); await pair.firstOrganizer.getByRole('button', { name: 'Continue to guided intake' }).click(); await pair.firstOrganizer.getByLabel('Brief summary').fill('Fresh epoch facts.'); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain('Fresh epoch facts.'); await pair.first.evaluate(key => localStorage.setItem(key, '{'), KEY); await pair.first.reload(); await openOrganizer(pair.first, ida); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toBeNull(); await closePair(pair);
    });
  });

  // prettier-ignore
  test('conditionally cleans every invalid record without deleting a concurrent valid write', async ({ browser }, info) => {
    test.setTimeout(600_000); const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async keeper => {
      for (const kind of ['malformed', 'empty', 'expired', 'future'] as const) for (const reverse of [false, true]) { const pair = await seededPair(keeper.context(), ida, `${kind} seed ${reverse}.`); await holdLock(pair.first); const cleanup = () => installInvalid(pair.second, kind), edit = () => pair.secondOrganizer.getByLabel('Brief summary').fill(`${kind} valid edit ${reverse}.`); if (reverse) { await edit(); await expectPending(pair.first, 1); await cleanup(); } else { await cleanup(); await expectPending(pair.first, 1); await edit(); } await expectPending(pair.first, 2); await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(`${kind} valid edit ${reverse}.`); await expect(pair.firstOrganizer.getByTestId('anonymous-draft-recovery-offer')).toBeVisible(); await pair.firstOrganizer.getByRole('button', { name: 'Continue with these notes' }).click(); await expect(pair.firstOrganizer.getByLabel('Brief summary')).toHaveValue(`${kind} valid edit ${reverse}.`); await closePair(pair); }
    });
  });

  // prettier-ignore
  test('keeps later edits across secure promotion and deliberate reset in both orders', async ({ browser }, info) => {
    test.setTimeout(600_000); const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async keeper => {
      await freshLogin(keeper, ida);
      for (const reverse of [false, true]) { const seed = `Secure seed ${reverse}-${Date.now()}.`, pair = await seededPair(keeper.context(), ida, seed); await holdLock(pair.first); const save = () => pair.firstOrganizer.getByTestId('free-start-save-open').evaluate(button => (button as HTMLButtonElement).click()), edit = () => pair.secondOrganizer.getByLabel('Brief summary').fill(`Promotion edit ${reverse}.`); if (reverse) { await edit(); await expectPending(pair.first, 1); await save(); } else { await save(); await expectPending(pair.first, 1); await edit(); } await expectPending(pair.first, 2); await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(`Promotion edit ${reverse}.`); await expect(pair.firstOrganizer.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'saved'); await holdLock(pair.first); const reset = () => pair.firstOrganizer.getByTestId('free-start-start-another').evaluate(button => (button as HTMLButtonElement).click()), later = () => pair.secondOrganizer.getByLabel('Brief summary').fill(`Reset edit ${reverse}.`); if (reverse) { await later(); await expectPending(pair.first, 1); await reset(); } else { await reset(); await expectPending(pair.first, 1); await later(); } await expectPending(pair.first, 2); await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(`Reset edit ${reverse}.`); await expectPending(pair.first, 0); await deleteSavedDraft(pair.first, pair.firstOrganizer, seed); await closePair(pair); }
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
