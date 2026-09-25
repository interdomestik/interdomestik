import { expect, type Page } from '@playwright/test';
import { routes } from '../routes';
import { E2E_USERS, claims, crmLeads, db, eq, subscriptions } from '@interdomestik/database';
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

export async function expectNoDraftSideEffects(ownerId: string, email: string) {
  expect(await db.$count(subscriptions, eq(subscriptions.userId, ownerId))).toBe(0);
  expect(await db.$count(claims, eq(claims.userId, ownerId))).toBe(0);
  expect(await db.$count(crmLeads, eq(crmLeads.email, email))).toBe(0);
}

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
    reauthenticate: () => Promise<void>;
  }>
) {
  const continuation = page.getByTestId('saved-draft-continue');
  const path = `/member/claims/new?mode=drafts#draft=${args.draftId}`;
  await expect(continuation).toHaveAttribute('href', `/en${path}`);
  await page.context().clearCookies();
  await continuation.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/en/login#draft=${args.draftId}$`));
  await args.reauthenticate();
  for (const [locale, catalog] of Object.entries({ en, sq, mk, sr })) {
    if (locale !== 'en') await page.goto(`${args.origin}/${locale}${path}`);
    const intake = page.locator('[data-testid="claim-draft-intake"]:visible');
    // The existing shell can retain a hidden duplicate, matching gotoApp's marker contract.
    await expect(
      page.locator('[data-testid="new-claim-page-ready"]:visible').first()
    ).toBeVisible();
    await expect(intake).toHaveCount(1);
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
  await page.goto(`${args.origin}${routes.memberNewClaim('en')}?mode=drafts#draft=malformed`);
  const notice = page.locator('[data-testid="draft-continuation-notice"]:visible');
  await expect(notice.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('claim-draft-dormant-preview')).toHaveCount(0);
  await expect(notice.getByRole('button')).toHaveCount(0);
}
