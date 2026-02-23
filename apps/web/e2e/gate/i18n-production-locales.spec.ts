import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const PRODUCTION_LOCALES = ['en', 'sq', 'mk', 'sr'] as const;

const LOCALE_CONTRACT = {
  en: {
    title: 'Assistance for Every Situation',
    cta: 'Join Now',
    billedAnnually: 'Billed annually',
    moneyBackGuarantee: '30-Day Money-Back Guarantee',
  },
  sq: {
    title: 'Asistencë për Çdo Situatë',
    cta: 'Bëhu Anëtar',
    billedAnnually: 'Faturuar çdo vit',
    moneyBackGuarantee: 'Garanci kthimi parash për 30 ditë',
  },
  mk: {
    title: 'Помош за секоја ситуација',
    cta: 'Приклучете се',
    billedAnnually: 'Се наплаќа годишно',
    moneyBackGuarantee: '30-дневна гаранција за враќање на пари',
  },
  sr: {
    title: 'Pomoć za svaku situaciju',
    cta: 'Pridružite se',
    billedAnnually: 'Naplaćuje se godišnje',
    moneyBackGuarantee: '30-dnevna garancija povraćaja novca',
  },
} as const;

test.describe('Strict Gate: I18n Production Locale Contract', () => {
  for (const locale of PRODUCTION_LOCALES) {
    test(`pricing copy is localized for ${locale}`, async ({ page }, testInfo) => {
      const contract = LOCALE_CONTRACT[locale];

      await gotoApp(page, routes.pricing(locale), testInfo, { marker: 'pricing-page-ready' });

      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${locale}(?:-|$)`));
      await expect(page.getByRole('heading', { level: 1, name: contract.title })).toBeVisible();
      await expect(page.getByTestId('plan-cta-standard')).toContainText(contract.cta);
      await expect(page.getByText(contract.billedAnnually).first()).toBeVisible();
      await expect(page.getByText(contract.moneyBackGuarantee).first()).toBeVisible();

      if (locale !== 'en') {
        await expect(page.getByText('Join Now')).toHaveCount(0);
        await expect(page.getByText('Billed annually')).toHaveCount(0);
        await expect(page.getByText('30-Day Money-Back Guarantee')).toHaveCount(0);
      }
    });
  }
});
