import { claimMessages, claims, db, user } from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import type { TestInfo } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';

export async function withMemberMessageFixture<T>(
  info: TestInfo,
  run: (fixture: {
    claimId: string;
    deniedIds: string[];
    memberId: string;
    staffId: string;
    tenantId: string;
    messageIds: string[];
  }) => Promise<T>
): Promise<T> {
  const seed = await resolveSeededClaimContext(info);
  const prefix = `member-comms-${randomUUID()}`;
  const otherMemberId = `${prefix}-other-member`;
  const claimIds = ['owned', 'other-member', 'other-tenant'].map(name => `${prefix}-${name}`);
  const foreignTenant = seed.tenantId === 'tenant_ks' ? 'tenant_mk' : 'tenant_ks';
  const staff = await db.query.user.findFirst({ where: eq(user.id, seed.staffId) });
  const messageIds = ['public', 'internal', 'unspecified', 'foreign', 'other'].map(
    name => `${prefix}-${name}`
  );
  try {
    await db.insert(user).values({
      id: otherMemberId,
      tenantId: seed.tenantId,
      name: 'Synthetic other member',
      email: `${otherMemberId}@example.com`,
      role: 'member',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(claims).values(
      claimIds.map((id, index) => ({
        id,
        tenantId: index === 2 ? foreignTenant : seed.tenantId,
        userId: index === 1 ? otherMemberId : seed.memberId,
        staffId: seed.staffId,
        branchId: staff?.branchId,
        title: id,
        claimNumber: id,
        companyName: 'Synthetic case communication',
        category: 'vehicle',
        ...claimLifecycleFieldsForStatus('submitted'),
      }))
    );
    await db.insert(claimMessages).values(
      messageIds.map((id, index) => ({
        id,
        claimId: index === 4 ? claimIds[1] : claimIds[0],
        tenantId: index === 3 ? foreignTenant : seed.tenantId,
        senderId: seed.staffId,
        content: index === 0 ? 'Your case update is available.' : `Private sentinel ${id}`,
        isInternal: [false, true, null, false, false][index],
      }))
    );
    return await run({ ...seed, claimId: claimIds[0], deniedIds: claimIds.slice(1), messageIds });
  } finally {
    await db.delete(claimMessages).where(inArray(claimMessages.claimId, claimIds));
    await db.delete(claims).where(inArray(claims.id, claimIds));
    await db.delete(user).where(eq(user.id, otherMemberId));
  }
}
