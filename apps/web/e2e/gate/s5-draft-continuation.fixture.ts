import { expect, type Page } from '@playwright/test';
import { E2E_USERS } from '@interdomestik/database';
import {
  listFreeStartDrafts,
  resumeFreeStartDraft,
  type FreeStartDraftContext,
} from '@interdomestik/database/free-start-drafts';
import en from '../../src/messages/en/claims.json';
import sq from '../../src/messages/sq/claims.json';
import mk from '../../src/messages/mk/claims.json';
import sr from '../../src/messages/sr/claims.json';
import { S3_JOURNEY_INCIDENT_DATE } from './member-staff-evidence-journey-cleanup.fixture';

export async function expectDraftTenantIsolation(draftId: string, ownerId: string) {
  const foreignTenant = E2E_USERS.MK_MEMBER.tenantId;
  const foreign: FreeStartDraftContext = {
    accessTenantId: foreignTenant,
    actorRole: 'member',
    ownerUserId: ownerId,
    tenantId: foreignTenant,
  };
  const listed = await listFreeStartDrafts(foreign, { limit: 50 });
  expect(listed.items.some(item => item.id === draftId)).toBe(false);
  expect(await resumeFreeStartDraft(foreign, draftId)).toEqual({ code: 'notFound', ok: false });
}

export async function continueSavedDraftWithoutMembership(
  page: Page,
  args: Readonly<{
    origin: string;
    draftId: string;
    counterparty: string;
    summary: string;
  }>
) {
  const continuation = page.getByTestId('saved-draft-continue');
  const path = `/member/claims/new?mode=drafts#draft=${args.draftId}`;
  await expect(continuation).toHaveAttribute('href', `/en${path}`);
  await continuation.focus();
  await page.keyboard.press('Enter');
  for (const [locale, catalog] of Object.entries({ en, sq, mk, sr })) {
    if (locale !== 'en') await page.goto(`${args.origin}/${locale}${path}`);
    const intake = page.getByTestId('claim-draft-intake');
    await expect(page.getByTestId('new-claim-page-ready')).toBeVisible();
    await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();
    for (const fact of [S3_JOURNEY_INCIDENT_DATE, args.counterparty, args.summary]) {
      await expect(intake.locator('dl')).toContainText(fact);
    }
    const disabled = intake.getByTestId('claim-draft-submit-disabled');
    await expect(disabled).toBeDisabled();
    await expect(disabled).toHaveAccessibleDescription(
      JSON.parse(catalog.claims.draftIntakeCopy).submitMembershipExplanation
    );
    await expect(intake.getByTestId('claim-draft-submit')).toHaveCount(0);
    await expect(intake.getByTestId('claim-created-success')).toHaveCount(0);
    await expect(intake.getByTestId('saved-draft-continue')).toHaveCount(0);
  }
  await page.goto(`${args.origin}/en/member/claims/new?mode=drafts#draft=malformed`);
  const notice = page.getByTestId('draft-continuation-notice');
  await expect(notice.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('claim-draft-dormant-preview')).toHaveCount(0);
  await expect(notice.getByRole('button')).toHaveCount(0);
}
