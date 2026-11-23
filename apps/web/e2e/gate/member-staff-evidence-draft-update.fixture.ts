import { E2E_USERS, and, db, eq, freeStartDrafts } from '@interdomestik/database';
import type { Locator } from '@playwright/test';
import { expect } from '../fixtures/auth.fixture';

export async function updateSavedDraftOutcome(
  intake: Locator,
  savedEntry: Locator,
  draft: { desiredOutcome: string | null; id: string; ownerUserId: string; version: number },
  outcome: string
) {
  expect(draft.desiredOutcome).toBe('written_response');
  await savedEntry.getByTestId(`free-start-resume-${draft.id}`).click();
  await expect(savedEntry).toHaveCount(0);
  await intake.getByRole('button', { name: 'Kthehu te hollësitë', exact: true }).click();
  const panel = intake.getByTestId('claim-draft-main-panel');
  await panel.locator(`select:has(option[value="${outcome}"])`).selectOption(outcome);
  await panel.getByRole('button', { name: 'Shikoni përmbledhjen', exact: true }).click();
  await expect(async () => {
    const edited = await db.query.freeStartDrafts.findFirst({
      where: and(
        eq(freeStartDrafts.id, draft.id),
        eq(freeStartDrafts.accessTenantId, E2E_USERS.KS_MEMBER.tenantId),
        eq(freeStartDrafts.ownerUserId, draft.ownerUserId)
      ),
      columns: { desiredOutcome: true, resumeStep: true, version: true },
    });
    expect(edited).toMatchObject({ desiredOutcome: outcome, resumeStep: 'preview' });
    expect(edited?.version).toBeGreaterThan(draft.version);
  }).toPass({ timeout: 15_000 });
}
