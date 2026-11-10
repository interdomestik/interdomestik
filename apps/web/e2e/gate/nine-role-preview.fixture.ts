import {
  auditLog,
  dbAdmin,
  E2E_CASE_FIXTURES,
  E2E_USER_IDS,
  supportHandoffs,
} from '@interdomestik/database';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { and, eq, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { MessageCaseKey } from './nine-role-message-access.cases';
import { withClaimNoteSentinels } from './nine-role-message-notes.fixture';

export type PreviewFixture = Readonly<{
  handoffId: string;
  attemptId: string;
  email: string;
  handoffSentinels: readonly string[];
  verificationSentinels: readonly string[];
  contentSearch: string;
  deniedHandoffIds: readonly string[];
}>;

/** Every write targets UUID-owned rows; catalogue claims and people supply read-only relationships. */
export async function withPreviewSentinels<T>(
  key: MessageCaseKey,
  run: (fixture: PreviewFixture) => Promise<T>
): Promise<T> {
  const scope = E2E_CASE_FIXTURES[key];
  const foreignKey = scope.tenantId === 'tenant_ks' ? 'MK_FOREIGN_TENANT' : 'KS_ANCHOR';
  return await withClaimNoteSentinels({ own: key, foreign: foreignKey }, async claims => {
    const prefix = `d1c2-${randomUUID()}`;
    const handoffId = `${prefix}-handoff`;
    const leadId = `${prefix}-lead`;
    const attemptId = `${prefix}-attempt`;
    const auditId = `${prefix}-audit`;
    const email = `${prefix}@example.test`;
    const handoffSentinels = [
      'SUBJECT',
      'MESSAGE',
      'PUBLIC-RESPONSE',
      'MEMBER-REPLY',
      'REASSIGN',
      'CLOSURE',
    ].map(kind => `${kind}-${randomUUID()}-SENTINEL`);
    const verificationSentinels = [
      `NOTE-${randomUUID()}-SENTINEL`,
      `EVENT-${randomUUID()}-SENTINEL`,
    ];
    const otherBranch =
      scope.tenantId === 'tenant_ks'
        ? E2E_CASE_FIXTURES.KS_OTHER_BRANCH
        : { ...scope, branchId: 'mk_branch_b' };
    const handoffScopes = [scope, otherBranch, E2E_CASE_FIXTURES[foreignKey]];
    const handoffIds = handoffScopes.map((_, index) =>
      index === 0 ? handoffId : `${prefix}-denied-${index}`
    );
    try {
      await dbAdmin.insert(supportHandoffs).values(
        handoffScopes.map((relationship, index) => ({
          id: handoffIds[index],
          tenantId: relationship.tenantId,
          branchId: relationship.branchId,
          memberId: relationship.ownerUserId,
          claimId: index === 0 ? claims.own.claimId : null,
          subject: handoffSentinels[0],
          message: handoffSentinels[1],
          status: 'accepted',
          urgency: 'normal',
          trustRisk: 'low',
          staffId: null,
          acceptedAt: new Date(),
          publicResponse: handoffSentinels[2],
          publicResponseAt: new Date(),
          publicResponseVersion: 1,
          memberReply: handoffSentinels[3],
          memberReplyAt: new Date(),
          memberReplyResponseVersion: 1,
          reassignReason: handoffSentinels[4],
          closeReason: handoffSentinels[5],
        }))
      );
      const agentId =
        scope.tenantId === 'tenant_ks' ? E2E_USER_IDS.KS_AGENT : E2E_USER_IDS.MK_AGENT;
      await dbAdmin.insert(memberLeads).values({
        id: leadId,
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        agentId,
        firstName: prefix,
        lastName: 'Synthetic',
        email,
        phone: '+000000000',
        status: 'payment_pending',
        consentNoticeVersion: 'e2e-agent-notice-v1',
        consentCapturedAt: new Date(),
        consentCapturedBy: agentId,
        captureChannel: 'agent_assisted',
      });
      await dbAdmin.insert(leadPaymentAttempts).values({
        id: attemptId,
        tenantId: scope.tenantId,
        leadId,
        method: 'cash',
        status: 'rejected',
        amount: 1000,
        currency: 'EUR',
        verificationNote: verificationSentinels[0],
      });
      await dbAdmin.insert(auditLog).values({
        id: auditId,
        tenantId: scope.tenantId,
        action: 'PAYMENT_REJECT',
        actorRole: 'staff',
        entityType: 'payment_attempt',
        entityId: attemptId,
        metadata: { note: verificationSentinels[1] },
      });
      return await run({
        handoffId,
        attemptId,
        email,
        handoffSentinels,
        verificationSentinels,
        contentSearch: handoffSentinels[1],
        deniedHandoffIds: handoffIds.slice(1),
      });
    } finally {
      await dbAdmin
        .delete(auditLog)
        .where(and(eq(auditLog.tenantId, scope.tenantId), eq(auditLog.id, auditId)));
      await dbAdmin
        .delete(leadPaymentAttempts)
        .where(
          and(
            eq(leadPaymentAttempts.tenantId, scope.tenantId),
            eq(leadPaymentAttempts.id, attemptId)
          )
        );
      await dbAdmin
        .delete(memberLeads)
        .where(and(eq(memberLeads.tenantId, scope.tenantId), eq(memberLeads.id, leadId)));
      await dbAdmin
        .delete(supportHandoffs)
        .where(
          or(
            ...handoffScopes.map((relationship, index) =>
              and(
                eq(supportHandoffs.tenantId, relationship.tenantId),
                eq(supportHandoffs.id, handoffIds[index])
              )
            )
          )
        );
    }
  });
}
