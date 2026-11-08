import type { TestInfo } from '@playwright/test';
import {
  E2E_USERS,
  agentSettings,
  claimDocuments,
  claimStageHistory,
  and,
  claims,
  db,
  eq,
  tenantSettings,
  user,
} from '@interdomestik/database';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { resolveSeededClaimContext } from '../utils/seeded-claim-context';

export type OfficeSeededAgent = {
  email: string;
};

type PrivacyFixtureContext = {
  claimCompanyName: string;
  claimDocumentName: string;
  claimTitle: string;
  /** Opts the tenant into the sponsored roster import (OD-18 Option B: dark by default). */
  enableSponsoredImport: () => Promise<void>;
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
      ? E2E_USERS.MK_AGENT_BALKAN.email
      : E2E_USERS.KS_AGENT_INACTIVE_LINK.email,
  };
}

// Projects that share a tenant (gate-mk-mk and gate-mk-contract) may run this fixture concurrently.
// Each run snapshots and restores shared rows (the agent tier, the tenant's import setting), so a
// session-held advisory lock serializes runs per tenant from the snapshot through the restore. The
// transaction only holds the lock: every fixture write commits on its own so the app sees it, and a
// killed worker's connection drops the lock with it.
export async function withGroupAccessPrivacyFixture(
  testInfo: TestInfo,
  run: (context: PrivacyFixtureContext) => Promise<void>
) {
  const lockKey = `e2e-group-access-privacy:${isMkProject(testInfo) ? 'mk' : 'ks'}`;
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    await runGroupAccessPrivacyFixture(testInfo, run);
  });
}

async function runGroupAccessPrivacyFixture(
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
  const importSettingScope = and(
    eq(tenantSettings.tenantId, tenantId),
    eq(tenantSettings.category, 'acquisition'),
    eq(tenantSettings.key, 'sponsored_import')
  );
  const previousImportSetting = await db.query.tenantSettings.findFirst({
    where: importSettingScope,
    columns: { value: true },
  });
  let importSettingWritten = false;
  const enableSponsoredImport = async () => {
    importSettingWritten = true;
    await db
      .insert(tenantSettings)
      .values({
        id: `e2e-ga04-import-${suffix}`,
        tenantId,
        category: 'acquisition',
        key: 'sponsored_import',
        value: { enabled: true },
      })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.category, tenantSettings.key],
        set: { value: { enabled: true }, updatedAt: new Date() },
      });
  };

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
      enableSponsoredImport,
      internalHistoryNote,
      officeAgent,
      seededMemberName,
    });
  } finally {
    if (importSettingWritten && previousImportSetting) {
      await db
        .update(tenantSettings)
        .set({ value: previousImportSetting.value, updatedAt: new Date() })
        .where(importSettingScope);
    } else if (importSettingWritten) {
      await db.delete(tenantSettings).where(importSettingScope);
    }
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
