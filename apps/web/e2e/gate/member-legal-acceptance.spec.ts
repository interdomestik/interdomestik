import { and, db, E2E_PASSWORD, eq, legalAcceptances, user } from '@interdomestik/database';
import {
  currentLegalDocuments,
  digestLegalDocument,
} from '@interdomestik/domain-privacy/acceptance';
import { expect, test } from '@playwright/test';
import messages from '../../src/messages/en/legal-acceptance.json';
import texts from '../../src/messages/en/legal-documents.json';
import { path, rootURL } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import { interactiveLogin, withFreshPage } from './test/login-handoff-page';

const fixtureEmail = 'unaccepted.member@example.test';
const copy = messages['legal-acceptance'];

test('a new member records both attestations before accessing the portal', async ({
  browser,
}, testInfo) => {
  // This journey consumes the unaccepted member fixture in the MK gate project.
  test.skip(
    testInfo.project.name !== 'gate-mk-mk',
    'The unaccepted seed belongs to the MK tenant.'
  );
  await withFreshPage(browser, testInfo, false, async page => {
    await gotoApp(page, new URL(path(testInfo, '/login')), testInfo, {
      marker: 'domcontentloaded',
    });
    await interactiveLogin(page, 'mk');
    await page.getByTestId('login-email').fill(fixtureEmail);
    await page.getByTestId('login-password').fill(E2E_PASSWORD);
    await page.getByTestId('login-submit').click();

    const step = page.getByTestId('acceptance-step-ready');
    await expect(step).toBeVisible();
    const claims = await page.request.get(rootURL(testInfo, '/api/claims'));
    expect(claims.status()).toBe(403);
    expect(await claims.json()).toEqual({ error: 'acceptance_required' });

    await gotoApp(page, new URL(path(testInfo, '/member/claims/acceptance-fixture')), testInfo, {
      marker: 'acceptance-step-ready',
    });
    await expect(step).toBeVisible();
    await gotoApp(page, new URL(path(testInfo, '/member')), testInfo, {
      marker: 'acceptance-step-ready',
    });
    await step.getByRole('combobox').click();
    await page.getByRole('option', { name: /English/u }).click();
    await expect(page).toHaveURL(/\/en\/member(?:\/|$)/u);
    await expect(step.getByRole('heading', { name: copy.heading })).toBeVisible();
    const evidence = [];
    for (const { kind, version } of currentLegalDocuments) {
      const section = step.getByTestId(`legal-document-${kind}`);
      if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
      const blocks = section.getByTestId('legal-document-text');
      const english = texts['legal-documents'][kind];
      const expected = (english as Readonly<Record<string, { title: string }>>)[version];
      await expect(blocks.first()).toBeVisible();
      await expect(blocks.first()).toHaveText(expected.title);
      evidence.push({
        kind,
        version,
        locale: 'en',
        digest: digestLegalDocument(await blocks.allTextContents()),
      });
    }
    await expect(step.getByRole('button', { name: copy.continue })).toBeDisabled();
    await step.getByRole('checkbox', { name: copy.acceptTerms }).check();
    await step.getByRole('checkbox', { name: copy.acknowledgePrivacyNotice }).check();
    await step.getByRole('button', { name: copy.continue }).click();
    await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
    await expect(step).toHaveCount(0);
    expect((await page.request.get(rootURL(testInfo, '/api/claims'))).status()).toBe(200);
    const stored = await db
      .select({
        kind: legalAcceptances.documentKind,
        version: legalAcceptances.documentVersion,
        locale: legalAcceptances.locale,
        digest: legalAcceptances.textSha256,
      })
      .from(legalAcceptances)
      .innerJoin(
        user,
        and(
          eq(legalAcceptances.subjectUserId, user.id),
          eq(legalAcceptances.tenantId, user.tenantId)
        )
      )
      .where(eq(user.email, fixtureEmail));
    expect(stored).toHaveLength(evidence.length);
    expect(stored).toEqual(expect.arrayContaining(evidence));
  });
});
