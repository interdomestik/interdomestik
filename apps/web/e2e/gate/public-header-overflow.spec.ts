import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { routes, type Locale } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';
const locales = ['sq', 'en', 'sr', 'mk'] as const;
const widths = [320, 360, 390, 430] as const;
async function openHeader(page: Page, info: TestInfo, locale: Locale) {
  await page.addInitScript(() => {
    localStorage.setItem('interdomestik_cookie_consent_v1', 'accepted');
    document.cookie = 'cookie_consent=accepted; Path=/; SameSite=Lax';
  });
  await gotoApp(page, routes.home(locale), info, { marker: 'public-entry-hero' });
  return page.getByRole('banner');
}
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<number>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });
}
async function applyStress(page: Page, width: number) {
  await page.setViewportSize({ width, height: 720 });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  const content =
    '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}' +
    'p{margin-bottom:2em!important}html{zoom:2}';
  await page.addStyleTag({ content });
  await settle(page);
  const valid = await page.evaluate(
    expected =>
      innerWidth === expected &&
      matchMedia('(forced-colors: active)').matches &&
      matchMedia('(prefers-reduced-motion: reduce)').matches &&
      matchMedia(`(max-width: ${expected}px)`).matches &&
      !matchMedia(`(min-width: ${expected + 1}px)`).matches &&
      getComputedStyle(document.documentElement).zoom === '2',
    width
  );
  expect(valid).toBe(true);
}
async function collectHeader(header: Locator, info: TestInfo, label: string) {
  const result = await header.evaluate(el => {
    const root = document.documentElement;
    const visible = [...el.querySelectorAll<HTMLElement>('a,button')].filter(
      node => node.offsetWidth > 0 && node.offsetHeight > 0
    );
    const violations: string[] = [];
    const actions = visible.map((node, index) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (rect.left < 0 || rect.right > innerWidth) violations.push(`action-edge-${index}`);
      if (node.offsetWidth < 44 || node.offsetHeight < 44) violations.push(`target-${index}`);
      if (!hit || !node.contains(hit)) violations.push(`hit-${index}`);
      return { l: rect.left, r: rect.right, t: rect.top, b: rect.bottom };
    });
    for (let left = 0; left < actions.length; left += 1)
      for (let right = left + 1; right < actions.length; right += 1) {
        const a = actions[left];
        const b = actions[right];
        if (a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t)
          violations.push(`overlap-${left}-${right}`);
      }
    const offenders = [el, ...el.querySelectorAll<HTMLElement>('*')]
      .filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.left < 0 || rect.right > innerWidth || node.scrollWidth > node.clientWidth;
      })
      .map(node => node.tagName.toLowerCase());
    if (offenders.length) violations.push(`subtree-${offenders.join(',')}`);
    const maskNodes = [
      ...document.querySelectorAll('html,body,main'),
      el,
      el.firstElementChild,
    ].filter((node): node is Element => node instanceof Element);
    const masks = maskNodes.filter(node => {
      const style = getComputedStyle(node);
      return (
        /hidden|clip/.test(style.overflowX) ||
        style.transform !== 'none' ||
        style.translate !== 'none'
      );
    });
    if (masks.length) violations.push('masking');
    return { violations, rootDiagnostic: [root.clientWidth, root.scrollWidth], offenders };
  });
  await info.attach(`header-geometry-${label}`, {
    body: Buffer.from(JSON.stringify(result)),
    contentType: 'application/json',
  });
  expect(result.violations, label).toEqual([]);
}
test.describe('public header overflow containment', () => {
  test('has zero header-owned violations across the stress matrix', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      for (const locale of locales)
        for (const width of widths) {
          await page.setViewportSize({ width, height: 720 });
          const header = await openHeader(page, info, locale);
          await applyStress(page, width);
          await collectHeader(header, info, `${locale}-${width}-closed`);
          await expect(header.getByRole('link', { name: 'Interdomestik' })).toHaveAttribute(
            'href',
            new RegExp(`/${locale}$`)
          );
          await expect(header.locator(`a[href$="/${locale}/login"]`)).toHaveCount(1);
          const trigger = header.getByTestId('public-locale-trigger');
          await trigger.click();
          await expect(trigger).toBeFocused();
          await expect(trigger).toHaveAttribute('aria-expanded', 'true');
          await expect(header.getByTestId('public-locale-option')).toHaveCount(4);
          await collectHeader(header, info, `${locale}-${width}-open`);
        }
    });
  });
  test('preserves interaction and normal geometry', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      const header = await openHeader(page, info, 'sq');
      const trigger = header.getByTestId('public-locale-trigger');
      await expect(trigger).not.toHaveAttribute('aria-haspopup');
      await trigger.press('Enter');
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Tab');
      const options = header.getByTestId('public-locale-option');
      await expect(options.first()).toBeFocused();
      await expect(options.nth(0)).toHaveAttribute('href', /\/sq$/);
      await expect(options.nth(3)).toHaveAttribute('href', /\/mk$/);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await trigger.press('Space');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await options.nth(1).click();
      await expect(page).toHaveURL(/\/en$/);
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const normalHeader = await openHeader(page, info, 'sq');
        await settle(page);
        const fits = await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        );
        expect(fits, `normal root ${width}`).toBe(true);
        await collectHeader(normalHeader, info, `normal-${width}`);
      }
    });
  });
});
