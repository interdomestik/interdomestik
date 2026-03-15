import {
  E2E_PASSWORD,
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
import { ipForRole } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';

type OfficeSeededAgent = {
  email: string;
};

function isMkProject(testInfo: import('@playwright/test').TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

function getOfficeSeededAgent(testInfo: import('@playwright/test').TestInfo): OfficeSeededAgent {
  if (isMkProject(testInfo)) {
    return {
      email: 'agent.balkan.1@interdomestik.com',
    };
  }

  return {
    email: 'agent.ks.b1@interdomestik.com',
  };
}

async function loginAsOfficeSeededAgent(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  officeAgent: OfficeSeededAgent
) {
  const baseUrl = testInfo.project.use.baseURL?.toString() ?? '';
  const origin = new URL(baseUrl).origin;
  const loginURL = `${origin}/api/auth/sign-in/email`;
  const projectHeaders = testInfo.project.use.extraHTTPHeaders;

  const response = await page.request.post(loginURL, {
    data: { email: officeAgent.email, password: E2E_PASSWORD },
    headers: {
      Origin: origin,
      Referer: `${origin}/login`,
      'x-forwarded-for': ipForRole('agent'),
      ...projectHeaders,
    },
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`API login failed for ${officeAgent.email}: ${response.status()} ${text}`);
  }
}

test.describe('Group access privacy', () => {
  test('office group access stays aggregate-only without explicit member consent', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    const officeAgent = getOfficeSeededAgent(testInfo);
    const seededMember = isMkProject(testInfo) ? E2E_USERS.MK_MEMBER : E2E_USERS.KS_MEMBER;
    const { claimId, currentStatus, staffId, tenantId } = await resolveSeededClaimContext(testInfo);

    const agentRecord = await db.query.user.findFirst({
      where: eq(user.email, officeAgent.email),
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

    if (!agentRecord?.id) {
      throw new Error(`Expected seeded office-capable agent for ${officeAgent.email}`);
    }

    if (!claimRecord?.title || !claimRecord.companyName) {
      throw new Error(`Expected seeded claim details for ${claimId}`);
    }

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

      await loginAsOfficeSeededAgent(page, testInfo, officeAgent);
      await gotoApp(page, routes.agentImport(testInfo), testInfo, {
        marker: 'group-dashboard-summary',
      });

      await expect(page.getByTestId('group-dashboard-summary')).toBeVisible();
      await expect(page.getByText('Aggregate group access dashboard')).toBeVisible();
      await expect(
        page.getByText(
          'This view stays aggregate-only. No claim facts, notes, or documents are visible here without explicit member consent.'
        )
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Open cases' })).toBeVisible();

      await expect(page.getByText(seededMember.name)).toHaveCount(0);
      await expect(page.getByText(claimRecord.title)).toHaveCount(0);
      await expect(page.getByText(claimRecord.companyName)).toHaveCount(0);
      await expect(page.getByText(internalHistoryNote)).toHaveCount(0);
      await expect(page.getByText(claimDocumentName)).toHaveCount(0);
    } finally {
      await db.delete(claimDocuments).where(eq(claimDocuments.id, claimDocumentId));
      await db.delete(claimStageHistory).where(eq(claimStageHistory.id, internalHistoryId));
      if (tierElevated) {
        if (createdSettings) {
          await db.delete(agentSettings).where(eq(agentSettings.id, settingsId));
        } else {
          await db
            .update(agentSettings)
            .set({ tier: previousTier, updatedAt: new Date() })
            .where(eq(agentSettings.id, settingsId));
        }
      }
    }
  });
});
