import en from '../../src/messages/en/claims.json';
import mk from '../../src/messages/mk/claims.json';
import sq from '../../src/messages/sq/claims.json';
import sr from '../../src/messages/sr/claims.json';
import t from '../../src/messages/mk/claims-tracking.json';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  isMkVaultConsentProject as P,
  withMemberVaultConsentFixture as F,
} from './member-vault-consent-display.fixture';

const S = ['progress', 'evidence', 'history', 'messaging'] as const;
// prettier-ignore
const V = [[320, 740, ''], [390, 844, ''], [768, 1024, ''], [1440, 900, ''], [320, 740, '200%']] as const;
const C = { en, mk, sq, sr } as const;
const VC = t['claims-tracking'].vault_consent;
const M = 'member-claim-detail-messaging';
const A = 'member-vault-consent';

test.describe('Vault consent', () => {
  // prettier-ignore
  test('privacy', async ({ authenticatedPage: page }, info) => {
    test.setTimeout(90_000);
    await F(info, async ctx => {
      const isMk = P(info.project.name);
      await gotoApp(page, routes.memberClaimDetail(ctx.claimId, info), info, { marker: isMk ? A : M });
      const v = page.locator(`[data-testid="${A}"]:visible`).first();
      if (!isMk) { await expect(page.getByTestId(A)).toHaveCount(0); return; }
      await expect(v).toBeVisible();
      await expect(v.getByRole('heading', { name: VC.title })).toBeVisible();
      const i = v.locator('li').filter({ hasText: ctx.privacyVersion! });
      await expect(i).toHaveCount(1); await expect(i).toContainText(ctx.recordedDate!);
      await expect(i.locator('dd', { hasText: VC.statusAccepted })).toHaveCount(1);
      await expect(v).not.toContainText(ctx.foreignPrivacyVersion!);
      for (const raw of [ctx.documentId, ctx.documentName, ctx.documentPath]) {
        await expect(v).not.toContainText(raw!); await expect(v.locator(`a[href*="${raw!}"]`)).toHaveCount(0);
      }
      const f = v.locator('a,button,input,select,textarea');
      await expect(f).toHaveCount(0); await page.keyboard.press('Tab'); await expect(f).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 740 }); await expect(v).toBeVisible();
      expect(await v.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    });
  });

  // prettier-ignore
  test('continuity', async ({ authenticatedPage: page }, info) => {
    test.setTimeout(120_000);
    await F(info, async ctx => {
      const ls = P(info.project.name) ? (['mk', 'sr'] as const) : (['sq', 'en'] as const);
      for (const l of ls) {
        const c = C[l].claims, x = c.detail.continuity, labels = [x.progress, x.evidence, x.history, x.messages], h = routes.member(l);
        await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' }); await gotoApp(page, routes.memberClaimDetail(ctx.claimId, l), info, { marker: M });

        const b = page.getByRole('link', { name: x.backToWorkspace, exact: true }), k = b.locator('xpath=ancestor::div[contains(@class,"bg-card")][1]'), r = k.locator('xpath=..'), nav = r.getByRole('navigation', { name: x.sectionNavigation, exact: true }), links = nav.getByRole('link'), q = S.map(s => `#member-claim-detail-${s}`).join(','), nodes = r.locator(`header:has(a[href="${h}"]),nav[aria-label="${x.sectionNavigation}"],${q}`);
        await expect(b).toBeVisible(); await expect(b).toHaveAttribute('href', h);
        const fit = async () => expect(await nodes.evaluateAll(items => { const d = document.documentElement, w = d.clientWidth; return d.scrollWidth <= w + 1 && items.length === 6 && items.every(item => { const box = item.getBoundingClientRect(); return item.getClientRects().length > 0 && box.left >= -1 && box.right <= w + 1; }); })).toBe(true);
        await expect(links).toHaveCount(S.length);
        for (const [i, s] of S.entries()) {
          const id = `member-claim-detail-${s}`; const link = links.nth(i);
          await expect(link).toHaveAccessibleName(labels[i]); await expect(link).toHaveAttribute('href', `#${id}`);
          await link.focus(); await expect(link).toBeFocused();
          expect(await link.evaluate(element => { const style = getComputedStyle(element); return style.outlineStyle !== 'none' || style.boxShadow !== 'none'; })).toBe(true);
          await page.keyboard.press('Enter'); await expect.poll(() => new URL(page.url()).hash).toBe(`#${id}`);
          await expect(r.locator(`#${id}`)).toBeInViewport();
        }

        for (const [width, height, f] of V) { await page.setViewportSize({ width, height }); await page.evaluate(value => (document.documentElement.style.fontSize = value), f); await fit(); }
        await page.evaluate(() => (document.documentElement.style.fontSize = ''));

        await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
        await expect(k).toBeVisible(); await expect(k).toHaveClass(/\bbg-card\b/); await expect(b).toBeVisible();
        await page.evaluate(() => { const p = Element.prototype, o = p.scrollIntoView; Reflect.set(p, '_memberScroll', o); p.scrollIntoView = function (v) { document.body.dataset.b = typeof v === 'object' ? v?.behavior : undefined; o.call(this, v); }; });
        try {
          await r.getByRole('button', { name: c.claimsPro.actions.sendMessage, exact: true }).click();
          await expect(r.locator(`#${M}`)).toBeFocused(); await expect(page.locator('body')).toHaveAttribute('data-b', 'auto');
        } finally {
          await page.evaluate(() => { const p = Element.prototype; p.scrollIntoView = Reflect.get(p, '_memberScroll'); Reflect.deleteProperty(p, '_memberScroll'); delete document.body.dataset.b; });
        }
      }
    });
  });
});
