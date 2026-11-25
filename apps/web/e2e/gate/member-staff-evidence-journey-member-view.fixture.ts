import type { Page } from '@playwright/test';
import { expect } from '../../e2e-mac/closed-services.fixture';

export async function expectMemberClaimContinuity(
  memberPage: Page,
  publicNote: string,
  privateNote: string
): Promise<void> {
  await expect(memberPage.getByTestId('member-claim-current-state').first()).toHaveText(
    'Verifikim'
  );
  // Member summary reads status-change events; same-status notes only append staff history.
  await expect(memberPage.getByTestId('member-claim-latest-update-note').first()).toHaveText(
    publicNote
  );
  await expect(
    memberPage.getByTestId('ops-timeline-item').filter({ hasText: publicNote }).first()
  ).toBeVisible();
  await expect(memberPage.locator('body')).not.toContainText(privateNote);
  await expect(memberPage.getByTestId('member-claim-sla-status-phase').first()).toBeVisible();
}
