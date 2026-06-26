import type { TestInfo } from '@playwright/test';
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

import { resolveSeededClaimContext } from '../utils/seeded-claim-context';

export type OfficeSeededAgent = {
  email: string;
};

type PrivacyFixtureContext = {
  claimCompanyName: string;
  claimDocumentName: string;
  claimTitle: string;
  internalHistoryNote: string;
  officeAgent: OfficeSeededAgent;
  seededMemberName: string;
};

function isMkProject(testInfo: TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

function getOfficeSeededAgent(testInfo: TestInfo): OfficeSeededAgent {
  return {
    email: isMkProject(testInfo)
      ? 'agent.balkan.1@interdomestik.com'
      : 'agent.ks.b1@interdomestik.com',
  };
}

export async function withGroupAccessPrivacyFixture(
  testInfo: TestInfo,
  run: (context: PrivacyFixtureContext) => Promise<void>
) {
  const officeAgent = getOfficeSeededAgent(testInfo);
  const seededMemberName = isMkProject(testInfo)
    ? E2E_USERS.MK_MEMBER.name
    : E2E_USERS.KS_MEMBER.name;
  const { claimId, currentStatus, staffId, tenantId } = await resolveSeededClaimContext(testInfo);
  const agentRecord = await db.query.user.findFirst({
    where: eq(user.email, officeAgent.email),
    columns: { id: true },
  });
  const claimRecord = await db.query.claims.findFirst({
    where: eq(claims.id, claimId),
    columns: { title: true, companyName: true },
  });

  if (!agentRecord?.id) {
    throw new Error(`Expected seeded office-capable agent for ${officeAgent.email}`);
  }
  if (!claimRecord?.title || !claimRecord.companyName) {
    throw new Error(`Expected seeded claim details for ${claimId}`);
  }

  const existingSettings = await db.query.agentSettings.findFirst({
    where: eq(agentSettings.agentId, agentRecord.id),
    columns: { id: true, tier: true },
  });
  const suffix = randomUUID();
  const internalHistoryId = `e2e-ga04-hist-${suffix}`;
  const internalHistoryNote = `GA04 internal note ${Date.now()}`;
  const claimDocumentId = `e2e-ga04-doc-${suffix}`;
  const claimDocumentName = `GA04-sensitive-${suffix}.pdf`;
  const settingsId = existingSettings?.id ?? `e2e-ga04-settings-${suffix}`;
  const previousTier = existingSettings?.tier ?? 'standard';
  const createdSettings = !existingSettings?.id;
  let tierElevated = false;

  try {
    if (createdSettings) {
      await db.insert(agentSettings).values({
        id: settingsId,
        tenantId,
        agentId: agentRecord.id,
        commissionRates: { standard: 15 },
        tier: 'office',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      await db
        .update(agentSettings)
        .set({ tier: 'office', updatedAt: new Date() })
        .where(eq(agentSettings.id, settingsId));
    }
    tierElevated = true;

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

    await run({
      claimCompanyName: claimRecord.companyName,
      claimDocumentName,
      claimTitle: claimRecord.title,
      internalHistoryNote,
      officeAgent,
      seededMemberName,
    });
  } finally {
    await db.delete(claimDocuments).where(eq(claimDocuments.id, claimDocumentId));
    await db.delete(claimStageHistory).where(eq(claimStageHistory.id, internalHistoryId));
    if (tierElevated && createdSettings) {
      await db.delete(agentSettings).where(eq(agentSettings.id, settingsId));
    } else if (tierElevated) {
      await db
        .update(agentSettings)
        .set({ tier: previousTier, updatedAt: new Date() })
        .where(eq(agentSettings.id, settingsId));
    }
  }
}
