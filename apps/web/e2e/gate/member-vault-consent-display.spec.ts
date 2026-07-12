import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  isMkVaultConsentProject,
  withMemberVaultConsentFixture,
} from './member-vault-consent-display.fixture';

test.describe('MOB-03a member Vault consent display', () => {
  test('shows only safe AI extraction metadata for MK and fails closed for KS', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.setTimeout(90_000);

    await withMemberVaultConsentFixture(testInfo, async context => {
      const isMk = isMkVaultConsentProject(testInfo.project.name);
      await gotoApp(page, routes.memberClaimDetail(context.claimId, testInfo), testInfo, {
        marker: isMk ? 'member-vault-consent' : 'member-claim-detail-messaging',
      });
      const card = page.locator('[data-testid="member-vault-consent"]:visible').first();

      if (!isMk) {
        await expect(page.getByTestId('member-vault-consent')).toHaveCount(0);
        return;
      }

      await expect(card).toBeVisible();
      await expect(
        card.getByRole('heading', { name: 'Согласност за AI извлекување податоци од документи' })
      ).toBeVisible();
      await expect(
        card.locator('dd').filter({ hasText: 'Прифатено за AI извлекување податоци' })
      ).toHaveCount(1);
      await expect(card).toContainText(context.privacyVersion!);
      await expect(card).toContainText(context.recordedDate!);
      await expect(card).not.toContainText(context.foreignPrivacyVersion!);

      for (const rawValue of [context.documentId, context.documentName, context.documentPath]) {
        await expect(card).not.toContainText(rawValue!);
        await expect(card.locator(`a[href*="${rawValue!}"]`)).toHaveCount(0);
      }
      await expect(card.locator('a,button,input,select,textarea')).toHaveCount(0);
      await page.keyboard.press('Tab');
      await expect(card.locator('a,button,input,select,textarea')).toHaveCount(0);

      await page.setViewportSize({ width: 320, height: 740 });
      await expect(card).toBeVisible();
      expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    });
  });
});
