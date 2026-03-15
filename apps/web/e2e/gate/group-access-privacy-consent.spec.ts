import {
  E2E_USERS,
  agentSettings,
  claimDocuments,
  claimStageHistory,
  claims,
  db,
  eq,
  user,
} from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';

function isMkProject(testInfo: import('@playwright/test').TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

test.describe('Group access privacy', () => {
  test('office group access stays aggregate-only without explicit member consent', async ({
    agentPage,
  }, testInfo) => {
    test.setTimeout(90_000);

    const seededAgent = isMkProject(testInfo) ? E2E_USERS.MK_AGENT : E2E_USERS.KS_AGENT;
    const seededMember = isMkProject(testInfo) ? E2E_USERS.MK_MEMBER : E2E_USERS.KS_MEMBER;
    const { claimId, currentStatus, staffId, tenantId } = await resolveSeededClaimContext(testInfo);

    const agentRecord = await db.query.user.findFirst({
      where: eq(user.email, seededAgent.email),
      columns: { id: true },
    });
    const claimRecord = await db.query.claims.findFirst({
      where: eq(claims.id, claimId),
      columns: { title: true, companyName: true },
    });
    const existingSettings = agentRecord?.id
      ? await db.query.agentSettings.findFirst({
          where: eq(agentSettings.agentId, agentRecord.id),
          columns: { id: true, tier: true },
        })
      : null;

    if (!agentRecord?.id || !existingSettings?.id) {
      throw new Error(`Expected seeded agent settings for ${seededAgent.email}`);
    }

    if (!claimRecord?.title || !claimRecord.companyName) {
      throw new Error(`Expected seeded claim details for ${claimId}`);
    }

    const suffix = randomUUID();
    const internalHistoryId = `e2e-ga04-hist-${suffix}`;
    const internalHistoryNote = `GA04 internal note ${Date.now()}`;
    const claimDocumentId = `e2e-ga04-doc-${suffix}`;
    const claimDocumentName = `GA04-sensitive-${suffix}.pdf`;

    await db
      .update(agentSettings)
      .set({ tier: 'office', updatedAt: new Date() })
      .where(eq(agentSettings.id, existingSettings.id));

    await db.insert(claimStageHistory).values({
      id: internalHistoryId,
      tenantId,
      claimId,
      fromStatus: currentStatus,
      toStatus: currentStatus,
      changedById: staffId,
      changedByRole: 'staff',
      note: internalHistoryNote,
      isPublic: false,
      createdAt: new Date(),
    });

    await db.insert(claimDocuments).values({
      id: claimDocumentId,
      tenantId,
      claimId,
      name: claimDocumentName,
      filePath: `e2e/${claimDocumentId}.pdf`,
      fileType: 'application/pdf',
      fileSize: 1024,
      bucket: 'claim-evidence',
      classification: 'pii',
      category: 'evidence',
      uploadedBy: staffId,
      createdAt: new Date(),
    });

    try {
      await gotoApp(agentPage, routes.agentImport(testInfo), testInfo, {
        marker: 'group-dashboard-summary',
      });

      await expect(agentPage.getByTestId('group-dashboard-summary')).toBeVisible();
      await expect(agentPage.getByText('Aggregate group access dashboard')).toBeVisible();
      await expect(
        agentPage.getByText(
          'This view stays aggregate-only. No claim facts, notes, or documents are visible here without explicit member consent.'
        )
      ).toBeVisible();
      await expect(agentPage.getByRole('heading', { name: 'Open cases' })).toBeVisible();

      await expect(agentPage.getByText(seededMember.name)).toHaveCount(0);
      await expect(agentPage.getByText(claimRecord.title)).toHaveCount(0);
      await expect(agentPage.getByText(claimRecord.companyName)).toHaveCount(0);
      await expect(agentPage.getByText(internalHistoryNote)).toHaveCount(0);
      await expect(agentPage.getByText(claimDocumentName)).toHaveCount(0);
    } finally {
      await db.delete(claimDocuments).where(eq(claimDocuments.id, claimDocumentId));
      await db.delete(claimStageHistory).where(eq(claimStageHistory.id, internalHistoryId));
      await db
        .update(agentSettings)
        .set({ tier: existingSettings.tier, updatedAt: new Date() })
        .where(eq(agentSettings.id, existingSettings.id));
    }
  });
});
