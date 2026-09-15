import en from '../../src/messages/en/claims.json';
import mk from '../../src/messages/mk/claims.json';
import sq from '../../src/messages/sq/claims.json';
import sr from '../../src/messages/sr/claims.json';
import t from '../../src/messages/mk/claims-tracking.json';
import { expect as E, test } from '../fixtures/auth.fixture';
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
  test('privacy', async ({ authenticatedPage: p }, n) => {
    test.setTimeout(90_000);
    await F(n, async u => {
      const isMk = P(n.project.name);
      await gotoApp(p, routes.memberClaimDetail(u.claimId, n), n, { marker: isMk ? A : M });
      const v = p.locator(`[data-testid="${A}"]:visible`).first();
      if (!isMk) { await E(p.getByTestId(A)).toHaveCount(0); return; }
      await E(v).toBeVisible();
      await E(v.getByRole('heading', { name: VC.title })).toBeVisible();
      const i = v.locator('li').filter({ hasText: u.privacyVersion! });
      await E(i).toHaveCount(1); await E(i).toContainText(u.recordedDate!);
      await E(i.locator('dd', { hasText: VC.statusAccepted })).toHaveCount(1);
      await E(v).not.toContainText(u.foreignPrivacyVersion!);
      for (const raw of [u.documentId, u.documentName, u.documentPath]) {
        await E(v).not.toContainText(raw!); await E(v.locator(`a[href*="${raw!}"]`)).toHaveCount(0);
      }
      const f = v.locator('a,button,input,select,textarea');
      await E(f).toHaveCount(0); await p.keyboard.press('Tab'); await E(f).toHaveCount(0);
      await p.setViewportSize({ width: 320, height: 740 }); await E(v).toBeVisible();
      E(await v.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    });
  });

  // prettier-ignore
  test('continuity', async ({ authenticatedPage: p }, n) => {
    test.setTimeout(120_000);
    await F(n, async u => {
      const ls = P(n.project.name) ? (['mk', 'sr'] as const) : (['sq', 'en'] as const);
      for (const l of ls) {
        const c = C[l].claims, x = c.detail.continuity, L = [x.progress, x.evidence, x.history, x.messages], h = routes.member(l);
        await p.emulateMedia({ reducedMotion: 'no-preference' }); await gotoApp(p, routes.memberClaimDetail(u.claimId, l), n, { marker: M });

        const b = p.getByRole('link', { name: x.backToWorkspace, exact: true }), k = b.locator('xpath=ancestor::div[contains(@class,"bg-card")][1]'), r = k.locator('xpath=..'), nav = r.getByRole('navigation', { name: x.sectionNavigation, exact: true }), a = nav.getByRole('link'), q = S.map(s => `#member-claim-detail-${s}`).join(','), N = r.locator(`header:has(a[href="${h}"]),nav[aria-label="${x.sectionNavigation}"],${q}`);
        await E(b).toBeVisible(); await E(b).toHaveAttribute('href', h);
        const fit = async () => E(await N.evaluateAll(items => { const d = document.documentElement, w = d.clientWidth; return d.scrollWidth <= w + 1 && items.length === 6 && items.every(e => { const box = e.getBoundingClientRect(); return e.getClientRects().length > 0 && box.left >= -1 && box.right <= w + 1; }); })).toBe(true);
        await E(a).toHaveCount(S.length);
        for (const [i, s] of S.entries()) {
          const id = `member-claim-detail-${s}`; const link = a.nth(i);
          await E(link).toHaveAccessibleName(L[i]); await E(link).toHaveAttribute('href', `#${id}`);
          await link.focus(); await E(link).toBeFocused();
          E(await link.evaluate(e => { const style = getComputedStyle(e); return style.outlineStyle !== 'none' || style.boxShadow !== 'none'; })).toBe(true);
          await p.keyboard.press('Enter'); await E.poll(() => new URL(p.url()).hash).toBe(`#${id}`);
          await E(r.locator(`#${id}`)).toBeInViewport();
        }

        for (const [width, height, f] of V) { await p.setViewportSize({ width, height }); await p.evaluate(value => (document.documentElement.style.fontSize = value), f); await fit(); }
        await p.evaluate(() => (document.documentElement.style.fontSize = ''));

        const z = p.locator('html'), o = await z.getAttribute('class');
        try {
          await z.evaluate(e => e.classList.add('dark')); await E(z).toHaveClass(/\bdark\b/);
          for (const z of [k, b, nav]) await E(z).toBeVisible(); await E(k).toHaveClass(/\bbg-card\b/);
          await p.emulateMedia({ reducedMotion: 'reduce' });
          await p.evaluate(() => { const p = Element.prototype, o = p.scrollIntoView; Reflect.set(p, '_memberScroll', o); p.scrollIntoView = function (v) { document.body.dataset.b = typeof v === 'object' ? v?.behavior : undefined; o.call(this, v); }; });
          try {
            await r.getByRole('button', { name: c.claimsPro.actions.sendMessage, exact: true }).click();
            await E(r.locator(`#${M}`)).toBeFocused(); await E(p.locator('body')).toHaveAttribute('data-b', 'auto');
          } finally {
            await p.evaluate(() => { const p = Element.prototype; p.scrollIntoView = Reflect.get(p, '_memberScroll'); Reflect.deleteProperty(p, '_memberScroll'); delete document.body.dataset.b; });
          }
        } finally {
          await z.evaluate((e, o) => o === null ? e.removeAttribute('class') : e.setAttribute('class', o), o);
        }
      }
    });
  });
});
