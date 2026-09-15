import en from '../../src/messages/en/claims.json';
import mk from '../../src/messages/mk/claims.json';
import sq from '../../src/messages/sq/claims.json';
import sr from '../../src/messages/sr/claims.json';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  isMkVaultConsentProject,
  withMemberVaultConsentFixture,
} from './member-vault-consent-display.fixture';

const S = ['progress', 'evidence', 'history', 'messaging'] as const;
// prettier-ignore
const V = [[320, 740, ''], [390, 844, ''], [768, 1024, ''], [1440, 900, ''], [320, 740, '200%']] as const;
const C = { en, mk, sq, sr } as const;

test.describe('MOB-03a member Vault consent display', () => {
  // prettier-ignore
  test('shows only safe AI extraction metadata for MK and fails closed for KS', async ({ authenticatedPage: page }, info) => {
    test.setTimeout(90_000);
    await withMemberVaultConsentFixture(info, async ctx => {
      const isMk = isMkVaultConsentProject(info.project.name);
      await gotoApp(page, routes.memberClaimDetail(ctx.claimId, info), info, { marker: isMk ? 'member-vault-consent' : 'member-claim-detail-messaging' });
      const card = page.locator('[data-testid="member-vault-consent"]:visible').first();
      if (!isMk) { await expect(page.getByTestId('member-vault-consent')).toHaveCount(0); return; }
      await expect(card).toBeVisible();
      await expect(card.getByRole('heading', { name: 'Согласност за AI извлекување податоци од документи' })).toBeVisible();
      await expect(card.locator('dd').filter({ hasText: 'Прифатено за AI извлекување податоци' })).toHaveCount(1);
      await expect(card).toContainText(ctx.privacyVersion!);
      await expect(card).toContainText(ctx.recordedDate!);
      await expect(card).not.toContainText(ctx.foreignPrivacyVersion!);
      for (const value of [ctx.documentId, ctx.documentName, ctx.documentPath]) {
        await expect(card).not.toContainText(value!); await expect(card.locator(`a[href*="${value!}"]`)).toHaveCount(0);
      }
      const controls = card.locator('a,button,input,select,textarea');
      await expect(controls).toHaveCount(0); await page.keyboard.press('Tab'); await expect(controls).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 740 }); await expect(card).toBeVisible();
      expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    });
  });

  // prettier-ignore
  test('keeps continuity accessible', async ({ authenticatedPage: page }, info) => {
    test.setTimeout(120_000);
    await withMemberVaultConsentFixture(info, async ctx => {
      const ls = isMkVaultConsentProject(info.project.name) ? (['mk', 'sr'] as const) : (['sq', 'en'] as const);
      for (const l of ls) {
        const c = C[l].claims;
        const x = c.detail.continuity;
        const labels = S.map(s => x[s]);
        const href = routes.member(l);
        await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' }); await gotoApp(page, routes.memberClaimDetail(ctx.claimId, l), info, { marker: 'member-claim-detail-messaging' });

        const back = page.getByRole('link', { name: x.backToWorkspace, exact: true });
        await expect(back).toHaveAttribute('href', href);
        const nav = page.getByRole('navigation', { name: x.sectionNavigation, exact: true });
        const links = nav.getByRole('link');
        const q = S.map(s => `#member-claim-detail-${s}`).join(',');
        const nodes = page.locator(`header:has(a[href="${href}"]),nav[aria-label="${x.sectionNavigation}"],${q}`);
        const layout = async () => {
          expect(await nodes.evaluateAll(items => items.length === 6 && items.every(item => { const box = item.getBoundingClientRect(); return item.getClientRects().length > 0 && box.left >= -1 && box.right <= window.innerWidth + 1; }))).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        };
        await expect(links).toHaveCount(S.length);
        for (const [index, s] of S.entries()) {
          const id = `member-claim-detail-${s}`; const link = links.nth(index);
          await expect(link).toHaveAccessibleName(labels[index]);
          await expect(link).toHaveAttribute('href', `#${id}`);
          await link.focus(); await expect(link).toBeFocused();
          expect(await link.evaluate(element => { const style = getComputedStyle(element); return style.outlineStyle !== 'none' || style.boxShadow !== 'none'; })).toBe(true);
          await page.keyboard.press('Enter'); await expect.poll(() => new URL(page.url()).hash).toBe(`#${id}`);
          await expect(page.locator(`#${id}`)).toBeInViewport();
        }

        for (const [width, height, f] of V) { await page.setViewportSize({ width, height }); await page.evaluate(value => (document.documentElement.style.fontSize = value), f); await layout(); }
        await page.evaluate(() => (document.documentElement.style.fontSize = ''));

        await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' }); await layout();
        await page.evaluate(() => { Element.prototype.scrollIntoView = options => { document.body.dataset.scrollBehavior = typeof options === 'object' ? options?.behavior : undefined; }; });
        await page.getByRole('button', { name: c.claimsPro.actions.sendMessage, exact: true }).click();
        await expect(page.locator('#member-claim-detail-messaging')).toBeFocused();
        await expect(page.locator('body')).toHaveAttribute('data-scroll-behavior', 'auto');
      }
    });
  });
});
