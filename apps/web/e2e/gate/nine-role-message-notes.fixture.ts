import {
  claimMessages,
  claims,
  claimStageHistory,
  dbAdmin,
  E2E_CASE_FIXTURES,
  E2E_USER_IDS,
} from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import { and, eq, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { MessageCaseKey } from './nine-role-message-access.cases';

export type MessageSentinelClaim = Readonly<{
  claimId: string;
  messages: readonly string[];
  notes: readonly string[];
}>;

/** Own every written claim/message/history id; catalogue rows supply read-only scope metadata. */
export async function withClaimNoteSentinels<T>(
  scopes: Readonly<{ own: MessageCaseKey; foreign: MessageCaseKey }>,
  run: (
    fixtures: Readonly<{ own: MessageSentinelClaim; foreign: MessageSentinelClaim }>
  ) => Promise<T>
): Promise<T> {
  const fixtures = [scopes.own, scopes.foreign].map(key => {
    const scope = E2E_CASE_FIXTURES[key];
    const claimId = `d1c-message-${randomUUID()}`;
    const staffId = scope.tenantId === 'tenant_ks' ? E2E_USER_IDS.KS_STAFF : E2E_USER_IDS.MK_STAFF;
    const messages = [false, true].map((isInternal, index) => ({
      id: `${claimId}-message-${index}`,
      tenantId: scope.tenantId,
      claimId,
      senderId: staffId,
      isInternal,
      content: `${claimId}-${isInternal ? 'internal' : 'public'}-MESSAGE-SENTINEL`,
      createdAt: new Date(),
    }));
    const notes = [true, false].map((isPublic, index) => ({
      id: `${claimId}-history-${index}`,
      tenantId: scope.tenantId,
      claimId,
      fromStatus: 'submitted' as const,
      toStatus: 'verification' as const,
      isPublic,
      note: `${claimId}-${isPublic ? 'public' : 'private'}-NOTE-SENTINEL`,
      changedByRole: 'staff',
      createdAt: new Date(),
    }));
    return { scope, claimId, messages, notes };
  });
  try {
    await dbAdmin.insert(claims).values(
      fixtures.map(({ scope, claimId }) => ({
        id: claimId,
        tenantId: scope.tenantId,
        accessTenantId: scope.tenantId,
        branchId: scope.branchId,
        userId: scope.ownerUserId,
        staffId: scope.staffId,
        agentId: scope.agentId,
        title: claimId,
        claimNumber: claimId,
        category: 'vehicle',
        companyName: 'Synthetic communication fixture',
        ...claimLifecycleFieldsForStatus('verification'),
      }))
    );
    await dbAdmin.insert(claimMessages).values(fixtures.flatMap(fixture => fixture.messages));
    await dbAdmin.insert(claimStageHistory).values(fixtures.flatMap(fixture => fixture.notes));
    const probes = fixtures.map(fixture => ({
      claimId: fixture.claimId,
      messages: fixture.messages.map(row => row.content),
      notes: fixture.notes.map(row => row.note),
    }));
    return await run({ own: probes[0], foreign: probes[1] });
  } finally {
    // Delete all owned children before their parents; retain each tenant/claim predicate pair.
    await dbAdmin
      .delete(claimMessages)
      .where(
        or(
          ...fixtures.map(({ scope, claimId }) =>
            and(eq(claimMessages.tenantId, scope.tenantId), eq(claimMessages.claimId, claimId))
          )
        )
      );
    await dbAdmin
      .delete(claimStageHistory)
      .where(
        or(
          ...fixtures.map(({ scope, claimId }) =>
            and(
              eq(claimStageHistory.tenantId, scope.tenantId),
              eq(claimStageHistory.claimId, claimId)
            )
          )
        )
      );
    await dbAdmin
      .delete(claims)
      .where(
        or(
          ...fixtures.map(({ scope, claimId }) =>
            and(eq(claims.tenantId, scope.tenantId), eq(claims.id, claimId))
          )
        )
      );
  }
}
