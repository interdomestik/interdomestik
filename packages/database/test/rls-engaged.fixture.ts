import { randomUUID } from 'node:crypto';

import { claimLifecycleFieldsForStatus } from '../src/claim-lifecycle';
import { claims, crmTaskHistory, crmTasks, domainEvents, user } from '../src/schema';

export const KS_TENANT_ID = 'tenant_ks';
export const MK_TENANT_ID = 'tenant_mk';

export function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export async function seedRlsEngagement(
  dbAdmin: (typeof import('../src/db'))['dbAdmin'],
  fixtures: {
    ksUserId: string;
    mkUserId: string;
    claimId: string;
    taskId: string;
    historyId: string;
    eventId: string;
    mkEventId: string;
    now: Date;
  }
): Promise<void> {
  const { ksUserId, mkUserId, claimId, taskId, historyId, eventId, mkEventId, now } = fixtures;

  await dbAdmin.insert(user).values([
    {
      id: ksUserId,
      tenantId: KS_TENANT_ID,
      name: 'RLS Test KS User',
      email: `${ksUserId}@example.test`,
      emailVerified: true,
      role: 'member',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: mkUserId,
      tenantId: MK_TENANT_ID,
      name: 'RLS Test MK User',
      email: `${mkUserId}@example.test`,
      emailVerified: true,
      role: 'member',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await dbAdmin.insert(claims).values({
    id: claimId,
    tenantId: KS_TENANT_ID,
    userId: ksUserId,
    title: 'RLS isolation proof',
    description: 'cross-tenant row must not leak',
    category: 'property',
    companyName: 'RLS Test Co',
    ...claimLifecycleFieldsForStatus('draft'),
    origin: 'portal',
  });

  await dbAdmin.insert(crmTasks).values({
    assignedActorId: ksUserId,
    assignedBranchId: null,
    assignedKind: 'actor',
    assignedRole: 'agent',
    assignedTeamId: null,
    assignedTenantId: KS_TENANT_ID,
    branchId: null,
    createReasonCode: 'manual',
    createdAt: now,
    createdById: ksUserId,
    createdByRole: 'admin',
    dueAt: null,
    id: taskId,
    idempotencyKey: null,
    priority: 'normal',
    status: 'pending',
    subjectId: 'rls-subject',
    subjectKind: 'lead',
    tenantId: KS_TENANT_ID,
    updatedAt: now,
  });

  await dbAdmin.insert(crmTaskHistory).values({
    actorId: ksUserId,
    actorRole: 'admin',
    event: 'created',
    fromStatus: null,
    id: historyId,
    occurredAt: now,
    reasonCode: 'manual',
    taskId,
    tenantId: KS_TENANT_ID,
    toStatus: 'pending',
  });

  await dbAdmin.insert(domainEvents).values({
    actorId: ksUserId,
    actorRole: 'admin',
    aggregateVersion: 1,
    correlationId: uniqueId('rls_correlation'),
    entityId: claimId,
    entityType: 'claim',
    eventName: 'claim.rls_tested',
    eventVersion: 1,
    id: eventId,
    payload: {},
    tenantId: KS_TENANT_ID,
  });

  await dbAdmin.insert(domainEvents).values({
    actorId: mkUserId,
    actorRole: 'admin',
    aggregateVersion: 1,
    correlationId: uniqueId('rls_correlation'),
    entityId: mkUserId,
    entityType: 'user',
    eventName: 'user.rls_tested',
    eventVersion: 1,
    id: mkEventId,
    payload: {},
    tenantId: MK_TENANT_ID,
  });
}
