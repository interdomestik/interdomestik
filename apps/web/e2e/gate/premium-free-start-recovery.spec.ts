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
async function enterVehicleDetails(organizer: Locator) {
  const summary = organizer.getByLabel('Brief summary'); if (await summary.isVisible()) return;
  await organizer.getByTestId('free-start-category-vehicle').click(); const next = organizer.getByRole('button', { name: 'Continue to guided intake' }); if (await next.isVisible()) await next.click(); await expect(summary).toBeVisible();
}

// prettier-ignore
async function holdLock(page: Page) {
  await page.evaluate(lock => { const view = window as BarrierWindow; view.__idaHeld = false; void navigator.locks.request(lock, { mode: 'exclusive' }, () => new Promise<void>(resolve => { view.__idaHeld = true; view.__idaRelease = resolve; })); }, LOCK);
  await expect.poll(() => page.evaluate(() => Boolean((window as BarrierWindow).__idaHeld))).toBe(true);
}

// prettier-ignore
async function releaseLock(page: Page, count = 2) { const observed = await page.evaluate(async ({ lock, pending }) => { const view = window as BarrierWindow; for (let attempt = 0; attempt < 100; attempt += 1) { const state = await navigator.locks.query(), current = (state.pending ?? []).filter(item => item.name === lock).length; if (current === pending) { view.__idaRelease?.(); view.__idaRelease = undefined; view.__idaHeld = false; return current; } await new Promise(resolve => setTimeout(resolve, 10)); } return -1; }, { lock: LOCK, pending: count }); expect(observed).toBe(count); }

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
type AuthState = Readonly<{ cookie: string; token: string }>;
const authStates = new WeakMap<BrowserContext, AuthState>();
// prettier-ignore
async function seededPair(context: BrowserContext, info: TestInfo, summary: string): Promise<Pair> {
  const seed = await context.newPage(); await seed.addInitScript(key => localStorage.removeItem(key), KEY);
  const seedOrganizer = await openOrganizer(seed, info); await enterVehicleDetails(seedOrganizer); await seedOrganizer.getByLabel('Brief summary').fill(summary); await expect.poll(() => seed.evaluate(key => localStorage.getItem(key), KEY)).toContain(summary);
  const first = await context.newPage(), firstOrganizer = await openOrganizer(first, info); const second = await context.newPage(), secondOrganizer = await openOrganizer(second, info); await seed.close();
  await expect(firstOrganizer.getByTestId('free-start-recovery-editor')).toHaveAttribute('inert', ''); await expect(firstOrganizer.getByTestId('free-start-recovery-secure-actions')).toHaveAttribute('inert', ''); await firstOrganizer.getByRole('button', { name: 'Continue with these notes' }).click(); await secondOrganizer.getByRole('button', { name: 'Continue with these notes' }).click(); await expect(firstOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0); await expect(secondOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0);
  return { first, firstOrganizer, second, secondOrganizer };
}
// prettier-ignore
async function closePair(pair: Pair) { await pair.second.close(); await pair.first.close(); }
// prettier-ignore
async function installInvalid(page: Page, kind: 'empty' | 'expired' | 'future' | 'malformed', fixedNow?: number) {
  await page.evaluate(({ key, kind, now, ttl }) => { if (kind === 'empty' || kind === 'malformed') return localStorage.setItem(key, kind === 'empty' ? '' : '{'); const record = JSON.parse(localStorage.getItem(key) ?? '{}') as { expiresAt: string; updatedAt: string }; const updated = kind === 'expired' ? now - ttl - 1 : now + 60_001; record.updatedAt = new Date(updated).toISOString(); record.expiresAt = new Date(updated + ttl).toISOString(); localStorage.setItem(key, JSON.stringify(record)); }, { key: KEY, kind, now: fixedNow ?? Date.now(), ttl: 30 * 24 * 60 * 60 * 1_000 });
}
// prettier-ignore
async function authPost(info: TestInfo, path: string, data: unknown, cookie?: string) { const origin = new URL(String(info.project.use.baseURL)).origin, authOrigin = process.env.BETTER_AUTH_URL?.trim() || origin, response = await fetch(`${origin}/api/auth/${path}`, { body: JSON.stringify(data), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), Origin: authOrigin, Referer: `${origin}${routes.login(info)}`, 'x-tenant-id': 'tenant_ks' }, method: 'POST', redirect: 'manual' }); let body: unknown; try { body = await response.json(); } catch { body = null; } const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []; return { body, ok: response.ok, origin, setCookies, status: response.status, statusText: response.statusText }; }
// prettier-ignore
async function freshLogin(page: Page, info: TestInfo) { const result = await authPost(info, 'sign-in/email', { email: E2E_USERS.KS_MEMBER.email, password: E2E_PASSWORD, additionalData: { tenantId: 'tenant_ks' } }), token = (result.body as { token?: unknown } | null)?.token, cookie = result.setCookies.find(value => /session_token=/i.test(value))?.split(';', 1)[0]; if (!result.ok || typeof token !== 'string' || !cookie) throw new Error(`fresh login failed: ${result.status} ${result.statusText}`); const separator = cookie.indexOf('='); await page.context().addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: result.origin }]); authStates.set(page.context(), { cookie, token }); }
// prettier-ignore
async function freshLogout(page: Page, info: TestInfo) { const context = page.context(), state = authStates.get(context); if (!state) throw new Error('fresh logout failed: missing in-memory session'); const result = await authPost(info, 'revoke-session', { token: state.token }, state.cookie); if (!result.ok || (result.body as { status?: unknown } | null)?.status !== true) throw new Error(`fresh logout failed: ${result.status} ${result.statusText}`); authStates.delete(context); await context.clearCookies(); }
// prettier-ignore
async function deleteSavedDraft(page: Page, organizer: Locator, summary: string) {
  await organizer.getByTestId('free-start-manage-open').click(); await expect(page.locator('#free-start-manage-heading')).toBeVisible({ timeout: 10_000 }); const row = page.locator('[data-testid^="free-start-draft-"]').filter({ hasText: summary }), count = await row.count(); expect(count).toBeLessThanOrEqual(1); if (!count) return false; await row.locator('[data-testid^="free-start-delete-"]').click(); await page.getByTestId('free-start-delete-confirm').click(); await expect(organizer.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'deleted'); await expect(row).toHaveCount(0); return true;
}
// prettier-ignore
async function deleteSavedDrafts(page: Page, organizer: Locator, summaries: string[]) { const failures: string[] = []; for (const summary of summaries) try { await deleteSavedDraft(page, organizer, summary); } catch (error) { failures.push(`${summary}: ${String(error)}`); } expect(failures, 'every matching secure draft must be cleaned').toEqual([]); }
// prettier-ignore
async function expectSurvivor(offer: Locator, writer: Locator, summary: string, resume = true) {
  await expect(writer.getByTestId('anonymous-draft-recovery-status')).toContainText('Saved on this browser'); await expect(offer.getByTestId('anonymous-draft-recovery-offer')).toBeVisible(); if (!resume) return; await offer.getByRole('button', { name: 'Continue with these notes' }).click(); await expect(offer.getByLabel('Brief summary')).toHaveValue(summary);
}

test.use({ trace: 'off' });
test.describe('pre-membership Free Start recovery', () => {
  // prettier-ignore
  test('restores every eligible fact after a cold same-browser return', async ({ browser }, info) => {
    const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async first => {
      const organizer = await openOrganizer(first, ida); await enterVehicleDetails(organizer);
      await organizer.getByLabel('What happened?').selectOption('collision'); await organizer.getByLabel('When did it happen?').fill('2026-07-15');
      await organizer.getByLabel('Who are you dealing with?').fill('Northwind Insurance'); await organizer.getByLabel('What do you want to recover?').selectOption('repair'); await organizer.getByLabel('Brief summary').fill('Rear bumper damage after a low-speed collision.');
      await organizer.getByRole('button', { name: 'Review your summary' }).click();
      const returned = await first.context().newPage(); await first.close(); const next = await openOrganizer(returned, ida);
      await next.getByRole('button', { name: 'Continue with these notes' }).click();
      await expect(next.getByRole('heading', { name: 'Review your Free Start pack shell.' })).toBeVisible();
      await Promise.all(['Vehicle damage', 'Collision damage', '2026-07-15', 'Northwind Insurance', 'Repair or replacement costs', 'Rear bumper damage after a low-speed collision.'].map(value => expect(next).toContainText(value)));
    });
  });
  // prettier-ignore
  test('keeps recovery controls usable at 320px, 200% presentation and forced accessibility media', async ({ browser }, info) => { const ida = resolveIdaTarget(info); await withPage(browser, ida, async page => { await page.setViewportSize({ width: 320, height: 720 }); await page.context().addCookies([{ domain: new URL(String(ida.project.use.baseURL)).hostname, name: 'cookie_consent', path: '/', sameSite: 'Lax', value: 'necessary' }]); const organizer = await openOrganizer(page, ida), next = organizer.getByRole('button', { name: 'Continue to guided intake' }); await organizer.getByTestId('free-start-category-injury').click(); await next.click(); await organizer.getByLabel('Brief summary').fill('Fractured my arm at work.'); await organizer.getByRole('button', { name: 'Back to claim type' }).click(); await organizer.getByTestId('free-start-category-vehicle').click(); await expect(next).toBeVisible(); await next.click(); await expect(organizer.getByLabel('Brief summary')).toHaveValue(''); await organizer.getByLabel('Brief summary').fill('Accessible recovery facts.'); await expect.poll(() => page.evaluate(key => localStorage.getItem(key), KEY)).toContain('Accessible recovery facts.'); await page.reload(); await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' }); await page.addStyleTag({ content: '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}html{zoom:2}' }); const offer = page.getByTestId('anonymous-draft-recovery-offer'), resume = offer.getByRole('button', { name: 'Continue with these notes' }), discard = offer.getByRole('button', { name: 'Discard from this device' }); await expect(offer).toHaveAccessibleName('Continue notes from this browser?'); await resume.focus(); await expect(resume).toBeFocused(); expect(await resume.evaluate(element => { const style = getComputedStyle(element); return style.outlineStyle !== 'none' && style.outlineWidth !== '0px'; })).toBe(true); await page.keyboard.press('Tab'); await expect(discard).toBeFocused(); await expect(discard).toBeVisible(); expect(await offer.evaluate(element => { const viewport = document.documentElement.clientWidth, elements = [element, ...element.querySelectorAll('button')]; return elements.every(item => { const bounds = item.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= viewport; }); })).toBe(true); }); });
  // prettier-ignore
  test('serializes writes and discard in both page orders and starts a fresh epoch', async ({ browser }, info) => {
    test.setTimeout(300_000); const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async keeper => {
      for (const reverse of [false, true]) { const pair = await seededPair(keeper.context(), ida, `Shared seed ${reverse}.`), now = Date.now(), newest = `Newest ${reverse}.`; await Promise.all([pair.first.evaluate(value => { Date.now = () => value; }, now), pair.second.evaluate(value => { Date.now = () => value; }, now + 10)]); await holdLock(pair.first); const older = () => pair.firstOrganizer.getByLabel('Brief summary').fill(`Older ${reverse}.`), newer = () => pair.secondOrganizer.getByLabel('Brief summary').fill(newest); if (reverse) { await newer(); await expectPending(pair.first, 1); await older(); } else { await older(); await expectPending(pair.first, 1); await newer(); } await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(newest); await expectSurvivor(pair.firstOrganizer, pair.secondOrganizer, newest); await closePair(pair); }
      for (const reverse of [false, true]) { const pair = await seededPair(keeper.context(), ida, `Discard seed ${reverse}.`), survivor = `Edit survives discard ${reverse}.`; await holdLock(pair.first); const discard = () => pair.secondOrganizer.getByRole('button', { name: 'Discard from this device' }).evaluate(button => (button as HTMLButtonElement).click()), edit = () => pair.firstOrganizer.getByLabel('Brief summary').fill(survivor); if (reverse) { await edit(); await expectPending(pair.first, 1); await discard(); } else { await discard(); await expectPending(pair.first, 1); await edit(); } await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(survivor); await expectSurvivor(pair.secondOrganizer, pair.firstOrganizer, survivor); await closePair(pair); }
      const pair = await seededPair(keeper.context(), ida, 'Fresh epoch seed.'); await pair.secondOrganizer.getByRole('button', { name: 'Discard from this device' }).click(); await expect(pair.firstOrganizer).toHaveAttribute('data-save-behavior', 'explicit-only'); await pair.firstOrganizer.getByRole('button', { name: 'Start another draft' }).click(); await expect(pair.firstOrganizer.getByLabel('Brief summary')).toHaveCount(0); await enterVehicleDetails(pair.firstOrganizer); await pair.firstOrganizer.getByLabel('Brief summary').fill('Fresh epoch facts.'); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain('Fresh epoch facts.'); await pair.first.evaluate(key => localStorage.setItem(key, '{'), KEY); await pair.first.reload(); await openOrganizer(pair.first, ida); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toBeNull(); await closePair(pair);
    });
  });

  // prettier-ignore
  test('conditionally cleans every invalid record without deleting a concurrent valid write', async ({ browser }, info) => {
    test.setTimeout(600_000); const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async keeper => {
      for (const kind of ['malformed', 'empty', 'expired', 'future'] as const) for (const reverse of [false, true]) { const pair = await seededPair(keeper.context(), ida, `${kind} seed ${reverse}.`), fixedNow = kind === 'future' ? Date.now() : undefined, survivor = `${kind} valid edit ${reverse}.`; if (fixedNow) await Promise.all([pair.first.evaluate(now => { Date.now = () => now; }, fixedNow), pair.second.evaluate(now => { Date.now = () => now; }, fixedNow)]); await holdLock(pair.first); const cleanup = () => installInvalid(pair.second, kind, fixedNow), edit = () => pair.secondOrganizer.getByLabel('Brief summary').fill(survivor); if (reverse) { await edit(); await expectPending(pair.first, 1); await cleanup(); } else { await cleanup(); await expectPending(pair.first, 1); await edit(); } if (fixedNow) await expect.poll(() => pair.first.evaluate(key => Date.parse(JSON.parse(localStorage.getItem(key) ?? '{}').updatedAt), KEY)).toBe(fixedNow + 60_001); await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(survivor); await expectSurvivor(pair.firstOrganizer, pair.secondOrganizer, survivor); await closePair(pair); }
    });
  });

  // prettier-ignore
  test('keeps later edits across secure promotion and deliberate reset in both orders', async ({ browser }, info) => {
    test.setTimeout(300_000); const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async keeper => {
      for (const reverse of [false, true]) { await keeper.context().clearCookies(); const runId = Date.now(), seed = `Secure seed ${reverse}-${runId}.`, pair = await seededPair(keeper.context(), ida, seed), promotion = `Promotion edit ${reverse}-${runId}.`, resetEdit = `Reset edit ${reverse}.`, resetSeed = `Reset seed ${reverse}.`, saved = [seed, promotion]; try { await freshLogin(pair.first, ida); await holdLock(pair.first); const save = () => pair.firstOrganizer.getByTestId('free-start-save-open').evaluate(button => (button as HTMLButtonElement).click()), edit = () => pair.secondOrganizer.getByLabel('Brief summary').fill(promotion); if (reverse) { await edit(); await expectPending(pair.first, 1); await save(); } else { await save(); await expectPending(pair.first, 1); await edit(); } await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(promotion); await expect(pair.firstOrganizer.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'saved'); await expectSurvivor(pair.firstOrganizer, pair.secondOrganizer, promotion); await save(); await expect(pair.firstOrganizer.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'saved'); const fresh = pair.secondOrganizer.getByRole('button', { name: 'Start another draft' }); await expect(fresh).toBeVisible(); await fresh.click(); await expect(pair.secondOrganizer.getByLabel('Brief summary')).toHaveCount(0); await enterVehicleDetails(pair.secondOrganizer); await pair.secondOrganizer.getByLabel('Brief summary').fill(resetSeed); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(resetSeed); await expect(pair.secondOrganizer.getByTestId('anonymous-draft-recovery-status')).toContainText('Saved on this browser'); await expect(pair.firstOrganizer.getByTestId('anonymous-draft-recovery-offer')).toBeVisible(); await holdLock(pair.first); const reset = () => pair.firstOrganizer.getByTestId('free-start-start-another').evaluate(button => (button as HTMLButtonElement).click()), later = () => pair.secondOrganizer.getByLabel('Brief summary').fill(resetEdit); if (reverse) { await later(); await expectPending(pair.first, 1); await reset(); } else { await reset(); await expectPending(pair.first, 1); await later(); } await releaseLock(pair.first); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(resetEdit); await expectPending(pair.first, 0); await expectSurvivor(pair.firstOrganizer, pair.secondOrganizer, resetEdit); } finally { try { await deleteSavedDrafts(pair.first, pair.firstOrganizer, saved); } finally { try { await freshLogout(pair.first, ida); } finally { await closePair(pair); } } } }
    });
  });

  // prettier-ignore
  test('keeps a retained active draft current until the next secure save', async ({ browser }, info) => { test.setTimeout(180_000); const ida = resolveIdaTarget(info); await withPage(browser, ida, async keeper => { await keeper.context().clearCookies(); const runId = Date.now(), seed = `Active seed ${runId}.`, promotion = `Active promotion ${runId}.`, later = `Active later ${runId}.`, pair = await seededPair(keeper.context(), ida, seed), saved = [seed, promotion, later]; try { await freshLogin(pair.first, ida); await holdLock(pair.first); await pair.firstOrganizer.getByTestId('free-start-save-open').evaluate(button => (button as HTMLButtonElement).click()); await expectPending(pair.first, 1); await pair.firstOrganizer.getByLabel('Brief summary').fill(promotion); await releaseLock(pair.first, 1); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(promotion); await expect(pair.firstOrganizer.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'dirty'); await pair.firstOrganizer.getByLabel('Brief summary').fill(later); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toContain(later); await pair.firstOrganizer.getByTestId('free-start-save-changes').click(); await expect(pair.firstOrganizer.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'saved'); await expect.poll(() => pair.first.evaluate(key => localStorage.getItem(key), KEY)).toBeNull(); } finally { try { await deleteSavedDrafts(pair.first, pair.firstOrganizer, saved); } finally { try { await freshLogout(pair.first, ida); } finally { await closePair(pair); } } } }); });
  // prettier-ignore
  test('keeps discard, generic hosts, no-JavaScript and storage denial truthful', async ({ browser }, info) => {
    test.setTimeout(120_000); const ida = resolveIdaTarget(info);
    await withPage(browser, ida, async page => { const organizer = await openOrganizer(page, ida); await enterVehicleDetails(organizer); await page.reload(); const returned = page.getByTestId('premium-free-start-organizer'); await returned.getByRole('button', { name: 'Discard from this device' }).click(); await expect(returned.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0); expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull(); });
    await withPage(browser, info, async page => { const organizer = await openOrganizer(page, info, false); await enterVehicleDetails(organizer); await expect(organizer).toHaveAttribute('data-save-behavior', 'explicit-only'); expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull(); });
    const noJs = await browser.newContext({ baseURL: ida.project.use.baseURL, extraHTTPHeaders: ida.project.use.extraHTTPHeaders, ignoreHTTPSErrors: Boolean(ida.project.use.ignoreHTTPSErrors), javaScriptEnabled: false, storageState: undefined });
    try { const page = await noJs.newPage(); await gotoApp(page, routes.home('en'), ida, { marker: 'free-start-intake-shell' }); await expect(page.getByTestId('premium-free-start-organizer')).not.toContainText('can recover here for 30 days'); } finally { await noJs.close(); }
    await withPage(browser, ida, async page => { await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('blocked', 'SecurityError'); } })); const organizer = await openOrganizer(page, ida); await enterVehicleDetails(organizer); await expect(organizer).toHaveAttribute('data-save-behavior', 'explicit-only'); await expect(organizer).toContainText('Browser recovery is unavailable'); });
  });
});
