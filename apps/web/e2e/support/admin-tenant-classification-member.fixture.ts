import { db, dbAdmin, eq, user } from '@interdomestik/database';
import type { TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export async function preparePendingTenantClassificationMember(params: {
  memberPrefix: string;
  namePrefix: string;
  emailPrefix: string;
  role: 'member' | 'user';
  tenantId: string;
  testInfo: TestInfo;
}) {
  const { memberPrefix, namePrefix, emailPrefix, role, tenantId, testInfo } = params;
  const suffix = `${testInfo.project.name}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const memberId = `${memberPrefix}-${suffix}`;

  await db.insert(user).values({
    id: memberId,
    tenantId,
    tenantClassificationPending: true,
    name: `${namePrefix} ${testInfo.project.name}`,
    email: `${emailPrefix}.${suffix}@interdomestik.test`,
    emailVerified: true,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    agentId: null,
    branchId: null,
    createdBy: 'self',
    assistedByAgentId: null,
    memberNumber: null,
    memberNumberIssuedAt: null,
  });

  return memberId;
}

export async function resetPendingTenantClassificationMember(memberId: string) {
  await db.delete(user).where(eq(user.id, memberId));
}
