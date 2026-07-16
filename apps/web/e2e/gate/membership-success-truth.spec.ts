import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const accountNames = {
  en: { account: 'Open my account', recheck: 'Check membership status' },
  mk: { account: 'Отвори ја мојата сметка', recheck: 'Провери го статусот на членството' },
  sq: { account: 'Hap llogarinë time', recheck: 'Kontrollo statusin e anëtarësimit' },
  sr: { account: 'Otvori moj nalog', recheck: 'Proveri status članstva' },
};

async function applyTextStress(page: Parameters<typeof gotoApp>[0]): Promise<void> {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.addStyleTag({
    content:
      '*{letter-spacing:.12em!important;word-spacing:.16em!important;line-height:1.5!important}p{margin-bottom:2em!important}',
  });
  await page.evaluate(() => {
    document.body.style.zoom = '2';
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2))
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('p,h1,h2')]
          .filter(element => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden';
          })
          .filter(
            element =>
              element.clientHeight <= 0 ||
              element.getBoundingClientRect().height <= 0 ||
              element.scrollHeight > element.clientHeight + 2
          )
          .map(element => ({
            tag: element.tagName,
            text: element.textContent?.trim().slice(0, 80),
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          }))
      )
    )
    .toEqual([]);
}

test.describe('IDA-UI03a0a membership success truth', () => {
  test('neutral account is honest, accessible, recheckable, and fails closed without JavaScript', async ({
    browser,
    loginAs,
    page,
  }, testInfo) => {
    test.skip(
      getTenantFromTestInfo(testInfo) !== 'ks',
      'KS has the dedicated empty member fixture'
    );
    await loginAs('member_empty');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await gotoApp(page, routes.memberMembership(testInfo) + '/success', testInfo, {
      marker: 'success-page-ready',
    });

    const successPage = page.getByTestId('dashboard-page-ready').getByTestId('success-page-ready');
    const names = accountNames[routes.getLocale(testInfo) as keyof typeof accountNames];
    const recheck = successPage.getByRole('link', { name: names.recheck });
    await expect(successPage.getByTestId('success-account-neutral')).toBeVisible();
    await expect(successPage.getByTestId('success-card')).toHaveCount(0);
    await expect(successPage.getByTestId('success-benefits')).toHaveCount(0);
    await expect(successPage.getByTestId('membership-success-entity-disclosure')).toHaveCount(0);
    await expect(recheck).toHaveAttribute('aria-describedby', 'membership-status-helper');
    await expect(successPage.getByRole('link', { name: names.account })).toBeVisible();
    expect((await recheck.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await recheck.focus();
    await page.keyboard.press('Enter');
    await expect(recheck).toBeFocused();
    await expect(successPage.getByRole('status')).toBeVisible();

    const state = await page.context().storageState();
    const noJsContext = await browser.newContext({
      javaScriptEnabled: false,
      storageState: state,
      extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
    });
    const noJsPage = await noJsContext.newPage();
    const noJsResponse = await gotoApp(
      noJsPage,
      routes.memberMembership(testInfo) + '/success?check=1',
      testInfo,
      { marker: 'body' }
    );
    expect(noJsResponse).not.toBeNull();
    expect(noJsResponse?.status()).toBeLessThan(500);
    await expect(noJsPage).toHaveURL(
      new RegExp(`/${routes.getLocale(testInfo)}/member/membership/success\\?check=1$`)
    );
    await expect(noJsPage.locator('body')).not.toHaveText('');
    await expect(noJsPage.locator('body')).not.toContainText(
      /Internal Server Error|Application error/i
    );
    await expect(noJsPage.getByTestId('success-card')).toHaveCount(0);
    await expect(noJsPage.getByTestId('success-benefits')).toHaveCount(0);
    await expect(noJsPage.getByTestId('membership-success-entity-disclosure')).toHaveCount(0);
    await noJsContext.close();
    await applyTextStress(page);
  });

  test('access-active state retains entitled truth without neutral controls', async ({
    loginAs,
    page,
  }, testInfo) => {
    await loginAs('member');
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, routes.memberMembership(testInfo) + '/success?priceId=forged', testInfo, {
      marker: 'success-page-ready',
    });

    const successPage = page.getByTestId('dashboard-page-ready').getByTestId('success-page-ready');
    await expect(successPage.getByTestId('success-card')).toBeVisible();
    await expect(successPage.getByTestId('success-benefits')).toBeVisible();
    await expect(successPage.getByTestId('membership-success-entity-disclosure')).toBeVisible();
    await expect(successPage.getByTestId('success-account-neutral')).toHaveCount(0);
    await expect(successPage.locator('a[href$="/member/claims/new"]')).toBeVisible();
    await expect(successPage.getByTestId('success-activation-pending')).toHaveCount(0);
    await applyTextStress(page);
  });
});
