import { db, eq, user } from '@interdomestik/database';
import type { TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fixtureLegalAcceptance, type FixtureMember } from './legal-acceptance.fixture';

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
  const member = {
    id: `${memberPrefix}-${suffix}`,
    tenantId,
    email: `${emailPrefix}.${suffix}@example.test`,
  };

  await db.insert(user).values({
    ...member,
    tenantClassificationPending: true,
    name: `${namePrefix} ${testInfo.project.name}`,
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

  try {
    await fixtureLegalAcceptance('seed', [member]);
    return member;
  } catch (error) {
    await resetPendingTenantClassificationMember(member);
    throw error;
  }
}

export async function resetPendingTenantClassificationMember(member: FixtureMember) {
  await fixtureLegalAcceptance('clean', [member]);
  await db.delete(user).where(eq(user.id, member.id));
}
