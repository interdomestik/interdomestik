import { E2E_DISCOVERY_THREADS } from '../../../database/src/e2e-communication-fixtures';
import { E2E_DISCOVERY_SEED_BASE_TIME } from '../../../database/src/e2e-document-fixtures';
import {
  E2E_AGENT_LINK_FIXTURES,
  E2E_CASE_FIXTURES,
  E2E_USER_IDS,
} from '../../../database/src/e2e-role-fixtures';
import { E2E_USERS, type E2EUserKey } from '../../../database/src/e2e-users';
import { createMutationCopy } from '../../../database/src/testing/mutation-copy';

export function messageCatalogueCopy(runId: string, workerId: string) {
  const copy = createMutationCopy({ runId, workerId, scenario: 'message-replay' });
  const source = E2E_CASE_FIXTURES.KS_ANCHOR;
  const createdAt = new Date(E2E_DISCOVERY_SEED_BASE_TIME);
  const homeTenantId = copy.id(source.tenantId);
  const otherTenantId = copy.id(E2E_CASE_FIXTURES.MK_FOREIGN_TENANT.tenantId);
  const thread = E2E_DISCOVERY_THREADS.KS_ANCHOR;
  const ids = {
    member: copy.id(source.ownerUserId),
    otherMember: copy.id(E2E_USER_IDS.KS_MEMBER_A2),
    staff: copy.id(source.staffId),
    agent: copy.id(source.agentId),
    claim: copy.id(source.id),
    agentBranch: copy.id(source.branchId),
    otherBranch: copy.id(E2E_CASE_FIXTURES.KS_OTHER_BRANCH.branchId),
    link: copy.id(E2E_AGENT_LINK_FIXTURES.KS_ACTIVE.id),
    public: copy.id(thread.STAFF_REPLY.row.id),
    internal: copy.id(thread.INTERNAL_NOTE.row.id),
  };
  const users = (['KS_MEMBER', 'KS_MEMBER_A2', 'KS_STAFF', 'KS_AGENT'] as const).map(
    (key: E2EUserKey) => {
      const actor = E2E_USERS[key];
      return copy.row({
        id: E2E_USER_IDS[key],
        role: actor.dbRole,
        tenantId: homeTenantId,
        email: copy.email(actor.email),
        emailVerified: true,
        name: actor.name,
        branchId: key === 'KS_AGENT' ? ids.agentBranch : null,
        createdAt,
        updatedAt: createdAt,
      });
    }
  );
  const messages = [thread.STAFF_REPLY.row, thread.INTERNAL_NOTE.row].map(row => ({
    ...copy.row(row),
    tenantId: homeTenantId,
    claimId: ids.claim,
    senderId: ids.staff,
  }));
  return {
    ids,
    homeTenantId,
    otherTenantId,
    users,
    claim: {
      id: ids.claim,
      userId: ids.member,
      tenantId: homeTenantId,
      staffId: ids.staff,
      branchId: ids.agentBranch,
      category: 'retail',
      companyName: 'Synthetic Co',
      caseLifecycleState: 'submitted' as const,
      description: 'Isolated catalogue message regression',
      origin: 'portal' as const,
      title: 'Synthetic message case',
    },
    link: {
      ...copy.row(E2E_AGENT_LINK_FIXTURES.KS_ACTIVE),
      tenantId: homeTenantId,
      agentId: ids.agent,
      memberId: ids.member,
    },
    messages: messages.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt),
      readAt: row.readAt ? new Date(row.readAt) : null,
    })),
  };
}
