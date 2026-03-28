import { expect, test } from '@playwright/test';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const localizedCopy = {
  en: {
    privacyTitle: 'Privacy Policy',
    privacySection: 'How we handle your data',
    cookiesTitle: 'Cookie Policy',
    cookiesIntro:
      'We use essential cookies to keep the portal secure and functional. Optional analytics cookies are enabled only after explicit consent.',
  },
  mk: {
    privacyTitle: 'Политика за приватност',
    privacySection: 'Како ги обработуваме вашите податоци',
    cookiesTitle: 'Политика за колачиња',
    cookiesIntro:
      'Користиме неопходни колачиња за да го одржуваме порталот безбеден и функционален. Опционалните аналитички колачиња се овозможуваат само по изречна согласност.',
  },
  sq: {
    privacyTitle: 'Politika e Privatësisë',
    privacySection: 'Si i trajtojmë të dhënat tuaja',
    cookiesTitle: 'Politika e Cookie-ve',
    cookiesIntro:
      'Ne përdorim cookie thelbësore për ta mbajtur portalin të sigurt dhe funksional. Cookie-t opsionale të analitikës aktivizohen vetëm pas pëlqimit të qartë.',
  },
  sr: {
    privacyTitle: 'Politika privatnosti',
    privacySection: 'Kako obrađujemo vaše podatke',
    cookiesTitle: 'Politika kolačića',
    cookiesIntro:
      'Koristimo neophodne kolačiće kako bismo portal održali bezbednim i funkcionalnim. Opciona analitička kolačića omogućavaju se tek nakon izričitog pristanka.',
  },
} as const;

test.describe('Strict Gate: Public Legal Surfaces', () => {
  test('privacy page renders localized public copy', async ({ page }, testInfo) => {
    const locale = routes.getLocale(testInfo);
    const copy = localizedCopy[locale as keyof typeof localizedCopy] ?? localizedCopy.en;

    await gotoApp(page, `/${locale}/legal/privacy`, testInfo, { marker: 'body' });

    await expect(page.getByRole('heading', { name: copy.privacyTitle })).toBeVisible();
    await expect(page.getByText(copy.privacySection)).toBeVisible();
    await expect(page.getByText('POST /api/privacy/data-deletion')).toBeVisible();
    await expect(page.getByText('Placeholder content.')).toHaveCount(0);
  });

  test('cookie page renders localized public copy', async ({ page }, testInfo) => {
    const locale = routes.getLocale(testInfo);
    const copy = localizedCopy[locale as keyof typeof localizedCopy] ?? localizedCopy.en;

    await gotoApp(page, `/${locale}/legal/cookies`, testInfo, { marker: 'body' });

    await expect(page.getByRole('heading', { name: copy.cookiesTitle })).toBeVisible();
    await expect(page.getByText(copy.cookiesIntro)).toBeVisible();
    await expect(page.getByText('Placeholder content.')).toHaveCount(0);
  });
});
